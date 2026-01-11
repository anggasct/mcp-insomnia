import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage/index.js';
import type { Tool } from '../types/tool.js';
import type { InsomniaEnvironment, SetEnvironmentVariableParams } from '../types/environment.js';

export const environmentTools: Tool[] = [
    {
        name: 'set_environment_variable',
        description: 'Set environment variables for a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'ID collection' },
                environmentId: {
                    type: 'string',
                    description: 'Environment ID (optional, will be created if not exists)',
                },
                key: { type: 'string', description: 'Variable name' },
                value: { type: 'string', description: 'Variable value' },
                description: { type: 'string', description: 'Variable description' },
            },
            required: ['collectionId', 'key', 'value'],
        },
        handler: async (request) => {
            const params = request.params.arguments as unknown as SetEnvironmentVariableParams;
            const collection = storage.getCollection(params.collectionId);

            if (!collection) {
                throw new Error(`Collection with ID ${params.collectionId} not found`);
            }

            let environment: InsomniaEnvironment | undefined = collection.environments.find(
                (env: InsomniaEnvironment) => env._id === params.environmentId,
            );

            if (!environment) {
                const envId = `env_${uuidv4().replace(/-/g, '')}`;
                environment = {
                    _id: envId,
                    _type: 'environment',
                    parentId: params.collectionId,
                    name: 'Base Environment',
                    description: 'Base environment variables',
                    data: {},
                    modified: Date.now(),
                    created: Date.now(),
                } as InsomniaEnvironment;
                collection.environments.push(environment);
            }

            environment.data[params.key] = params.value;
            environment.modified = Date.now();

            storage.saveCollection(params.collectionId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Environment variable "${params.key}" set successfully with value: ${String(params.value)}`,
                    },
                ],
            };
        },
    },

    {
        name: 'get_environment_variables',
        description: 'Get environment variables from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'ID collection' },
                environmentId: { type: 'string', description: 'Specific environment ID (optional)' },
            },
            required: ['collectionId'],
        },
        handler: async (request) => {
            const { collectionId, environmentId } = request.params.arguments as {
                collectionId: string;
                environmentId?: string;
            };
            const collection = storage.getCollection(collectionId);

            if (!collection) {
                throw new Error(`Collection with ID ${collectionId} not found`);
            }

            let environments = collection.environments;
            if (environmentId) {
                environments = environments.filter((env: InsomniaEnvironment) => env._id === environmentId);
            }

            const result = environments.map((env: InsomniaEnvironment) => ({
                id: env._id,
                name: env.name,
                description: env.description,
                variables: env.data,
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
];
