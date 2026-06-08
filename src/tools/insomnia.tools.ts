import { insomniaStorage } from '../storage/insomnia-storage.js';
import { storage } from '../storage/storage.js';
import { executeHttpRequest } from '../utils/request-executor.js';
import { resolveInsomniaEnvironmentVariables } from '../utils/env-resolver.js';
import type { Tool, ToolExecutionContext } from '../types/tool.js';
import type { InsomniaRequest } from '../types/request.js';

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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                timeoutMs: {
                    type: 'number',
                    description:
                        'Optional request timeout in milliseconds. Default 30000. Set <= 0 for no timeout (MCP cancellation still applies).',
                },
            },
            required: ['requestId'],
        },
        handler: async (request, context: ToolExecutionContext) => {
            const { requestId, environmentId, overrideVariables, timeoutMs } = request.params.arguments as {
                requestId: string;
                environmentId?: string;
                overrideVariables?: Record<string, string>;
                timeoutMs?: number;
            };

            if (!insomniaStorage.isInsomniaInstalled()) {
                throw new Error(insomniaStorage.getNotInstalledMessage());
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
                authentication:
                    Object.keys(rawReq.authentication).length > 0
                        ? (rawReq.authentication as unknown as InsomniaRequest['authentication'])
                        : undefined,
                modified: rawReq.modified,
                created: rawReq.created,
            };

            const { variables: environmentVariables, warnings } = resolveInsomniaEnvironmentVariables(
                insomniaStorage,
                {
                    requestParentId: rawReq.parentId,
                    environmentId,
                    overrideVariables,
                },
            );

            const httpResult = await executeHttpRequest({
                request: targetRequest,
                environmentVariables,
                mcpSignal: context.signal,
                timeoutMs,
                validateStatus: () => true,
                jsonMimeTypes: ['application/json', 'application/graphql'],
            });

            const processedUrl = httpResult.processed.url;

            if (httpResult.kind === 'success') {
                const result: Record<string, unknown> = {
                    success: true,
                    request: {
                        name: targetRequest.name,
                        method: targetRequest.method,
                        url: processedUrl,
                    },
                    response: {
                        status: httpResult.status,
                        statusText: httpResult.statusText,
                        headers: httpResult.headers,
                        data: httpResult.rawData,
                        duration: `${String(httpResult.duration)}ms`,
                        size: JSON.stringify(httpResult.rawData).length,
                    },
                };

                if (warnings && warnings.length > 0) {
                    result.warnings = warnings;
                }

                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                };
            }

            if (httpResult.kind === 'cancelled') {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    success: false,
                                    cancelled: true,
                                    cancelReason: httpResult.cancelReason,
                                    request: {
                                        name: targetRequest.name,
                                        method: targetRequest.method,
                                        url: processedUrl,
                                    },
                                    error: {
                                        message: httpResult.message,
                                        duration: `${String(httpResult.duration)}ms`,
                                    },
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            }

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
                                    message: httpResult.message,
                                    code: httpResult.code,
                                    duration: `${String(httpResult.duration)}ms`,
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
