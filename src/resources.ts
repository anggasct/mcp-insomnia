import { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import { CollectionStructure } from './types.js';
import { storage } from './storage.js';

interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (request: ReadResourceRequest) => Promise<any>;
}

export function createInsomniaResources(): Resource[] {
  return [
    {
      uri: 'insomnia://collections',
      name: 'Collections',
      description: 'List all collections with folder structure',
      mimeType: 'application/json',
      handler: async () => {
        const collections = storage.getAllCollections();
        const result = Array.from(collections.entries()).map(([id, structure]: [string, CollectionStructure]) => ({
          id,
          name: structure.workspace.name,
          description: structure.workspace.description,
          scope: structure.workspace.scope,
          created: new Date(structure.workspace.created).toISOString(),
          modified: new Date(structure.workspace.modified).toISOString(),
          folders: structure.folders.map(folder => ({
            id: folder._id,
            name: folder.name,
            description: folder.description,
            parentId: folder.parentId,
            created: new Date(folder.created).toISOString(),
            modified: new Date(folder.modified).toISOString(),
          })),
          requestCount: structure.requests.length,
          environmentCount: structure.environments.length,
        }));

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
      uri: 'insomnia://requests',
      name: 'Requests',
      description: 'List all requests in collections with metadata',
      mimeType: 'application/json',
      handler: async () => {
        const allRequests: any[] = [];
        const collections = storage.getAllCollections();

        for (const [collectionId, structure] of collections.entries()) {
          const requests = structure.requests.map(request => ({
            id: request._id,
            collectionId,
            collectionName: structure.workspace.name,
            parentId: request.parentId,
            parentName: structure.folders.find(f => f._id === request.parentId)?.name ?? 'Root',
            name: request.name,
            description: request.description,
            method: request.method,
            url: request.url,
            hasAuthentication: !!request.authentication,
            headerCount: request.headers?.length || 0,
            parameterCount: request.parameters?.length || 0,
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
      uri: 'insomnia://environments',
      name: 'Environments',
      description: 'List environment variables per collection',
      mimeType: 'application/json',
      handler: async () => {
        const allEnvironments: any[] = [];
        const collections = storage.getAllCollections();

        for (const [collectionId, structure] of collections.entries()) {
          const environments = structure.environments.map(env => ({
            id: env._id,
            collectionId,
            collectionName: structure.workspace.name,
            name: env.name,
            description: env.description,
            variableCount: Object.keys(env.data || {}).length,
            variables: Object.entries(env.data || {}).map(([key, value]) => ({
              key,
              value: typeof value === 'string' && value.length > 100 ? `${value.substring(0, 100)}...` : value,
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

    {
      uri: 'insomnia://collection/{id}',
      name: 'Collection Detail',
      description: 'Full details of a specific collection',
      mimeType: 'application/json',
      handler: async (request) => {
        const uri = request.params.uri;
        const collectionId = uri.replace('insomnia://collection/', '');
        const structure = storage.getCollection(collectionId);

        if (!structure) {
          throw new Error(`Collection with ID ${collectionId} not found`);
        }

        const result = {
          workspace: {
            id: structure.workspace._id,
            name: structure.workspace.name,
            description: structure.workspace.description,
            scope: structure.workspace.scope,
            created: new Date(structure.workspace.created).toISOString(),
            modified: new Date(structure.workspace.modified).toISOString(),
          },
          structure: {
            folders: structure.folders.map(folder => ({
              id: folder._id,
              name: folder.name,
              description: folder.description,
              parentId: folder.parentId,
              requestCount: structure.requests.filter(r => r.parentId === folder._id).length,
            })),
            requests: structure.requests.map(request => ({
              id: request._id,
              name: request.name,
              method: request.method,
              url: request.url,
              parentId: request.parentId,
              parentName: request.parentId === collectionId
                ? 'Root'
                : structure.folders.find(f => f._id === request.parentId)?.name ?? 'Unknown',
              hasAuth: !!request.authentication,
              authType: request.authentication?.type,
            })),
            environments: structure.environments.map(env => ({
              id: env._id,
              name: env.name,
              variableCount: Object.keys(env.data || {}).length,
            })),
          },
          statistics: {
            totalRequests: structure.requests.length,
            totalFolders: structure.folders.length,
            totalEnvironments: structure.environments.length,
            methodBreakdown: structure.requests.reduce((acc: Record<string, number>, req) => {
              acc[req.method] = (acc[req.method] || 0) + 1;
              return acc;
            }, {}),
            authenticationBreakdown: structure.requests.reduce((acc: Record<string, number>, req) => {
              const authType = req.authentication?.type ?? 'none';
              acc[authType] = (acc[authType] || 0) + 1;
              return acc;
            }, {}),
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
          const foundRequest = structure.requests.find(r => r._id === requestId);
          if (foundRequest) {
            targetRequest = foundRequest;
            collectionInfo = {
              id: collectionId,
              name: structure.workspace.name,
              parentName: foundRequest.parentId === collectionId
                ? 'Root'
                : structure.folders.find(f => f._id === foundRequest.parentId)?.name ?? 'Unknown',
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
          headers: targetRequest.headers || [],
          parameters: targetRequest.parameters || [],
          body: targetRequest.body || null,
          authentication: targetRequest.authentication ? {
            type: targetRequest.authentication.type,
            hasCredentials: !!(targetRequest.authentication.username ?? targetRequest.authentication.token),
          } : null,
          metadata: {
            created: new Date(targetRequest.created).toISOString(),
            modified: new Date(targetRequest.modified).toISOString(),
            hasHeaders: (targetRequest.headers || []).length > 0,
            hasParameters: (targetRequest.parameters || []).length > 0,
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
        const recentActivity: any[] = [];

        for (const [collectionId, structure] of collections.entries()) {
          totalRequests += structure.requests.length;
          totalFolders += structure.folders.length;
          totalEnvironments += structure.environments.length;

          structure.environments.forEach(env => {
            totalEnvironmentVariables += Object.keys(env.data || {}).length;
          });

          structure.requests.forEach(request => {
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
            requestsPerCollection: totalCollections > 0 ? Math.round(totalRequests / totalCollections * 100) / 100 : 0,
            foldersPerCollection: totalCollections > 0 ? Math.round(totalFolders / totalCollections * 100) / 100 : 0,
            environmentsPerCollection: totalCollections > 0 ? Math.round(totalEnvironments / totalCollections * 100) / 100 : 0,
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
}
