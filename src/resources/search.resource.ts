import { storage } from '../storage/index.js';
import type { Resource } from '../types/resource.js';
import type { InsomniaRequest } from '../types/request.js';
import type { InsomniaEnvironment } from '../types/environment.js';
import type { SearchResult, ActivityItem } from '../types/common.js';

export const searchResources: Resource[] = [
    {
        uri: 'insomnia://search',
        name: 'Search',
        description: 'Search for a keyword across all collections, folders, and requests. Use with ?q=keyword',
        mimeType: 'application/json',
        handler: async (request) => {
            const uri = request.params.uri;
            const url = new URL(uri);
            const keyword = url.searchParams.get('q');

            if (!keyword) {
                throw new Error('Search keyword must be provided with ?q=');
            }

            const searchResults: SearchResult[] = [];
            const collections = storage.getAllCollections();
            const lowerCaseKeyword = keyword.toLowerCase();

            for (const [collectionId, structure] of collections.entries()) {
                if (
                    structure.workspace.name.toLowerCase().includes(lowerCaseKeyword) ||
                    (structure.workspace.description || '').toLowerCase().includes(lowerCaseKeyword)
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
                        folder.name.toLowerCase().includes(lowerCaseKeyword) ||
                        (folder.description || '').toLowerCase().includes(lowerCaseKeyword)
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
                    if (req.name.toLowerCase().includes(lowerCaseKeyword)) matchReason = 'Name';
                    else if ((req.description || '').toLowerCase().includes(lowerCaseKeyword))
                        matchReason = 'Description';
                    else if (req.url.toLowerCase().includes(lowerCaseKeyword)) matchReason = 'URL';
                    else if (req.method.toLowerCase().includes(lowerCaseKeyword)) matchReason = 'Method';

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
                contents: [
                    {
                        type: 'text',
                        text: JSON.stringify(searchResults, null, 2),
                    },
                ],
            };
        },
    },

    {
        uri: 'insomnia://stats',
        name: 'Statistics',
        description: 'Global statistics of all collections',
        mimeType: 'application/json',
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

                structure.requests.forEach((request: InsomniaRequest) => {
                    methodStats[request.method] = (methodStats[request.method] || 0) + 1;
                    const authType = request.authentication?.type ?? 'none';
                    authStats[authType] = (authStats[authType] || 0) + 1;

                    recentActivity.push({
                        type: 'request',
                        id: request._id,
                        name: request.name,
                        collectionName: structure.workspace.name,
                        method: request.method,
                        modified: request.modified,
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
