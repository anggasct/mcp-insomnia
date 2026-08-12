import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface BackupEntry {
    id: string;
    file: string;
    sha256: string;
    collectionId: string;
    createdAt: string;
    docCount: number;
    sizeBytes: number;
}

interface Manifest {
    backups: BackupEntry[];
}

export interface WriteBackupArgs {
    backupDir: string;
    collectionId: string;
    resources: unknown[];
    now: Date;
    maxCount?: number;
    maxAgeDays?: number;
    renameSync?: (oldPath: string, newPath: string) => void;
}

export interface WriteBackupResult {
    file: string;
    sha256: string;
    docCount: number;
    sizeBytes: number;
    retentionPurgedCount: number;
}

const DEFAULT_MAX_COUNT = 10;
const DEFAULT_MAX_AGE_DAYS = 30;
const MANIFEST = 'manifest.json';
const MS_PER_DAY = 86400000;

export function defaultBackupDir(): string {
    return process.env.MCP_INSOMNIA_BACKUP_DIR || path.join(os.homedir(), '.mcp-insomnia', 'backups');
}

function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function compactIso(d: Date): string {
    return d.toISOString().replace(/[-:.]/g, '');
}

function fsyncBestEffort(filePath: string): void {
    let fd: number | undefined;
    try {
        fd = fs.openSync(filePath, 'r');
        fs.fsyncSync(fd);
    } catch {
        // best-effort: some filesystems (tmpfs/network) do not support fsync
    } finally {
        if (fd !== undefined) {
            try {
                fs.closeSync(fd);
            } catch {
                // ignore
            }
        }
    }
}

function readManifest(backupDir: string): Manifest {
    const file = path.join(backupDir, MANIFEST);
    if (!fs.existsSync(file)) return { backups: [] };
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<Manifest>;
        return Array.isArray(data.backups) ? { backups: data.backups } : { backups: [] };
    } catch {
        return { backups: [] };
    }
}

function removeBackupFiles(backupDir: string, baseName: string): void {
    for (const name of [baseName, `${baseName}.sha256`]) {
        try {
            fs.unlinkSync(path.join(backupDir, name));
        } catch {
            // best-effort; missing file is fine
        }
    }
}

function applyRetention(
    manifest: Manifest,
    maxCount: number,
    maxAgeDays: number,
    now: Date,
    backupDir: string,
): number {
    const purge = new Set<string>();
    const cutoff = now.getTime() - maxAgeDays * MS_PER_DAY;

    for (const entry of manifest.backups) {
        const t = Date.parse(entry.createdAt);
        if (Number.isFinite(t) && t < cutoff) purge.add(entry.id);
    }

    const byCollection = new Map<string, BackupEntry[]>();
    for (const entry of manifest.backups) {
        if (purge.has(entry.id)) continue;
        const arr = byCollection.get(entry.collectionId) ?? [];
        arr.push(entry);
        byCollection.set(entry.collectionId, arr);
    }
    for (const arr of byCollection.values()) {
        arr.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        for (const entry of arr.slice(maxCount)) purge.add(entry.id);
    }

    const survivors: BackupEntry[] = [];
    let purgedCount = 0;
    for (const entry of manifest.backups) {
        if (purge.has(entry.id)) {
            purgedCount++;
            removeBackupFiles(backupDir, entry.file);
            continue;
        }
        if (fs.existsSync(path.join(backupDir, entry.file))) {
            survivors.push(entry);
        } else {
            purgedCount++;
        }
    }

    manifest.backups = survivors;
    return purgedCount;
}

export function writeBackup(args: WriteBackupArgs): WriteBackupResult {
    const maxCount = args.maxCount ?? envInt('MCP_INSOMNIA_BACKUP_MAX_COUNT', DEFAULT_MAX_COUNT);
    const maxAgeDays = args.maxAgeDays ?? envInt('MCP_INSOMNIA_BACKUP_MAX_AGE_DAYS', DEFAULT_MAX_AGE_DAYS);

    fs.mkdirSync(args.backupDir, { recursive: true });

    const exportObject = {
        _type: 'export',
        __export_format: 4,
        __export_date: args.now.toISOString(),
        __export_source: 'mcp-insomnia-backup',
        resources: args.resources,
    };
    const json = JSON.stringify(exportObject, null, 2);
    const sha256 = createHash('sha256').update(json).digest('hex');
    const sizeBytes = Buffer.byteLength(json, 'utf-8');

    const baseName = `backup-${compactIso(args.now)}-${args.collectionId}.json`;
    const finalPath = path.join(args.backupDir, baseName);
    const tmpPath = `${finalPath}.tmp`;
    const rename = args.renameSync ?? ((oldPath: string, newPath: string) => {
        fs.renameSync(oldPath, newPath);
    });

    fs.writeFileSync(tmpPath, json, 'utf-8');
    fsyncBestEffort(tmpPath);
    rename(tmpPath, finalPath);
    fs.writeFileSync(`${finalPath}.sha256`, `${sha256}  ${baseName}\n`, 'utf-8');

    const entry: BackupEntry = {
        id: randomUUID(),
        file: baseName,
        sha256,
        collectionId: args.collectionId,
        createdAt: args.now.toISOString(),
        docCount: Array.isArray(args.resources) ? args.resources.length : 0,
        sizeBytes,
    };

    const manifest = readManifest(args.backupDir);
    manifest.backups.push(entry);
    const retentionPurgedCount = applyRetention(manifest, maxCount, maxAgeDays, args.now, args.backupDir);
    fs.writeFileSync(path.join(args.backupDir, MANIFEST), JSON.stringify(manifest, null, 2), 'utf-8');

    return { file: baseName, sha256, docCount: entry.docCount, sizeBytes, retentionPurgedCount };
}
