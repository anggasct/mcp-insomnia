import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage/index.js';
import type { Tool } from '../types/tool.js';
import type {
    CreateCollectionParams,
    InsomniaWorkspace,
    InsomniaRequestGroup,
    CollectionStructure,
    InsomniaCollection,
} from '../types/collection.js';
import * as fs from 'fs';

export const collectionTools: Tool[] = [
    {
        name: 'create_collection',
        description: 'Create a new collection/workspace in Insomnia',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Collection name' },
                description: { type: 'string', description: 'Collection description' },
                scope: { type: 'string', enum: ['collection', 'design'], default: 'collection' },
            },
            required: ['name'],
        },
        handler: async (request) => {
            const params = request.params.arguments as unknown as CreateCollectionParams;
            const workspaceId = `wrk_${uuidv4().replace(/-/g, '')}`;

            const workspace: InsomniaWorkspace = {
                _id: workspaceId,
                _type: 'workspace',
                name: params.name,
                description: params.description || '',
                scope: params.scope || 'collection',
                modified: Date.now(),
                created: Date.now(),
            };

            const collectionStructure: CollectionStructure = {
                workspace,
                folders: [],
                requests: [],
                environments: [],
            };

            storage.saveCollection(workspaceId, collectionStructure);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Collection "${params.name}" created successfully with ID: ${workspaceId}`,
                    },
                ],
            };
        },
    },

    {
        name: 'list_collections',
        description: 'List all collections and their structure',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
            const collections = storage.getAllCollections();
            const result = Array.from(collections.entries()).map(([id, structure]: [string, CollectionStructure]) => ({
                id,
                name: structure.workspace.name,
                description: structure.workspace.description,
                scope: structure.workspace.scope,
                folders: structure.folders.map((f: InsomniaRequestGroup) => ({
                    id: f._id,
                    name: f.name,
                    description: f.description,
                })),
                requestCount: structure.requests.length,
                environmentCount: structure.environments.length,
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    },

    {
        name: 'export_collection',
        description: 'Export collection to JSON (Insomnia V4 format)',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'ID of the collection to export' },
                filePath: { type: 'string', description: 'Output file path (optional)' },
            },
            required: ['collectionId'],
        },
        handler: async (request) => {
            const { collectionId, filePath } = request.params.arguments as { collectionId: string; filePath?: string };
            const collection = storage.getCollection(collectionId);

            if (!collection) {
                throw new Error(`Collection with ID ${collectionId} not found`);
            }

            const exportData: InsomniaCollection = {
                _type: 'export',
                __export_format: 4,
                __export_date: new Date().toISOString(),
                __export_source: 'mcp-insomnia',
                resources: [
                    collection.workspace,
                    ...collection.folders,
                    ...collection.requests,
                    ...collection.environments,
                ],
            };

            const jsonData = JSON.stringify(exportData, null, 2);

            if (filePath) {
                fs.writeFileSync(filePath, jsonData);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Collection exported successfully to: ${filePath}`,
                        },
                    ],
                };
            } else {
                return {
                    content: [
                        {
                            type: 'text',
                            text: jsonData,
                        },
                    ],
                };
            }
        },
    },
];
