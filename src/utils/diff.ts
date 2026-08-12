import { createHash } from 'node:crypto';
import type { CollectionStructure, InsomniaWorkspace, InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';

export type DiffType = 'workspace' | 'request_group' | 'request' | 'environment';

export interface DiffEntry {
    id: string;
    type: DiffType;
    name: string;
}

export interface UpdateDiffEntry extends DiffEntry {
    changedFields: string[];
}

export interface Classification {
    toCreate: DiffEntry[];
    toUpdate: UpdateDiffEntry[];
    toDelete: DiffEntry[];
    unchangedCount: number;
    warnings: string[];
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function stable(value: unknown): Json {
    if (Array.isArray(value)) return value.map(stable);
    if (value !== null && typeof value === 'object') {
        const src = value as Record<string, unknown>;
        const out: { [key: string]: Json } = {};
        for (const key of Object.keys(src).sort()) out[key] = stable(src[key]);
        return out;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return value;
    }
    return null;
}

type Pair = { name: string; value: string; disabled?: boolean; description?: string };

function pairKey(p: Pair): string {
    return JSON.stringify([p.name ?? '', p.value ?? '', p.disabled ?? false, p.description ?? '']);
}

function sortPairs<T extends Pair>(pairs: T[]): T[] {
    return [...pairs].sort((a, b) => {
        const ka = pairKey(a);
        const kb = pairKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

function projectWorkspace(w: InsomniaWorkspace): Json {
    return stable({ name: w.name, description: w.description ?? '', scope: w.scope });
}

function projectRequestGroup(f: InsomniaRequestGroup): Json {
    return stable({
        name: f.name,
        description: f.description ?? '',
        parentId: f.parentId ?? '',
        environment: f.environment ?? {},
    });
}

function projectRequest(r: InsomniaRequest): Json {
    return stable({
        name: r.name,
        description: r.description ?? '',
        parentId: r.parentId ?? '',
        method: r.method,
        url: r.url,
        headers: sortPairs(r.headers).map((h) => ({
            name: h.name,
            value: h.value,
            disabled: h.disabled ?? false,
            description: h.description ?? '',
        })),
        parameters: sortPairs(r.parameters).map((p) => ({
            name: p.name,
            value: p.value,
            disabled: p.disabled ?? false,
            description: p.description ?? '',
        })),
        body: r.body ?? null,
        authentication: r.authentication ?? null,
    });
}

function projectEnvironment(e: InsomniaEnvironment): Json {
    return stable({
        name: e.name,
        parentId: e.parentId ?? '',
        data: e.data ?? {},
        isPrivate: e.isPrivate ?? false,
        color: e.color ?? null,
    });
}

export function fingerprint(proj: Json): string {
    return createHash('sha256').update(JSON.stringify(proj)).digest('hex').slice(0, 16);
}

function changedFields(sourceProj: Json, targetProj: Json): string[] {
    const a = (sourceProj ?? {}) as Record<string, Json>;
    const b = (targetProj ?? {}) as Record<string, Json>;
    const changed: string[] = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changed.push(key);
    }
    return changed.sort();
}

interface ProjectedDoc {
    type: DiffType;
    id: string;
    name: string;
    proj: Json;
}

function projectCollection(c: CollectionStructure): Map<string, ProjectedDoc> {
    const map = new Map<string, ProjectedDoc>();
    const push = (type: DiffType, id: string, name: string, proj: Json) =>
        map.set(`${type}:${id}`, { type, id, name, proj });
    push('workspace', c.workspace._id, c.workspace.name, projectWorkspace(c.workspace));
    for (const f of c.folders) push('request_group', f._id, f.name, projectRequestGroup(f));
    for (const r of c.requests) push('request', r._id, r.name, projectRequest(r));
    for (const e of c.environments) push('environment', e._id, e.name, projectEnvironment(e));
    return map;
}

export function classifyCollection(source: CollectionStructure, target: CollectionStructure | null): Classification {
    const sourceDocs = projectCollection(source);
    const toCreate: DiffEntry[] = [];
    const toUpdate: UpdateDiffEntry[] = [];
    const toDelete: DiffEntry[] = [];
    const warnings: string[] = [];
    let unchangedCount = 0;

    if (!target) {
        for (const d of sourceDocs.values()) toCreate.push({ id: d.id, type: d.type, name: d.name });
        return { toCreate, toUpdate, toDelete, unchangedCount, warnings };
    }

    const targetDocs = projectCollection(target);

    for (const [key, sd] of sourceDocs) {
        const td = targetDocs.get(key);
        const entry: DiffEntry = { id: sd.id, type: sd.type, name: sd.name };
        if (!td) {
            toCreate.push(entry);
        } else if (fingerprint(sd.proj) === fingerprint(td.proj)) {
            unchangedCount++;
        } else {
            toUpdate.push({ ...entry, changedFields: changedFields(sd.proj, td.proj) });
        }
    }

    for (const [key, td] of targetDocs) {
        if (!sourceDocs.has(key)) toDelete.push({ id: td.id, type: td.type, name: td.name });
    }

    if (toDelete.length > 0) {
        warnings.push(
            `${String(toDelete.length)} orphan document(s) present in Insomnia but absent from source; upsert sync will not remove them. A future mirror mode is required to delete orphans.`,
        );
    }

    return { toCreate, toUpdate, toDelete, unchangedCount, warnings };
}
