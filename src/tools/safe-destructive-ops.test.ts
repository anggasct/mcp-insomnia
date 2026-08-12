import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionStructure, InsomniaWorkspace, InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ToolExecutionContext } from '../types/tool.js';

const state = vi.hoisted(() => ({
    installed: true,
    collections: new Map<string, CollectionStructure>(),
    target: null as CollectionStructure | null,
    workspaces: [] as Array<{ _id: string; parentId: string }>,
    savedWorkspaces: 0,
    savedRequests: 0,
}));

vi.mock('../storage/storage.js', () => ({
    storage: {
        getCollection: (id: string) => state.collections.get(id),
        getAllCollections: () => new Map(state.collections),
        saveCollection: (id: string, c: CollectionStructure) => {
            state.collections.set(id, c);
        },
    },
}));

vi.mock('../storage/insomnia-storage.js', () => ({
    insomniaStorage: {
        isInsomniaInstalled: () => state.installed,
        getNotInstalledMessage: () => 'Insomnia data directory not found.',
        getCollection: () => state.target,
        getAllWorkspaces: () => state.workspaces,
        saveWorkspace: () => {
            state.savedWorkspaces++;
        },
        saveRequestGroup: () => {},
        saveRequest: () => {
            state.savedRequests++;
        },
        saveEnvironment: () => {},
    },
}));

const { insomniaTools } = await import('./insomnia.tools.js');
const { requestTools } = await import('./request.tools.js');

const WS_ID = 'wrk_1';

function ws(): InsomniaWorkspace {
    return { _id: WS_ID, _type: 'workspace', name: 'C', scope: 'collection', modified: 1, created: 1 };
}

function req(id: string, url = 'https://a'): InsomniaRequest {
    return {
        _id: id,
        _type: 'request',
        parentId: WS_ID,
        name: id,
        method: 'GET',
        url,
        headers: [],
        parameters: [],
        modified: 1,
        created: 1,
    } as InsomniaRequest;
}

function fld(id: string): InsomniaRequestGroup {
    return { _id: id, _type: 'request_group', parentId: WS_ID, name: id, modified: 1, created: 1 } as InsomniaRequestGroup;
}

function env(id: string): InsomniaEnvironment {
    return { _id: id, _type: 'environment', parentId: WS_ID, name: id, data: {}, modified: 1, created: 1 } as InsomniaEnvironment;
}

function sourceCollection(): CollectionStructure {
    return { workspace: ws(), folders: [fld('fld_1')], requests: [req('req_1'), req('req_2', 'https://new')], environments: [env('env_1')] };
}

function call(name: string, args: Record<string, unknown>): CallToolRequest {
    return { method: 'tools/call', params: { name, arguments: args } };
}

const ctx: ToolExecutionContext = { signal: new AbortController().signal };

function tool(name: string) {
    const all = [...insomniaTools, ...requestTools];
    const found = all.find((t) => t.name === name);
    if (!found) throw new Error(`tool ${name} not found`);
    return found;
}

async function run(name: string, args: Record<string, unknown>) {
    const res = await tool(name).handler(call(name, args), ctx);
    const entry = res.content[0] as { text: string };
    return JSON.parse(entry.text) as Record<string, unknown>;
}

beforeEach(() => {
    state.installed = true;
    state.collections = new Map<string, CollectionStructure>();
    state.target = null;
    state.workspaces = [];
    state.savedWorkspaces = 0;
    state.savedRequests = 0;
});

describe('preview_sync_to_insomnia', () => {
    it('classifies all source docs as toCreate when target is absent', async () => {
        state.collections.set(WS_ID, sourceCollection());
        state.target = null;

        const out = await run('preview_sync_to_insomnia', { collectionId: WS_ID });

        const summary = out.summary as Record<string, number>;
        expect(summary.toCreate).toBe(5);
        expect(summary.toUpdate).toBe(0);
        expect(summary.toDelete).toBe(0);
        expect(summary.unchanged).toBe(0);
        expect(out.warnings).toEqual([]);
    });

    it('throws when Insomnia is not installed', async () => {
        state.installed = false;
        await expect(run('preview_sync_to_insomnia', { collectionId: WS_ID })).rejects.toThrow(/not found/i);
    });
});

describe('sync_to_insomnia dryRun', () => {
    it('returns the diff and backup plan without writing anything', async () => {
        state.collections.set(WS_ID, sourceCollection());
        state.target = {
            workspace: ws(),
            folders: [],
            requests: [req('req_2', 'https://old')],
            environments: [],
        };

        const out = await run('sync_to_insomnia', { collectionId: WS_ID, dryRun: true, backup: true });

        expect(out.dryRun).toBe(true);
        const summary = out.summary as Record<string, number>;
        expect(summary.toUpdate).toBe(1);
        expect(summary.toCreate).toBe(3); // fld_1 + req_1 + env_1
        expect(out.wouldBackup).not.toBeNull();
        expect(state.savedWorkspaces).toBe(0);
        expect(state.savedRequests).toBe(0);
    });

    it('wouldBackup is null when backup is not requested', async () => {
        state.collections.set(WS_ID, sourceCollection());
        const out = await run('sync_to_insomnia', { collectionId: WS_ID, dryRun: true });
        expect(out.wouldBackup).toBeNull();
    });

    it('throws when Insomnia is not installed', async () => {
        state.collections.set(WS_ID, sourceCollection());
        state.installed = false;
        await expect(run('sync_to_insomnia', { collectionId: WS_ID, dryRun: true })).rejects.toThrow(/not found/i);
    });
});

describe('delete_request dryRun', () => {
    it('returns wouldDelete and leaves the request in place', async () => {
        const c = sourceCollection();
        state.collections.set(WS_ID, c);

        const out = await run('delete_request', { requestId: 'req_1', dryRun: true });

        expect(out.dryRun).toBe(true);
        const would = out.wouldDelete as Record<string, unknown>;
        expect(would.id).toBe('req_1');
        const stored = state.collections.get(WS_ID);
        expect(stored?.requests.find((r) => r._id === 'req_1')).toBeTruthy();
    });

    it('returns success:false for a missing id without throwing', async () => {
        state.collections.set(WS_ID, sourceCollection());
        const out = await run('delete_request', { requestId: 'req_missing', dryRun: true });
        expect(out.success).toBe(false);
        expect(out.error).toBe('not found');
    });
});
