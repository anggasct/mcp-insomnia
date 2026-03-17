import { storage } from '../storage/index.js';
import type { Tool } from '../types/tool.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';
import type { SearchResult, ActivityItem } from '../types/common.js';

export const searchTools: Tool[] = [
    {
        name: 'search',
        description: 'Search for a keyword across all collections, folders, and requests',
        inputSchema: {
            type: 'object',
            properties: {
                keyword: { type: 'string', description: 'Search keyword' },
            },
            required: ['keyword'],
        },
        handler: async (request) => {
            const { keyword } = request.params.arguments as { keyword: string };
            const searchResults: SearchResult[] = [];
            const collections = storage.getAllCollections();
            const lowerKeyword = keyword.toLowerCase();

            for (const [collectionId, structure] of collections.entries()) {
                if (
                    structure.workspace.name.toLowerCase().includes(lowerKeyword) ||
                    (structure.workspace.description || '').toLowerCase().includes(lowerKeyword)
                ) {
                    searchResults.push({
                        type: 'Collection',
                        id: collectionId,
                        name: structure.workspace.name,
                        match: 'Name or description',
                    });
                }

                for (const folder of structure.folders) {
                    if (
                        folder.name.toLowerCase().includes(lowerKeyword) ||
                        (folder.description || '').toLowerCase().includes(lowerKeyword)
                    ) {
                        searchResults.push({
                            type: 'Folder',
                            id: folder._id,
                            name: folder.name,
                            collection: { id: collectionId, name: structure.workspace.name },
                            match: 'Name or description',
                        });
                    }
                }

                for (const req of structure.requests) {
                    let matchReason = '';
                    if (req.name.toLowerCase().includes(lowerKeyword)) matchReason = 'Name';
                    else if ((req.description || '').toLowerCase().includes(lowerKeyword)) matchReason = 'Description';
                    else if (req.url.toLowerCase().includes(lowerKeyword)) matchReason = 'URL';
                    else if (req.method.toLowerCase().includes(lowerKeyword)) matchReason = 'Method';

                    if (matchReason) {
                        searchResults.push({
                            type: 'Request',
                            id: req._id,
                            name: req.name,
                            collection: { id: collectionId, name: structure.workspace.name },
                            match: matchReason,
                        });
                    }
                }
            }

            return {
                content: [{ type: 'text', text: JSON.stringify(searchResults, null, 2) }],
            };
        },
    },

    {
        name: 'get_stats',
        description: 'Get global statistics of all collections',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        handler: async () => {
            const collections = storage.getAllCollections();
            const totalCollections = collections.size;
            let totalRequests = 0;
            let totalFolders = 0;
            let totalEnvironments = 0;
            let totalEnvironmentVariables = 0;
            const methodStats: Record<string, number> = {};
            const authStats: Record<string, number> = {};
            const recentActivity: ActivityItem[] = [];

            for (const [collectionId, structure] of collections.entries()) {
                totalRequests += structure.requests.length;
                totalFolders += structure.folders.length;
                totalEnvironments += structure.environments.length;

                structure.environments.forEach((env: InsomniaEnvironment) => {
                    totalEnvironmentVariables += Object.keys(env.data).length;
                });

                structure.requests.forEach((req: InsomniaRequest) => {
                    methodStats[req.method] = (methodStats[req.method] || 0) + 1;
                    const authType = req.authentication?.type ?? 'none';
                    authStats[authType] = (authStats[authType] || 0) + 1;

                    recentActivity.push({
                        type: 'request',
                        id: req._id,
                        name: req.name,
                        collectionName: structure.workspace.name,
                        method: req.method,
                        modified: req.modified,
                    });
                });

                recentActivity.push({
                    type: 'collection',
                    id: collectionId,
                    name: structure.workspace.name,
                    requestCount: structure.requests.length,
                    modified: structure.workspace.modified,
                });
            }

            recentActivity.sort((a, b) => b.modified - a.modified);

            const result = {
                summary: {
                    totalCollections,
                    totalRequests,
                    totalFolders,
                    totalEnvironments,
                    totalEnvironmentVariables,
                },
                methodBreakdown: methodStats,
                authenticationBreakdown: authStats,
                recentActivity: recentActivity.slice(0, 20),
                averages: {
                    requestsPerCollection:
                        totalCollections > 0 ? Math.round((totalRequests / totalCollections) * 100) / 100 : 0,
                    foldersPerCollection:
                        totalCollections > 0 ? Math.round((totalFolders / totalCollections) * 100) / 100 : 0,
                    environmentsPerCollection:
                        totalCollections > 0 ? Math.round((totalEnvironments / totalCollections) * 100) / 100 : 0,
                },
            };

            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        },
    },
];
