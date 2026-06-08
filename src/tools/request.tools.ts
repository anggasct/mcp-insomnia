import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage/index.js';
import { serializedByteLength } from '../utils/http.js';
import { executeHttpRequest } from '../utils/request-executor.js';
import { resolveInternalEnvironmentVariables } from '../utils/env-resolver.js';
import type { CollectionStructure } from '../types/collection.js';
import type { ToolExecutionContext } from '../types/tool.js';
import type { Tool } from '../types/tool.js';
import type {
    CreateRequestParams,
    UpdateRequestParams,
    InsomniaRequest,
    RequestExecutionResult,
    InsomniaExecution,
    ResponseData,
} from '../types/request.js';

export const requestTools: Tool[] = [
    {
        name: 'list_requests',
        description: 'List all requests across collections. Optionally filter by collectionId.',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'Filter by collection ID (optional)' },
            },
        },
        handler: async (request) => {
            const { collectionId: collectionIdFilter } = (request.params.arguments || {}) as {
                collectionId?: string;
            };

            const collections = collectionIdFilter
                ? new Map([[collectionIdFilter, storage.getCollection(collectionIdFilter)]])
                : storage.getAllCollections();

            const allRequests: Array<Record<string, unknown>> = [];

            for (const [collectionId, structure] of collections.entries()) {
                if (!structure) continue;

                const requests = structure.requests.map((req: InsomniaRequest) => ({
                    id: req._id,
                    collectionId,
                    collectionName: structure.workspace.name,
                    parentId: req.parentId,
                    parentName:
                        structure.folders.find((f) => f._id === req.parentId)?.name ?? 'Root',
                    name: req.name,
                    description: req.description,
                    method: req.method,
                    url: req.url,
                    hasAuthentication: !!req.authentication,
                    headerCount: req.headers.length,
                    parameterCount: req.parameters.length,
                    hasBody: !!req.body,
                    created: new Date(req.created).toISOString(),
                    modified: new Date(req.modified).toISOString(),
                }));

                allRequests.push(...requests);
            }

            allRequests.sort(
                (a, b) => new Date(b.modified as string).getTime() - new Date(a.modified as string).getTime(),
            );

            return {
                content: [{ type: 'text', text: JSON.stringify(allRequests, null, 2) }],
            };
        },
    },

    {
        name: 'get_request',
        description: 'Get full details of a specific request by ID',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'ID of the request' },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const { requestId } = request.params.arguments as { requestId: string };
            const collections = storage.getAllCollections();

            let targetRequest: InsomniaRequest | null = null;
            let collectionInfo: Record<string, string> | null = null;

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
                                : (structure.folders.find((f) => f._id === foundRequest.parentId)?.name ?? 'Unknown'),
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
                          hasCredentials: !!(targetRequest.authentication.username ?? targetRequest.authentication.token),
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
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        },
    },

    {
        name: 'get_request_history',
        description: 'Get the execution history of a specific request',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'ID of the request' },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const { requestId } = request.params.arguments as { requestId: string };
            const collections = storage.getAllCollections();

            let targetRequest: InsomniaRequest | null = null;

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
                content: [{ type: 'text', text: JSON.stringify(history, null, 2) }],
            };
        },
    },


    {
        name: 'create_request_in_collection',
        description: 'Create a new request within a specific collection/folder',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'ID collection' },
                folderId: { type: 'string', description: 'ID folder (optional)' },
                name: { type: 'string', description: 'Request name' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
                url: { type: 'string', description: 'Endpoint URL' },
                headers: {
                    type: 'array',
                    description: 'Request headers',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            value: { type: 'string' },
                            description: { type: 'string' },
                            disabled: { type: 'boolean' },
                        },
                        required: ['name', 'value'],
                    },
                },
                body: { type: 'object', description: 'Request body' },
                parameters: {
                    type: 'array',
                    description: 'Query parameters',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            value: { type: 'string' },
                            description: { type: 'string' },
                            disabled: { type: 'boolean' },
                        },
                        required: ['name', 'value'],
                    },
                },
                authentication: { type: 'object', description: 'Authentication config' },
                description: { type: 'string', description: 'Request description' },
            },
            required: ['collectionId', 'name', 'method', 'url'],
        },
        handler: async (request) => {
            const params = request.params.arguments as unknown as CreateRequestParams;
            const collection = storage.getCollection(params.collectionId);

            if (!collection) {
                throw new Error(`Collection with ID ${params.collectionId} not found`);
            }

            const requestId = `req_${uuidv4().replace(/-/g, '')}`;
            const newRequest: InsomniaRequest = {
                _id: requestId,
                _type: 'request',
                parentId: params.folderId || params.collectionId,
                name: params.name,
                description: params.description || '',
                url: params.url,
                method: params.method,
                headers: params.headers || [],
                parameters: params.parameters || [],
                body: params.body,
                authentication: params.authentication,
                modified: Date.now(),
                created: Date.now(),
            };

            collection.requests.push(newRequest);
            storage.saveCollection(params.collectionId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Request "${params.name}" created successfully with ID: ${requestId}`,
                    },
                ],
            };
        },
    },

    {
        name: 'update_request',
        description: 'Update an existing request',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'ID of the request to update' },
                name: { type: 'string', description: 'New request name' },
                method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
                url: { type: 'string', description: 'New endpoint URL' },
                headers: {
                    type: 'array',
                    description: 'New request headers',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            value: { type: 'string' },
                            description: { type: 'string' },
                            disabled: { type: 'boolean' },
                        },
                        required: ['name', 'value'],
                    },
                },
                body: { type: 'object', description: 'New request body' },
                parameters: {
                    type: 'array',
                    description: 'New query parameters',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            value: { type: 'string' },
                            description: { type: 'string' },
                            disabled: { type: 'boolean' },
                        },
                        required: ['name', 'value'],
                    },
                },
                authentication: { type: 'object', description: 'New authentication config' },
                description: { type: 'string', description: 'New request description' },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const params = request.params.arguments as unknown as UpdateRequestParams;

            let targetRequest: InsomniaRequest | null = null;
            let targetCollectionId: string | null = null;
            const collections = storage.getAllCollections();

            for (const [collectionId, collection] of collections.entries()) {
                const foundRequest = collection.requests.find((r) => r._id === params.requestId);
                if (foundRequest) {
                    targetRequest = foundRequest;
                    targetCollectionId = collectionId;
                    break;
                }
            }

            if (!targetRequest || !targetCollectionId) {
                throw new Error(`Request with ID ${params.requestId} not found`);
            }

            if (params.name !== undefined) targetRequest.name = params.name;
            if (params.method !== undefined) targetRequest.method = params.method;
            if (params.url !== undefined) targetRequest.url = params.url;
            if (params.headers !== undefined) targetRequest.headers = params.headers;
            if (params.body !== undefined) targetRequest.body = params.body;
            if (params.parameters !== undefined) targetRequest.parameters = params.parameters;
            if (params.authentication !== undefined) targetRequest.authentication = params.authentication;
            if (params.description !== undefined) targetRequest.description = params.description;

            targetRequest.modified = Date.now();

            const updatedCollection = collections.get(targetCollectionId);
            if (!updatedCollection) {
                throw new Error(`Collection with ID ${targetCollectionId} not found`);
            }
            storage.saveCollection(targetCollectionId, updatedCollection);

            return {
                content: [
                    {
                        type: 'text',
                        text: `Request with ID ${params.requestId} updated successfully`,
                    },
                ],
            };
        },
    },

    {
        name: 'delete_request',
        description: 'Delete a request from a collection',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'ID of the request to delete' },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const { requestId } = request.params.arguments as { requestId: string };
            const collections = storage.getAllCollections();

            for (const [collectionId, collection] of collections.entries()) {
                const requestIndex = collection.requests.findIndex((r: InsomniaRequest) => r._id === requestId);
                if (requestIndex !== -1) {
                    collection.requests.splice(requestIndex, 1);
                    storage.saveCollection(collectionId, collection);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Request with ID ${requestId} deleted successfully`,
                            },
                        ],
                    };
                }
            }

            throw new Error(`Request with ID ${requestId} not found`);
        },
    },

    {
        name: 'execute_request',
        description: 'Execute a request and get a response',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'ID of the request to execute' },
                environmentId: {
                    type: 'string',
                    description: 'Sub-environment ID from the collection for variable substitution',
                },
                overrideVariables: {
                    type: 'object',
                    description: 'Per-call variable overrides merged after stored env layers',
                },
                environmentVariables: {
                    type: 'object',
                    description:
                        'Final override layer for environment variables (backward compatible with UC-31)',
                },
                maxResponseBytes: {
                    type: 'number',
                    description:
                        'Optional max serialized response body bytes in tool output. Omit or set <= 0 for no cap. When exceeded, data becomes a truncated string preview.',
                },
                timeoutMs: {
                    type: 'number',
                    description:
                        'Optional request timeout in milliseconds. Default 30000. Set <= 0 for no timeout (MCP cancellation still applies).',
                },
            },
            required: ['requestId'],
        },
        handler: async (request, context: ToolExecutionContext) => {
            const {
                requestId,
                environmentId,
                overrideVariables,
                environmentVariables = {},
                maxResponseBytes,
                timeoutMs,
            } = request.params.arguments as {
                requestId: string;
                environmentId?: string;
                overrideVariables?: Record<string, string | number | boolean>;
                environmentVariables?: Record<string, string | number | boolean>;
                maxResponseBytes?: number;
                timeoutMs?: number;
            };

            let targetRequest: InsomniaRequest | null = null;
            let collectionId: string | null = null;
            let targetCollection: CollectionStructure | null = null;
            const collections = storage.getAllCollections();
            for (const [cId, collection] of collections.entries()) {
                const foundRequest = collection.requests.find((r: InsomniaRequest) => r._id === requestId);
                if (foundRequest) {
                    targetRequest = foundRequest;
                    collectionId = cId;
                    targetCollection = collection;
                    break;
                }
            }

            if (!targetRequest || !collectionId || !targetCollection) {
                throw new Error(`Request with ID ${requestId} not found`);
            }

            const { variables: resolvedEnvironmentVariables } = resolveInternalEnvironmentVariables({
                collection: targetCollection,
                requestParentId: targetRequest.parentId || collectionId,
                environmentId,
                overrideVariables,
                legacyEnvironmentVariables: environmentVariables,
            });

            const httpResult = await executeHttpRequest({
                request: targetRequest,
                environmentVariables: resolvedEnvironmentVariables,
                mcpSignal: context.signal,
                timeoutMs,
                maxResponseBytes,
            });

            if (httpResult.kind === 'success') {
                const result: RequestExecutionResult = {
                    status: httpResult.status,
                    statusText: httpResult.statusText,
                    headers: httpResult.headers,
                    data: httpResult.capped.data as ResponseData,
                    duration: httpResult.duration,
                    size: httpResult.capped.size,
                    timestamp: new Date().toISOString(),
                    ...(httpResult.capped.truncated
                        ? { truncated: true as const, maxResponseBytes: httpResult.capped.maxResponseBytes }
                        : {}),
                };

                const execution: InsomniaExecution = {
                    _id: `ex_${uuidv4().replace(/-/g, '')}`,
                    parentId: requestId,
                    timestamp: Date.now(),
                    response: {
                        statusCode: httpResult.status,
                        statusMessage: httpResult.statusText,
                        headers: httpResult.headers,
                        body: JSON.stringify(httpResult.rawData),
                        duration: httpResult.duration,
                        size: result.size,
                    },
                };
                storage.addExecution(collectionId, requestId, execution);

                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                };
            }

            if (httpResult.kind === 'cancelled') {
                const cancelledResult = {
                    error: true,
                    cancelled: true,
                    cancelReason: httpResult.cancelReason,
                    message: httpResult.message,
                    duration: httpResult.duration,
                    timestamp: new Date().toISOString(),
                };

                const execution: InsomniaExecution = {
                    _id: `ex_${uuidv4().replace(/-/g, '')}`,
                    parentId: requestId,
                    timestamp: Date.now(),
                    response: {
                        statusCode: 0,
                        statusMessage: httpResult.message,
                        headers: {},
                        body: '',
                        duration: httpResult.duration,
                        size: 0,
                    },
                    error: { message: httpResult.message },
                };
                storage.addExecution(collectionId, requestId, execution);

                return {
                    content: [{ type: 'text', text: JSON.stringify(cancelledResult, null, 2) }],
                };
            }

            const errorResult = {
                error: true,
                message: httpResult.message,
                status: httpResult.status,
                statusText: httpResult.statusText,
                headers: httpResult.headers,
                data: httpResult.capped.data,
                duration: httpResult.duration,
                timestamp: new Date().toISOString(),
                size: httpResult.capped.size,
                ...(httpResult.capped.truncated
                    ? { truncated: true as const, maxResponseBytes: httpResult.capped.maxResponseBytes }
                    : {}),
            };

            const execution: InsomniaExecution = {
                _id: `ex_${uuidv4().replace(/-/g, '')}`,
                parentId: requestId,
                timestamp: Date.now(),
                response: {
                    statusCode: httpResult.status ?? 0,
                    statusMessage: httpResult.statusText || httpResult.message,
                    headers: httpResult.headers ?? {},
                    body:
                        httpResult.data === undefined ? '' : JSON.stringify(httpResult.data),
                    duration: httpResult.duration,
                    size: serializedByteLength(httpResult.data),
                },
                error: {
                    message: httpResult.message,
                },
            };
            storage.addExecution(collectionId, requestId, execution);

            return {
                content: [{ type: 'text', text: JSON.stringify(errorResult, null, 2) }],
            };
        },
    },
];
