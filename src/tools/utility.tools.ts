import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { HTTPSnippet } from 'httpsnippet';
import { storage } from '../storage/index.js';
import type { Tool } from '../types/tool.js';
import type {
    InsomniaCollection,
    InsomniaWorkspace,
    InsomniaRequestGroup,
    CollectionStructure,
} from '../types/collection.js';
import type { InsomniaRequest, InsomniaParameter } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';
import type { HarRequest, TargetId } from 'httpsnippet';
import { parseCurlCommand } from '../utils/curl-parser.js';
import { convertPostmanToInsomnia, PostmanCollection } from '../utils/postman-converter.js';

function convertInsomniaRequestToHar(request: InsomniaRequest): HarRequest {
    return {
        method: request.method,
        url: request.url,
        headers: request.headers.map((h) => ({ name: h.name, value: h.value })),
        queryString: request.parameters.map((p) => ({ name: p.name, value: p.value })),
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headersSize: -1,
        bodySize: -1,
        postData: request.body?.text
            ? {
                  mimeType: request.body.mimeType || 'application/json',
                  text: request.body.text,
              }
            : undefined,
    } as HarRequest;
}

export const utilityTools: Tool[] = [
    {
        name: 'import_from_insomnia_export',
        description: 'Import collections from a standard Insomnia V4 export file',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'The absolute path to the Insomnia export file' },
            },
            required: ['filePath'],
        },
        handler: async (request) => {
            const { filePath } = request.params.arguments as { filePath: string };

            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at path: ${filePath}`);
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(fileContent) as InsomniaCollection;

            const exportData = data as unknown as Record<string, unknown>;
            if (exportData._type !== 'export' || exportData.__export_format !== 4) {
                throw new Error('Invalid Insomnia V4 export file format.');
            }

            const allResources = data.resources;
            const workspaces = allResources.filter((r) => r._type === 'workspace') as InsomniaWorkspace[];

            if (workspaces.length === 0) {
                throw new Error('No workspaces found in the export file.');
            }

            let importedCount = 0;
            for (const workspace of workspaces) {
                const structure: CollectionStructure = {
                    workspace,
                    folders: [],
                    requests: [],
                    environments: [],
                };

                const allChildrenIds = new Set<string>([workspace._id]);
                const resourcesInWorkspace = allResources.filter((r) => r.parentId === workspace._id);

                const folderIds = new Set<string>();
                resourcesInWorkspace.forEach((r) => {
                    if (r._type === 'request_group') {
                        folderIds.add(r._id);
                        allChildrenIds.add(r._id);
                    }
                });

                allResources.forEach((r) => {
                    if (!r.parentId || !allChildrenIds.has(r.parentId)) return;

                    switch (r._type) {
                        case 'request_group':
                            structure.folders.push(r as InsomniaRequestGroup);
                            break;
                        case 'request':
                            structure.requests.push(r as InsomniaRequest);
                            break;
                        case 'environment':
                            if (r.parentId === workspace._id) {
                                structure.environments.push(r as InsomniaEnvironment);
                            }
                            break;
                    }
                });

                storage.saveCollection(workspace._id, structure);
                importedCount++;
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully imported ${String(importedCount)} collection(s) from ${filePath}`,
                    },
                ],
            };
        },
    },

    {
        name: 'generate_code_snippet',
        description: 'Generate a code snippet for a request in various languages/frameworks',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'ID of the request to generate snippet for' },
                target: {
                    type: 'string',
                    description: 'Target language for the snippet (e.g., "javascript", "python", "shell")',
                    enum: [
                        'c',
                        'clojure',
                        'csharp',
                        'go',
                        'http',
                        'java',
                        'javascript',
                        'kotlin',
                        'node',
                        'objc',
                        'ocaml',
                        'php',
                        'powershell',
                        'python',
                        'ruby',
                        'shell',
                        'swift',
                    ],
                },
                client: {
                    type: 'string',
                    description:
                        'Optional: specify a client for the target language (e.g., "axios" for javascript, "curl" for shell)',
                },
            },
            required: ['requestId', 'target'],
        },
        handler: async (request) => {
            const { requestId, target, client } = request.params.arguments as {
                requestId: string;
                target: string;
                client?: string;
            };

            let targetRequest: InsomniaRequest | null = null;
            const collections = storage.getAllCollections();
            for (const [, collection] of collections.entries()) {
                const foundRequest = collection.requests.find((r: InsomniaRequest) => r._id === requestId);
                if (foundRequest) {
                    targetRequest = foundRequest;
                    break;
                }
            }

            if (!targetRequest) {
                throw new Error(`Request with ID ${requestId} not found`);
            }

            const harRequest = convertInsomniaRequestToHar(targetRequest);
            const snippet = new HTTPSnippet(harRequest);

            try {
                const code = snippet.convert(target as TargetId, client);
                return {
                    content: [
                        {
                            type: 'text',
                            text: code,
                        },
                    ],
                };
            } catch (err) {
                const error = err as Error;
                throw new Error(
                    `Failed to generate code snippet for target "${target}" with client "${client || 'default'}": ${error.message || 'Unknown error'}`,
                );
            }
        },
    },

    {
        name: 'import_from_curl',
        description: 'Create a request from a cURL command',
        inputSchema: {
            type: 'object',
            properties: {
                curlCommand: { type: 'string', description: 'The cURL command to parse' },
                collectionId: { type: 'string', description: 'ID of the collection to add the request to' },
                requestName: { type: 'string', description: 'Name for the new request' },
                folderId: { type: 'string', description: 'Optional folder ID to place the request in' },
            },
            required: ['curlCommand', 'collectionId'],
        },
        handler: async (request) => {
            const { curlCommand, collectionId, requestName, folderId } = request.params.arguments as {
                curlCommand: string;
                collectionId: string;
                requestName?: string;
                folderId?: string;
            };

            const collection = storage.getCollection(collectionId);
            if (!collection) {
                throw new Error(`Collection with ID ${collectionId} not found`);
            }

            const parsed = parseCurlCommand(curlCommand);
            const requestId = `req_${uuidv4().replace(/-/g, '')}`;

            const newRequest: InsomniaRequest = {
                _id: requestId,
                _type: 'request',
                parentId: folderId || collectionId,
                name: requestName || `Imported from cURL - ${parsed.method} ${new URL(parsed.url).pathname}`,
                description: 'Imported from cURL command',
                url: parsed.url,
                method: parsed.method,
                headers: parsed.headers,
                parameters: parsed.parameters,
                body: parsed.body,
                created: Date.now(),
                modified: Date.now(),
            };

            collection.requests.push(newRequest);
            storage.saveCollection(collectionId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Successfully created request from cURL`,
                                request: {
                                    id: requestId,
                                    name: newRequest.name,
                                    method: newRequest.method,
                                    url: newRequest.url,
                                    headersCount: newRequest.headers.length,
                                    hasBody: !!newRequest.body,
                                },
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    },

    {
        name: 'import_from_postman',
        description: 'Import collections from a Postman Collection v2.1 JSON file',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'Path to the Postman collection JSON file' },
            },
            required: ['filePath'],
        },
        handler: async (request) => {
            const { filePath } = request.params.arguments as { filePath: string };

            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at path: ${filePath}`);
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const postmanData = JSON.parse(fileContent) as PostmanCollection;

            if (!postmanData.info.schema) {
                throw new Error('Invalid Postman collection format. Expected Postman Collection v2.1');
            }

            if (!postmanData.info.schema.includes('v2.1') && !postmanData.info.schema.includes('v2.0')) {
                throw new Error(
                    `Unsupported Postman schema version. Expected v2.0 or v2.1, got: ${postmanData.info.schema}`,
                );
            }

            const workspaceId = `wrk_${uuidv4().replace(/-/g, '')}`;
            const collection = convertPostmanToInsomnia(postmanData, workspaceId);

            storage.saveCollection(workspaceId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Successfully imported Postman collection "${postmanData.info.name}"`,
                                collection: {
                                    id: workspaceId,
                                    name: collection.workspace.name,
                                    requestCount: collection.requests.length,
                                    folderCount: collection.folders.length,
                                    environmentCount: collection.environments.length,
                                },
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    },

    {
        name: 'import_from_openapi',
        description: 'Generate requests from OpenAPI/Swagger specification',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: 'Path to OpenAPI spec file (JSON or YAML)' },
                collectionName: { type: 'string', description: 'Name for the new collection' },
                baseUrl: { type: 'string', description: 'Base URL to use for requests (overrides spec servers)' },
            },
            required: ['filePath'],
        },
        handler: async (request) => {
            const { filePath, collectionName, baseUrl } = request.params.arguments as {
                filePath: string;
                collectionName?: string;
                baseUrl?: string;
            };

            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at path: ${filePath}`);
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');

            let spec: OpenAPISpec;
            try {
                spec = JSON.parse(fileContent) as OpenAPISpec;
            } catch {
                throw new Error(
                    'Failed to parse OpenAPI spec. Only JSON format is supported. For YAML, please convert to JSON first.',
                );
            }

            if (!spec.openapi && !spec.swagger) {
                throw new Error('Invalid OpenAPI/Swagger specification');
            }

            const workspaceId = `wrk_${uuidv4().replace(/-/g, '')}`;
            const collection = convertOpenAPIToInsomnia(spec, workspaceId, collectionName, baseUrl);

            storage.saveCollection(workspaceId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Successfully imported OpenAPI spec`,
                                collection: {
                                    id: workspaceId,
                                    name: collection.workspace.name,
                                    requestCount: collection.requests.length,
                                    folderCount: collection.folders.length,
                                },
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        },
    },
];

interface OpenAPISpec {
    openapi?: string;
    swagger?: string;
    info: {
        title: string;
        description?: string;
        version: string;
    };
    servers?: Array<{ url: string; description?: string }>;
    paths: Record<string, OpenAPIPathItem>;
}

interface OpenAPIPathItem {
    get?: OpenAPIOperation;
    post?: OpenAPIOperation;
    put?: OpenAPIOperation;
    delete?: OpenAPIOperation;
    patch?: OpenAPIOperation;
    options?: OpenAPIOperation;
    head?: OpenAPIOperation;
}

interface OpenAPIOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: OpenAPIParameter[];
    requestBody?: {
        content?: Record<string, { schema?: object; example?: unknown }>;
    };
}

interface OpenAPIParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    required?: boolean;
    description?: string;
    schema?: { type?: string; default?: unknown };
}

function convertOpenAPIToInsomnia(
    spec: OpenAPISpec,
    workspaceId: string,
    customName?: string,
    customBaseUrl?: string,
): CollectionStructure {
    const workspace: InsomniaWorkspace = {
        _id: workspaceId,
        _type: 'workspace',
        name: customName || spec.info.title,
        description: spec.info.description || `OpenAPI ${String(spec.openapi || spec.swagger)}`,
        scope: 'collection',
        created: Date.now(),
        modified: Date.now(),
    };

    const baseUrl = customBaseUrl || spec.servers?.[0]?.url || 'http://localhost';
    const folders: InsomniaRequestGroup[] = [];
    const requests: InsomniaRequest[] = [];

    const tagFolders = new Map<string, string>();
    let folderCounter = 0;
    let requestCounter = 0;

    const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const method of methods) {
            const operation = pathItem[method];
            if (!operation) continue;

            let parentId = workspaceId;
            if (operation.tags && operation.tags.length > 0) {
                const tag = operation.tags[0];
                if (!tagFolders.has(tag)) {
                    const folderId = `fld_${workspaceId}_${String(folderCounter++)}`;
                    tagFolders.set(tag, folderId);
                    folders.push({
                        _id: folderId,
                        _type: 'request_group',
                        parentId: workspaceId,
                        name: tag,
                        created: Date.now(),
                        modified: Date.now(),
                    });
                }
                parentId = tagFolders.get(tag) || workspaceId;
            }

            const requestId = `req_${workspaceId}_${String(requestCounter++)}`;
            const url = `${baseUrl}${path}`;

            const headers: InsomniaHeader[] = [];
            const parameters: InsomniaParameter[] = [];

            if (operation.parameters) {
                for (const param of operation.parameters) {
                    const defaultValue = param.schema?.default;
                    let valueStr = '';
                    if (defaultValue !== undefined && defaultValue !== null) {
                        if (typeof defaultValue === 'string') {
                            valueStr = defaultValue;
                        } else if (typeof defaultValue === 'number' || typeof defaultValue === 'boolean') {
                            valueStr = String(defaultValue);
                        } else {
                            valueStr = JSON.stringify(defaultValue);
                        }
                    }

                    if (param.in === 'query') {
                        parameters.push({
                            name: param.name,
                            value: valueStr,
                            description: param.description,
                        });
                    } else if (param.in === 'header') {
                        headers.push({
                            name: param.name,
                            value: valueStr,
                            description: param.description,
                        });
                    }
                }
            }

            let body = undefined;
            if (operation.requestBody?.content) {
                const contentMap = operation.requestBody.content;
                if (Object.prototype.hasOwnProperty.call(contentMap, 'application/json')) {
                    const jsonContent = contentMap['application/json'];
                    body = {
                        mimeType: 'application/json',
                        text: jsonContent.example ? JSON.stringify(jsonContent.example, null, 2) : '{}',
                    };
                    headers.push({ name: 'Content-Type', value: 'application/json' });
                }
            }

            requests.push({
                _id: requestId,
                _type: 'request',
                parentId,
                name: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
                description: operation.description,
                url,
                method: method.toUpperCase() as InsomniaRequest['method'],
                headers,
                parameters,
                body,
                created: Date.now(),
                modified: Date.now(),
            });
        }
    }

    return {
        workspace,
        folders,
        requests,
        environments: [],
    };
}

interface InsomniaHeader {
    name: string;
    value: string;
    description?: string;
    disabled?: boolean;
}
