import { storage } from '../storage/index.js';
import type { Resource } from '../types/resource.js';
import type { CollectionStructure, InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';

export const collectionResources: Resource[] = [
    {
        uri: 'insomnia://collections',
        name: 'Collections',
        description: 'List all collections with folder structure',
        mimeType: 'application/json',
        handler: async () => {
            const collections = storage.getAllCollections();
            const result = Array.from(collections.entries()).map(([id, structure]: [string, CollectionStructure]) => ({
                id,
                name: structure.workspace.name,
                description: structure.workspace.description,
                scope: structure.workspace.scope,
                created: new Date(structure.workspace.created).toISOString(),
                modified: new Date(structure.workspace.modified).toISOString(),
                folders: structure.folders.map((folder: InsomniaRequestGroup) => ({
                    id: folder._id,
                    name: folder.name,
                    description: folder.description,
                    parentId: folder.parentId,
                    created: new Date(folder.created).toISOString(),
                    modified: new Date(folder.modified).toISOString(),
                })),
                requestCount: structure.requests.length,
                environmentCount: structure.environments.length,
            }));

            return {
                contents: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    },

    {
        uri: 'insomnia://collection/{id}',
        name: 'Collection Detail',
        description: 'Full details of a specific collection',
        mimeType: 'application/json',
        handler: async (request) => {
            const uri = request.params.uri;
            const collectionId = uri.replace('insomnia://collection/', '');
            const structure = storage.getCollection(collectionId);

            if (!structure) {
                throw new Error(`Collection with ID ${collectionId} not found`);
            }

            const result = {
                workspace: {
                    id: structure.workspace._id,
                    name: structure.workspace.name,
                    description: structure.workspace.description,
                    scope: structure.workspace.scope,
                    created: new Date(structure.workspace.created).toISOString(),
                    modified: new Date(structure.workspace.modified).toISOString(),
                },
                structure: {
                    folders: structure.folders.map((folder: InsomniaRequestGroup) => ({
                        id: folder._id,
                        name: folder.name,
                        description: folder.description,
                        parentId: folder.parentId,
                        requestCount: structure.requests.filter((r: InsomniaRequest) => r.parentId === folder._id)
                            .length,
                    })),
                    requests: structure.requests.map((request: InsomniaRequest) => ({
                        id: request._id,
                        name: request.name,
                        method: request.method,
                        url: request.url,
                        parentId: request.parentId,
                        parentName:
                            request.parentId === collectionId
                                ? 'Root'
                                : (structure.folders.find((f: InsomniaRequestGroup) => f._id === request.parentId)
                                    ?.name ?? 'Unknown'),
                        hasAuth: !!request.authentication,
                        authType: request.authentication?.type,
                    })),
                    environments: structure.environments.map((env: InsomniaEnvironment) => ({
                        id: env._id,
                        name: env.name,
                        variableCount: Object.keys(env.data).length,
                    })),
                },
                statistics: {
                    totalRequests: structure.requests.length,
                    totalFolders: structure.folders.length,
                    totalEnvironments: structure.environments.length,
                    methodBreakdown: structure.requests.reduce((acc: Record<string, number>, req: InsomniaRequest) => {
                        acc[req.method] = (acc[req.method] || 0) + 1;
                        return acc;
                    }, {}),
                    authenticationBreakdown: structure.requests.reduce(
                        (acc: Record<string, number>, req: InsomniaRequest) => {
                            const authType = req.authentication?.type ?? 'none';
                            acc[authType] = (acc[authType] || 0) + 1;
                            return acc;
                        },
                        {},
                    ),
                },
            };

            return {
                contents: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    },
];
