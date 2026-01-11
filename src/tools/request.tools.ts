import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosError } from 'axios';
import { storage } from '../storage/index.js';
import { normalizeHeaders, HeadersInput } from '../utils/http.js';
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
                environmentVariables: { type: 'object', description: 'Environment variables for the request' },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const { requestId, environmentVariables = {} } = request.params.arguments as {
                requestId: string;
                environmentVariables?: Record<string, string | number | boolean>;
            };

            let targetRequest: InsomniaRequest | null = null;
            let collectionId: string | null = null;
            const collections = storage.getAllCollections();
            for (const [cId, collection] of collections.entries()) {
                const foundRequest = collection.requests.find((r: InsomniaRequest) => r._id === requestId);
                if (foundRequest) {
                    targetRequest = foundRequest;
                    collectionId = cId;
                    break;
                }
            }

            if (!targetRequest || !collectionId) {
                throw new Error(`Request with ID ${requestId} not found`);
            }

            const startTime = Date.now();

            try {
                let processedUrl = targetRequest.url;
                Object.entries(environmentVariables).forEach(([key, value]) => {
                    processedUrl = processedUrl.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
                });

                const processedHeaders: Record<string, string> = {};
                targetRequest.headers.forEach((header) => {
                    if (!header.disabled) {
                        let processedValue = header.value;
                        Object.entries(environmentVariables).forEach(([key, value]) => {
                            processedValue = processedValue.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
                        });
                        processedHeaders[header.name] = processedValue;
                    }
                });

                if (targetRequest.authentication) {
                    const auth = targetRequest.authentication;
                    switch (auth.type) {
                        case 'bearer':
                            processedHeaders['Authorization'] = `Bearer ${auth.token ?? ''}`;
                            break;
                        case 'basic': {
                            const credentials = Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString(
                                'base64',
                            );
                            processedHeaders['Authorization'] = `Basic ${credentials}`;
                            break;
                        }
                    }
                }

                let processedBody: string | Record<string, unknown> | undefined = undefined;
                if (targetRequest.body) {
                    if (targetRequest.body.text) {
                        processedBody = targetRequest.body.text;
                        Object.entries(environmentVariables).forEach(([key, value]) => {
                            if (typeof processedBody === 'string') {
                                processedBody = processedBody.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
                            }
                        });

                        if (targetRequest.body.mimeType === 'application/json') {
                            try {
                                processedBody = JSON.parse(processedBody) as Record<string, unknown>;
                            } catch {}
                        }
                    }
                }

                const response = await axios({
                    method: targetRequest.method.toLowerCase() as
                        | 'get'
                        | 'post'
                        | 'put'
                        | 'delete'
                        | 'patch'
                        | 'head'
                        | 'options',
                    url: processedUrl,
                    headers: processedHeaders,
                    data: processedBody,
                    timeout: 30000,
                });

                const duration = Date.now() - startTime;
                const result: RequestExecutionResult = {
                    status: response.status,
                    statusText: response.statusText,
                    headers: normalizeHeaders(response.headers as HeadersInput),
                    data: response.data as ResponseData,
                    duration,
                    size: JSON.stringify(response.data).length,
                    timestamp: new Date().toISOString(),
                };

                const execution: InsomniaExecution = {
                    _id: `ex_${uuidv4().replace(/-/g, '')}`,
                    parentId: requestId,
                    timestamp: Date.now(),
                    response: {
                        statusCode: response.status,
                        statusMessage: response.statusText,
                        headers: normalizeHeaders(response.headers as HeadersInput),
                        body: JSON.stringify(response.data),
                        duration,
                        size: result.size,
                    },
                };
                storage.addExecution(collectionId, requestId, execution);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (err) {
                const duration = Date.now() - startTime;
                const error = err as AxiosError<ResponseData>;
                const errorResult = {
                    error: true,
                    message: error.message || 'Unknown error',
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    headers: normalizeHeaders(error.response?.headers as HeadersInput),
                    data: error.response?.data,
                    duration,
                    timestamp: new Date().toISOString(),
                };

                const execution: InsomniaExecution = {
                    _id: `ex_${uuidv4().replace(/-/g, '')}`,
                    parentId: requestId,
                    timestamp: Date.now(),
                    response: {
                        statusCode: error.response?.status ?? 0,
                        statusMessage: error.response?.statusText || error.message || 'Unknown error',
                        headers: normalizeHeaders(error.response?.headers as HeadersInput),
                        body: JSON.stringify(error.response?.data),
                        duration,
                        size: JSON.stringify(error.response?.data).length,
                    },
                    error: {
                        message: error.message || 'Unknown error',
                        stack: error.stack,
                    },
                };
                storage.addExecution(collectionId, requestId, execution);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(errorResult, null, 2),
                        },
                    ],
                };
            }
        },
    },
];
