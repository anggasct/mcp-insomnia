import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeBackup, type BackupEntry } from './backup.js';

function tmpBackupDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), `mcp-backup-${randomUUID().slice(0, 8)}-`));
}

const dirs: string[] = [];

function newDir(): string {
    const d = tmpBackupDir();
    dirs.push(d);
    return d;
}

afterEach(() => {
    for (const d of dirs.splice(0)) {
        fs.rmSync(d, { recursive: true, force: true });
    }
});

function readManifest(dir: string): { backups: BackupEntry[] } {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8')) as { backups: BackupEntry[] };
}

function listBackupJson(dir: string): string[] {
    return fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('backup-') && f.endsWith('.json'));
}

const SAMPLE_RESOURCES = [{ _id: 'wrk_1', _type: 'workspace', name: 'C' }];

describe('writeBackup', () => {
    it('writes an atomic v4 snapshot + sha256 sidecar + manifest entry', () => {
        const dir = newDir();
        const now = new Date('2026-08-12T09:15:00.000Z');

        const result = writeBackup({ backupDir: dir, collectionId: 'wrk_1', resources: SAMPLE_RESOURCES, now });

        const finalPath = path.join(dir, result.file);
        expect(fs.existsSync(finalPath)).toBe(true);
        expect(fs.existsSync(`${finalPath}.sha256`)).toBe(true);
        expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true);
        expect(result.docCount).toBe(1);
        expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(result.retentionPurgedCount).toBe(0);
        expect(listBackupJson(dir)).toHaveLength(1);
    });

    it('produces a valid v4 export whose checksum matches the sidecar', () => {
        const dir = newDir();
        const now = new Date('2026-08-12T09:15:00.000Z');

        const result = writeBackup({ backupDir: dir, collectionId: 'wrk_1', resources: SAMPLE_RESOURCES, now });

        const finalPath = path.join(dir, result.file);
        const body = fs.readFileSync(finalPath, 'utf-8');
        const parsed = JSON.parse(body) as Record<string, unknown>;
        expect(parsed._type).toBe('export');
        expect(parsed.__export_format).toBe(4);
        expect(Array.isArray(parsed.resources)).toBe(true);
        expect(parsed.__export_source).toBe('mcp-insomnia-backup');

        const actualSha = createHash('sha256').update(body).digest('hex');
        expect(actualSha).toBe(result.sha256);

        const sidecar = fs.readFileSync(`${finalPath}.sha256`, 'utf-8').trim();
        expect(sidecar).toBe(`${result.sha256}  ${result.file}`);
    });

    it('keeps at most maxCount per collectionId', () => {
        const dir = newDir();
        const base = new Date('2026-08-12T09:15:00.000Z').getTime();

        for (let i = 0; i < 12; i++) {
            writeBackup({
                backupDir: dir,
                collectionId: 'wrk_1',
                resources: SAMPLE_RESOURCES,
                now: new Date(base + i * 60_000),
                maxCount: 10,
                maxAgeDays: 365,
            });
        }

        const files = listBackupJson(dir);
        expect(files).toHaveLength(10);
        const manifest = readManifest(dir);
        expect(manifest.backups).toHaveLength(10);
        expect(manifest.backups.map((e) => e.file).sort()).toEqual([...files].sort());
    });

    it('purges backups older than maxAgeDays and keeps manifest aligned with disk', () => {
        const dir = newDir();
        const now = new Date('2026-08-12T09:15:00.000Z');
        const old = new Date(now.getTime() - 40 * 86_400_000);

        writeBackup({ backupDir: dir, collectionId: 'wrk_1', resources: SAMPLE_RESOURCES, now: old, maxCount: 10, maxAgeDays: 30 });
        const result = writeBackup({ backupDir: dir, collectionId: 'wrk_1', resources: SAMPLE_RESOURCES, now, maxCount: 10, maxAgeDays: 30 });

        const files = listBackupJson(dir);
        expect(files).toHaveLength(1);
        expect(result.retentionPurgedCount).toBe(1);
        const manifest = readManifest(dir);
        expect(manifest.backups).toHaveLength(1);
        expect(manifest.backups[0].file).toEqual(files[0]);
    });

    it('is atomic: a failed rename leaves no final .json and throws', () => {
        const dir = newDir();
        const now = new Date('2026-08-12T09:15:00.000Z');

        expect(() =>
            writeBackup({
                backupDir: dir,
                collectionId: 'wrk_1',
                resources: SAMPLE_RESOURCES,
                now,
                renameSync: () => {
                    throw new Error('simulated rename failure');
                },
            }),
        ).toThrow(/rename/);

        expect(listBackupJson(dir)).toHaveLength(0);
        const tmps = fs.readdirSync(dir).filter((f) => f.endsWith('.json.tmp'));
        expect(tmps.length).toBe(1);
    });
});
