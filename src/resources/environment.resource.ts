import { storage } from '../storage/index.js';
import type { Resource } from '../types/resource.js';
import type { InsomniaEnvironment } from '../types/environment.js';

export const environmentResources: Resource[] = [
    {
        uri: 'insomnia://environments',
        name: 'Environments',
        description: 'List environment variables per collection. Can be filtered with ?collectionId={id}',
        mimeType: 'application/json',
        handler: async (request) => {
            const allEnvironments: Array<{
                id: string;
                collectionId: string;
                collectionName: string;
                name: string;
                description?: string;
                variableCount: number;
                variables: Array<{
                    key: string;
                    value: string | number | boolean;
                    type: string;
                }>;
                isPrivate: boolean;
                created: string;
                modified: string;
            }> = [];
            const uri = request.params.uri;
            const url = new URL(uri);
            const collectionIdFilter = url.searchParams.get('collectionId');

            const collections = collectionIdFilter
                ? new Map([[collectionIdFilter, storage.getCollection(collectionIdFilter)]])
                : storage.getAllCollections();

            for (const [collectionId, structure] of collections.entries()) {
                if (!structure) continue;

                const environments = structure.environments.map((env: InsomniaEnvironment) => ({
                    id: env._id,
                    collectionId,
                    collectionName: structure.workspace.name,
                    name: env.name,
                    description: env.description,
                    variableCount: Object.keys(env.data).length,
                    variables: Object.entries(env.data).map(([key, value]) => ({
                        key,
                        value:
                            typeof value === 'string' && value.length > 100 ? `${value.substring(0, 100)}...` : value,
                        type: typeof value,
                    })),
                    isPrivate: env.isPrivate || false,
                    created: new Date(env.created).toISOString(),
                    modified: new Date(env.modified).toISOString(),
                }));

                allEnvironments.push(...environments);
            }

            return {
                contents: [
                    {
                        type: 'text',
                        text: JSON.stringify(allEnvironments, null, 2),
                    },
                ],
            };
        },
    },
];
