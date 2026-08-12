import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { InsomniaStorage, type InsomniaRequestRaw } from './insomnia-storage.js';

function writeDb(dir: string, filename: string, records: unknown[]): void {
    fs.writeFileSync(
        path.join(dir, filename),
        records.map((r) => JSON.stringify(r)).join('\n') + '\n',
        'utf-8',
    );
}

describe('InsomniaStorage NeDB hardening', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    function makeStorage(records: {
        workspaces?: unknown[];
        requests?: unknown[];
        folders?: unknown[];
        environments?: unknown[];
    }): InsomniaStorage {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-insomnia-'));
        tempDirs.push(dir);
        writeDb(dir, 'insomnia.Workspace.db', records.workspaces || []);
        writeDb(dir, 'insomnia.Request.db', records.requests || []);
        writeDb(dir, 'insomnia.RequestGroup.db', records.folders || []);
        writeDb(dir, 'insomnia.Environment.db', records.environments || []);
        return new InsomniaStorage(dir);
    }

    const baseRequest = {
        type: 'Request' as const,
        parentId: 'wrk_1',
        created: 1,
        description: '',
        method: 'GET',
        body: {},
        parameters: [],
        headers: [],
        authentication: {},
        metaSortKey: -1,
        isPrivate: false,
        settingStoreCookies: true,
        settingSendCookies: true,
        settingDisableRenderRequestBody: false,
        settingEncodeUrl: true,
        settingRebuildPath: true,
        settingFollowRedirects: 'global',
    };

    it('dedupes NeDB revisions and keeps the last live row in file order', () => {
        const storage = makeStorage({
            workspaces: [
                {
                    _id: 'wrk_1',
                    type: 'Workspace',
                    parentId: 'proj_1',
                    modified: 1,
                    created: 1,
                    name: 'Marketplaces',
                    description: '',
                    scope: 'collection',
                },
            ],
            requests: [
                {
                    ...baseRequest,
                    _id: 'req_1',
                    modified: 10,
                    url: 'https://example.com/old',
                    name: 'Old',
                },
                {
                    ...baseRequest,
                    _id: 'req_1',
                    modified: 20,
                    url: 'https://example.com/new',
                    name: 'New',
                    authentication: null,
                },
            ],
        });

        const requests = storage.getAllRequests();
        expect(requests).toHaveLength(1);
        expect(requests[0].name).toBe('New');
        expect(requests[0].url).toBe('https://example.com/new');

        const collection = storage.getCollection('wrk_1');
        expect(collection?.requests).toHaveLength(1);
        expect(collection?.requests[0].name).toBe('New');
        expect(collection?.requests[0].authentication).toBeUndefined();
    });

    it('prefers later file-order revisions even when modified is older or missing', () => {
        const storage = makeStorage({
            requests: [
                {
                    ...baseRequest,
                    _id: 'req_skew',
                    modified: 100,
                    url: 'https://example.com/first',
                    name: 'First',
                },
                {
                    ...baseRequest,
                    _id: 'req_skew',
                    // clock skew / missing modified must not keep the older file row
                    modified: 1,
                    url: 'https://example.com/second',
                    name: 'Second',
                },
                {
                    ...baseRequest,
                    _id: 'req_skew',
                    url: 'https://example.com/third',
                    name: 'Third',
                },
            ],
        });

        const requests = storage.getAllRequests();
        expect(requests).toHaveLength(1);
        expect(requests[0].name).toBe('Third');
        expect(requests[0].url).toBe('https://example.com/third');
    });

    it('removes soft-deleted NeDB rows', () => {
        const storage = makeStorage({
            requests: [
                {
                    ...baseRequest,
                    _id: 'req_del',
                    modified: 5,
                    url: 'https://example.com',
                    name: 'Gone',
                },
                { _id: 'req_del', $$deleted: true },
            ],
        });

        expect(storage.getAllRequests()).toHaveLength(0);
        expect(storage.getRequestById('req_del')).toBeNull();
    });

    it('allows delete then re-create of the same _id in later file rows', () => {
        const storage = makeStorage({
            requests: [
                {
                    ...baseRequest,
                    _id: 'req_recreate',
                    modified: 5,
                    url: 'https://example.com/old',
                    name: 'Old',
                },
                { _id: 'req_recreate', $$deleted: true },
                {
                    ...baseRequest,
                    _id: 'req_recreate',
                    modified: 1,
                    url: 'https://example.com/new',
                    name: 'Recreated',
                },
            ],
        });

        const requests = storage.getAllRequests();
        expect(requests).toHaveLength(1);
        expect(requests[0].name).toBe('Recreated');
        expect(requests[0].url).toBe('https://example.com/new');
    });

    it('assigns unique header pair ids when writing raw requests', () => {
        const storage = makeStorage({});
        const converted = storage.convertRequest({
            ...baseRequest,
            _id: 'req_ids',
            modified: 1,
            url: 'https://example.com',
            name: 'ids',
            headers: [
                { name: 'a', value: '1' },
                { name: 'b', value: '2' },
                { name: 'c', value: '3' },
            ],
        });

        // Force write path through private convert via saveRequest
        storage.saveRequest({
            ...converted,
            headers: [
                { name: 'a', value: '1' },
                { name: 'b', value: '2' },
                { name: 'c', value: '3' },
            ],
            parameters: [],
            modified: Date.now(),
            created: Date.now(),
        });

        const raw = storage.getAllRequests().find((r) => r._id === 'req_ids');
        expect(raw?.headers).toHaveLength(3);
        const ids = (raw?.headers || []).map((h) => h.id);
        expect(new Set(ids).size).toBe(3);
        expect(ids.every((id) => typeof id === 'string' && id.startsWith('pair_'))).toBe(true);
    });

    it('rewrites duplicate or invalid existing header and parameter pair ids', () => {
        const storage = makeStorage({});
        const converted = storage.convertRequest({
            ...baseRequest,
            _id: 'req_dup_ids',
            modified: 1,
            url: 'https://example.com',
            name: 'dup ids',
        });

        storage.saveRequest({
            ...converted,
            headers: [
                { id: 'pair_same', name: 'a', value: '1' },
                { id: 'pair_same', name: 'b', value: '2' },
                { id: '   ', name: 'c', value: '3' },
                { name: 'd', value: '4' },
            ],
            parameters: [
                { id: 'pair_param', name: 'q', value: '1' },
                { id: 'pair_param', name: 'r', value: '2' },
                { id: '', name: 's', value: '3' },
            ],
            modified: Date.now(),
            created: Date.now(),
        });

        const raw = storage.getAllRequests().find((r) => r._id === 'req_dup_ids');
        expect(raw).toBeTruthy();

        const headerIds = (raw?.headers || []).map((h) => h.id);
        expect(headerIds).toHaveLength(4);
        expect(new Set(headerIds).size).toBe(4);
        expect(headerIds[0]).toBe('pair_same');
        expect(headerIds[1]).not.toBe('pair_same');
        expect(headerIds.every((id) => typeof id === 'string' && id.trim().length > 0)).toBe(true);
        expect(headerIds.slice(1).every((id) => typeof id === 'string' && id.startsWith('pair_'))).toBe(
            true,
        );

        const paramIds = (raw?.parameters || []).map((p) => p.id);
        expect(paramIds).toHaveLength(3);
        expect(new Set(paramIds).size).toBe(3);
        expect(paramIds[0]).toBe('pair_param');
        expect(paramIds[1]).not.toBe('pair_param');
        expect(paramIds.every((id) => typeof id === 'string' && id.trim().length > 0)).toBe(true);
    });

    it('converts requests with null headers/parameters/body/authentication', () => {
        const storage = makeStorage({});
        const raw = {
            _id: 'req_nulls',
            type: 'Request',
            parentId: 'wrk_1',
            modified: 1,
            created: 1,
            url: 'https://example.com',
            name: 'Null fields',
            description: '',
            method: 'GET',
            body: null,
            parameters: null,
            headers: null,
            authentication: null,
            metaSortKey: -1,
            isPrivate: false,
            settingStoreCookies: true,
            settingSendCookies: true,
            settingDisableRenderRequestBody: false,
            settingEncodeUrl: true,
            settingRebuildPath: true,
            settingFollowRedirects: 'global',
        } as InsomniaRequestRaw;

        const converted = storage.convertRequest(raw);
        expect(converted.headers).toEqual([]);
        expect(converted.parameters).toEqual([]);
        expect(converted.body).toEqual({ mimeType: undefined, text: undefined });
        expect(converted.authentication).toBeUndefined();
    });
});
