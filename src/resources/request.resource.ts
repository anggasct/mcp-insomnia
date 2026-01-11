import { storage } from '../storage/index.js';
import type { Resource } from '../types/resource.js';
import type { InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaRequest, InsomniaExecution } from '../types/request.js';

export const requestResources: Resource[] = [
    {
        uri: 'insomnia://requests',
        name: 'Requests',
        description: 'List all requests in collections with metadata. Can be filtered with ?collectionId={id}',
        mimeType: 'application/json',
        handler: async (request) => {
            const allRequests: Array<{
                id: string;
                collectionId: string;
                collectionName: string;
                parentId?: string;
                parentName: string;
                name: string;
                description?: string;
                method: string;
                url: string;
                hasAuthentication: boolean;
                headerCount: number;
                parameterCount: number;
                hasBody: boolean;
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

                const requests = structure.requests.map((request: InsomniaRequest) => ({
                    id: request._id,
                    collectionId,
                    collectionName: structure.workspace.name,
                    parentId: request.parentId,
                    parentName:
                        structure.folders.find((f: InsomniaRequestGroup) => f._id === request.parentId)?.name ?? 'Root',
                    name: request.name,
                    description: request.description,
                    method: request.method,
                    url: request.url,
                    hasAuthentication: !!request.authentication,
                    headerCount: request.headers.length,
                    parameterCount: request.parameters.length,
                    hasBody: !!request.body,
                    created: new Date(request.created).toISOString(),
                    modified: new Date(request.modified).toISOString(),
                }));

                allRequests.push(...requests);
            }

            allRequests.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

            return {
                contents: [
                    {
                        type: 'text',
                        text: JSON.stringify(allRequests, null, 2),
                    },
                ],
            };
        },
    },

    {
        uri: 'insomnia://request/{id}',
        name: 'Request Detail',
        description: 'Full details of a specific request',
        mimeType: 'application/json',
        handler: async (request) => {
            const uri = request.params.uri;
            const requestId = uri.replace('insomnia://request/', '');

            let targetRequest = null;
            let collectionInfo = null;
            const collections = storage.getAllCollections();

            for (const [collectionId, structure] of collections.entries()) {
                const foundRequest = structure.requests.find((r: InsomniaRequest) => r._id === requestId);
                if (foundRequest) {
                    targetRequest = foundRequest;
                    collectionInfo = {
                        id: collectionId,
                        name: structure.workspace.name,
                        parentName:
                            foundRequest.parentId === collectionId
                                ? 'Root'
                                : (structure.folders.find((f: InsomniaRequestGroup) => f._id === foundRequest.parentId)
                                      ?.name ?? 'Unknown'),
                    };
                    break;
                }
            }

            if (!targetRequest) {
                throw new Error(`Request with ID ${requestId} not found`);
            }

            const result = {
                id: targetRequest._id,
                name: targetRequest.name,
                description: targetRequest.description,
                method: targetRequest.method,
                url: targetRequest.url,
                collection: collectionInfo,
                headers: targetRequest.headers,
                parameters: targetRequest.parameters,
                body: targetRequest.body || null,
                authentication: targetRequest.authentication
                    ? {
                          type: targetRequest.authentication.type,
                          hasCredentials: !!(
                              targetRequest.authentication.username ?? targetRequest.authentication.token
                          ),
                      }
                    : null,
                metadata: {
                    created: new Date(targetRequest.created).toISOString(),
                    modified: new Date(targetRequest.modified).toISOString(),
                    hasHeaders: targetRequest.headers.length > 0,
                    hasParameters: targetRequest.parameters.length > 0,
                    hasBody: !!targetRequest.body,
                    hasAuthentication: !!targetRequest.authentication,
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

    {
        uri: 'insomnia://request/{id}/history',
        name: 'Request Execution History',
        description: 'Get the execution history of a specific request',
        mimeType: 'application/json',
        handler: async (request) => {
            const uri = request.params.uri;
            const requestId = uri.replace('insomnia://request/', '').replace('/history', '');

            let targetRequest = null;
            const collections = storage.getAllCollections();

            for (const structure of collections.values()) {
                const foundRequest = structure.requests.find((r: InsomniaRequest) => r._id === requestId);
                if (foundRequest) {
                    targetRequest = foundRequest;
                    break;
                }
            }

            if (!targetRequest) {
                throw new Error(`Request with ID ${requestId} not found`);
            }

            const history = (targetRequest.history || []).map((h: InsomniaExecution) => ({
                id: h._id,
                timestamp: new Date(h.timestamp).toISOString(),
                response: {
                    statusCode: h.response.statusCode,
                    statusMessage: h.response.statusMessage,
                    duration: h.response.duration,
                    size: h.response.size,
                    headers: h.response.headers,
                    body: h.response.body,
                },
                error: h.error,
            }));

            return {
                contents: [
                    {
                        type: 'text',
                        text: JSON.stringify(history, null, 2),
                    },
                ],
            };
        },
    },
];
