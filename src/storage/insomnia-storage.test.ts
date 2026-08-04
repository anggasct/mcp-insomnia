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

    it('dedupes NeDB revisions and keeps the latest modified row', () => {
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
                    _id: 'req_1',
                    type: 'Request',
                    parentId: 'wrk_1',
                    modified: 10,
                    created: 1,
                    url: 'https://example.com/old',
                    name: 'Old',
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
                },
                {
                    _id: 'req_1',
                    type: 'Request',
                    parentId: 'wrk_1',
                    modified: 20,
                    created: 1,
                    url: 'https://example.com/new',
                    name: 'New',
                    description: '',
                    method: 'GET',
                    body: {},
                    parameters: [],
                    headers: [],
                    authentication: null,
                    metaSortKey: -1,
                    isPrivate: false,
                    settingStoreCookies: true,
                    settingSendCookies: true,
                    settingDisableRenderRequestBody: false,
                    settingEncodeUrl: true,
                    settingRebuildPath: true,
                    settingFollowRedirects: 'global',
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

    it('removes soft-deleted NeDB rows', () => {
        const storage = makeStorage({
            requests: [
                {
                    _id: 'req_del',
                    type: 'Request',
                    parentId: 'wrk_1',
                    modified: 5,
                    created: 1,
                    url: 'https://example.com',
                    name: 'Gone',
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
                },
                { _id: 'req_del', $$deleted: true },
            ],
        });

        expect(storage.getAllRequests()).toHaveLength(0);
        expect(storage.getRequestById('req_del')).toBeNull();
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
