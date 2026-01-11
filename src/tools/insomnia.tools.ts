import axios from 'axios';
import { insomniaStorage } from '../storage/insomnia-storage.js';
import { storage } from '../storage/storage.js';
import type { Tool } from '../types/tool.js';
import type { InsomniaRequest } from '../types/request.js';

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
            normalized[key] = value;
        } else if (Array.isArray(value)) {
            normalized[key] = value.join(', ');
        }
    }
    return normalized;
}

export const insomniaTools: Tool[] = [
    {
        name: 'list_insomnia_collections',
        description: 'List all collections directly from Insomnia app (requires Insomnia to be installed)',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed or not found at the default location');
            }

            const workspaces = insomniaStorage.getAllWorkspaces();
            const result = workspaces.map((w) => ({
                id: w._id,
                name: w.name,
                description: w.description,
                scope: w.scope,
                modified: new Date(w.modified).toISOString(),
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                insomniaPath: insomniaStorage.getInsomniaPath(),
                                collectionsCount: result.length,
                                collections: result,
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
        name: 'list_insomnia_projects',
        description: 'List all projects from Insomnia app',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed or not found at the default location');
            }

            const projects = insomniaStorage.getAllProjects();
            const result = projects.map((p) => ({
                id: p._id,
                name: p.name,
                remoteId: p.remoteId,
                parentId: p.parentId,
                modified: new Date(p.modified).toISOString(),
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                projectsCount: result.length,
                                projects: result,
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
        name: 'get_insomnia_collection',
        description: 'Get a complete collection from Insomnia app by workspace ID',
        inputSchema: {
            type: 'object',
            properties: {
                workspaceId: { type: 'string', description: 'Insomnia workspace ID (starts with wrk_)' },
            },
            required: ['workspaceId'],
        },
        handler: async (request) => {
            const { workspaceId } = request.params.arguments as { workspaceId: string };

            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed');
            }

            const collection = insomniaStorage.getCollection(workspaceId);
            if (!collection) {
                throw new Error(`Workspace with ID ${workspaceId} not found in Insomnia`);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                collection: {
                                    id: collection.workspace._id,
                                    name: collection.workspace.name,
                                    description: collection.workspace.description,
                                    folders: collection.folders.map((f) => ({
                                        id: f._id,
                                        name: f.name,
                                        parentId: f.parentId,
                                    })),
                                    requests: collection.requests.map((r) => ({
                                        id: r._id,
                                        name: r.name,
                                        method: r.method,
                                        url: r.url,
                                        parentId: r.parentId,
                                    })),
                                    environments: collection.environments.map((e) => ({
                                        id: e._id,
                                        name: e.name,
                                        variableCount: Object.keys(e.data).length,
                                    })),
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
        name: 'sync_from_insomnia',
        description: 'Import a collection from Insomnia app into MCP storage',
        inputSchema: {
            type: 'object',
            properties: {
                workspaceId: { type: 'string', description: 'Insomnia workspace ID to import' },
            },
            required: ['workspaceId'],
        },
        handler: async (request) => {
            const { workspaceId } = request.params.arguments as { workspaceId: string };

            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed');
            }

            const collection = insomniaStorage.getCollection(workspaceId);
            if (!collection) {
                throw new Error(`Workspace with ID ${workspaceId} not found in Insomnia`);
            }

            storage.saveCollection(workspaceId, collection);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Successfully synced collection "${collection.workspace.name}" from Insomnia to MCP`,
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
        name: 'sync_to_insomnia',
        description: 'Export a collection from MCP storage to Insomnia app',
        inputSchema: {
            type: 'object',
            properties: {
                collectionId: { type: 'string', description: 'MCP collection ID to export' },
                projectId: { type: 'string', description: 'Insomnia project ID (optional, defaults to first project)' },
            },
            required: ['collectionId'],
        },
        handler: async (request) => {
            const { collectionId, projectId } = request.params.arguments as {
                collectionId: string;
                projectId?: string;
            };

            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed');
            }

            const collection = storage.getCollection(collectionId);
            if (!collection) {
                throw new Error(`Collection with ID ${collectionId} not found in MCP storage`);
            }

            let targetProjectId = projectId;
            if (!targetProjectId) {
                const workspaces = insomniaStorage.getAllWorkspaces();
                if (workspaces.length > 0) {
                    targetProjectId = workspaces[0].parentId;
                } else {
                    targetProjectId = 'proj_default';
                }
            }

            insomniaStorage.saveWorkspace(collection.workspace, targetProjectId);

            for (const folder of collection.folders) {
                insomniaStorage.saveRequestGroup(folder);
            }

            for (const req of collection.requests) {
                insomniaStorage.saveRequest(req);
            }

            for (const env of collection.environments) {
                insomniaStorage.saveEnvironment(env);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Successfully synced collection "${collection.workspace.name}" to Insomnia. Restart Insomnia to see changes.`,
                                collection: {
                                    id: collectionId,
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
        name: 'sync_all_from_insomnia',
        description: 'Import all collections from Insomnia app into MCP storage',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed');
            }

            const collections = insomniaStorage.getAllCollections();
            let syncedCount = 0;
            const syncedNames: string[] = [];

            for (const [id, collection] of collections.entries()) {
                storage.saveCollection(id, collection);
                syncedCount++;
                syncedNames.push(collection.workspace.name);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                message: `Successfully synced ${String(syncedCount)} collections from Insomnia to MCP`,
                                collections: syncedNames,
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
        name: 'get_insomnia_request',
        description: 'Get detailed request information directly from Insomnia',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'Request ID (starts with req_)' },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const { requestId } = request.params.arguments as { requestId: string };

            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed');
            }

            const allRequests = insomniaStorage.getAllRequests();
            const req = allRequests.find((r) => r._id === requestId);

            if (!req) {
                throw new Error(`Request with ID ${requestId} not found in Insomnia`);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(
                            {
                                success: true,
                                request: {
                                    id: req._id,
                                    name: req.name,
                                    method: req.method,
                                    url: req.url,
                                    headers: req.headers,
                                    parameters: req.parameters,
                                    body: req.body,
                                    parentId: req.parentId,
                                    modified: new Date(req.modified).toISOString(),
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
        name: 'execute_insomnia_request',
        description:
            'Execute a request directly from Insomnia app without syncing. Supports environment variable substitution.',
        inputSchema: {
            type: 'object',
            properties: {
                requestId: { type: 'string', description: 'Request ID from Insomnia (starts with req_)' },
                environmentId: {
                    type: 'string',
                    description: 'Optional environment ID to use for variable substitution',
                },
                overrideVariables: {
                    type: 'object',
                    description: 'Optional variables to override environment values (e.g., {"token": "abc123"})',
                },
            },
            required: ['requestId'],
        },
        handler: async (request) => {
            const { requestId, environmentId, overrideVariables } = request.params.arguments as {
                requestId: string;
                environmentId?: string;
                overrideVariables?: Record<string, string>;
            };

            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error('Insomnia is not installed');
            }

            const allRequests = insomniaStorage.getAllRequests();
            const rawReq = allRequests.find((r) => r._id === requestId);

            if (!rawReq) {
                throw new Error(`Request with ID ${requestId} not found in Insomnia`);
            }

            const targetRequest: InsomniaRequest = {
                _id: rawReq._id,
                _type: 'request',
                parentId: rawReq.parentId,
                name: rawReq.name,
                url: rawReq.url,
                method: rawReq.method as InsomniaRequest['method'],
                headers: rawReq.headers.map((h) => ({
                    name: h.name,
                    value: h.value,
                    disabled: h.disabled,
                })),
                parameters: rawReq.parameters.map((p) => ({
                    name: p.name,
                    value: p.value,
                    disabled: p.disabled,
                })),
                body: rawReq.body.text
                    ? {
                          mimeType: rawReq.body.mimeType,
                          text: rawReq.body.text,
                      }
                    : undefined,
                modified: rawReq.modified,
                created: rawReq.created,
            };

            let environmentVariables: Record<string, string | number | boolean> = {};

            if (environmentId) {
                const allEnvs = insomniaStorage.getAllEnvironments();
                const env = allEnvs.find((e) => e._id === environmentId);
                if (env) {
                    environmentVariables = { ...env.data };
                }
            } else {
                const allEnvs = insomniaStorage.getAllEnvironments();

                const workspaceId = rawReq.parentId.startsWith('wrk_')
                    ? rawReq.parentId
                    : insomniaStorage.getAllRequestGroups().find((f) => f._id === rawReq.parentId)?.parentId;

                if (workspaceId) {
                    const baseEnv = allEnvs.find((e) => e.parentId === workspaceId);
                    if (baseEnv) {
                        environmentVariables = { ...baseEnv.data };
                    }
                }
            }

            if (overrideVariables) {
                Object.assign(environmentVariables, overrideVariables);
            }

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

            let processedBody: string | Record<string, unknown> | undefined = undefined;
            if (targetRequest.body?.text) {
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

            const startTime = Date.now();
            try {
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
                    validateStatus: () => true,
                });

                const duration = Date.now() - startTime;
                const result = {
                    success: true,
                    request: {
                        name: targetRequest.name,
                        method: targetRequest.method,
                        url: processedUrl,
                    },
                    response: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: normalizeHeaders(response.headers as Record<string, unknown>),
                        data: response.data as unknown,
                        duration: `${String(duration)}ms`,
                        size: JSON.stringify(response.data).length,
                    },
                };

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error & { code?: string };
                const duration = Date.now() - startTime;

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    success: false,
                                    request: {
                                        name: targetRequest.name,
                                        method: targetRequest.method,
                                        url: processedUrl,
                                    },
                                    error: {
                                        message: err.message,
                                        code: err.code,
                                        duration: `${String(duration)}ms`,
                                    },
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            }
        },
    },
];
