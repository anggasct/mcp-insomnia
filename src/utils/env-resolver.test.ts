import { describe, expect, it } from 'vitest';
import type { CollectionStructure } from '../types/collection.js';
import {
    getCollectionAncestorChain,
    resolveInternalEnvironmentVariables,
} from './env-resolver.js';

const workspaceId = 'wrk_test';

function makeCollection(overrides?: Partial<CollectionStructure>): CollectionStructure {
    return {
        workspace: {
            _id: workspaceId,
            _type: 'workspace',
            name: 'Test',
            scope: 'collection',
            modified: 0,
            created: 0,
        },
        folders: [
            {
                _id: 'fld_parent',
                _type: 'request_group',
                parentId: workspaceId,
                name: 'Parent',
                environment: { folderVar: 'from-folder' },
                modified: 0,
                created: 0,
            },
        ],
        requests: [],
        environments: [
            {
                _id: 'env_base',
                _type: 'environment',
                parentId: workspaceId,
                name: 'Base',
                data: { baseUrl: 'https://api.example.com' },
                modified: 0,
                created: 0,
            },
            {
                _id: 'env_sub',
                _type: 'environment',
                parentId: 'env_base',
                name: 'Staging',
                data: { stage: 'staging' },
                modified: 0,
                created: 0,
            },
        ],
        ...overrides,
    };
}

describe('getCollectionAncestorChain', () => {
    it('walks from folder to workspace', () => {
        const collection = makeCollection();
        const chain = getCollectionAncestorChain('fld_parent', collection);
        expect(chain).toEqual([
            { id: workspaceId, type: 'workspace' },
            { id: 'fld_parent', type: 'folder' },
        ]);
    });
});

describe('resolveInternalEnvironmentVariables', () => {
    it('merges base, sub, folder, and override layers in order', () => {
        const collection = makeCollection();
        const { variables } = resolveInternalEnvironmentVariables({
            collection,
            requestParentId: 'fld_parent',
            environmentId: 'env_sub',
            overrideVariables: { token: 'from-override' },
            legacyEnvironmentVariables: { token: 'from-legacy' },
        });

        expect(variables).toEqual({
            baseUrl: 'https://api.example.com',
            stage: 'staging',
            folderVar: 'from-folder',
            token: 'from-legacy',
        });
    });

    it('preserves legacy-only override when no stored env exists', () => {
        const collection = makeCollection({ environments: [], folders: [] });
        const { variables } = resolveInternalEnvironmentVariables({
            collection,
            requestParentId: workspaceId,
            legacyEnvironmentVariables: { baseUrl: 'https://manual.example.com' },
        });

        expect(variables).toEqual({ baseUrl: 'https://manual.example.com' });
    });

    it('skips unknown environmentId without error', () => {
        const collection = makeCollection();
        const { variables } = resolveInternalEnvironmentVariables({
            collection,
            requestParentId: workspaceId,
            environmentId: 'env_missing',
        });

        expect(variables).toEqual({ baseUrl: 'https://api.example.com' });
    });
});
