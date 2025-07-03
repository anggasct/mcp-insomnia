import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { HTTPSnippet } from 'httpsnippet';
import { storage } from './storage.js';
import {
  CollectionStructure,
  CreateCollectionParams,
  CreateFolderParams,
  CreateRequestParams,
  InsomniaCollection,
  InsomniaEnvironment,
  InsomniaRequest,
  InsomniaRequestGroup,
  InsomniaWorkspace,
  RequestExecutionResult,
  SetEnvironmentVariableParams,
  UpdateRequestParams,
  InsomniaExecution,
} from './types.js';

interface Tool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (request: CallToolRequest) => Promise<any>;
}

function normalizeHeaders(headers: any): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function convertInsomniaRequestToHar(request: InsomniaRequest): any {
  const har: any = {
    method: request.method,
    url: request.url,
    headers: request.headers.map(h => ({ name: h.name, value: h.value })),
    queryString: request.parameters.map(p => ({ name: p.name, value: p.value })),
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headersSize: -1,
    bodySize: -1,
  };

  if (request.body && request.body.text) {
    har.postData = {
      mimeType: request.body.mimeType || 'application/json',
      text: request.body.text,
    };
  }

  return har;
}

export function createInsomniaTools(): Tool[] {
  return [
    {
      name: 'create_collection',
      description: 'Create a new collection/workspace in Insomnia',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Collection name' },
          description: { type: 'string', description: 'Collection description' },
          scope: { type: 'string', enum: ['collection', 'design'], default: 'collection' },
        },
        required: ['name'],
      },
      handler: async (request) => {
        const params = request.params.arguments as unknown as CreateCollectionParams;
        const workspaceId = `wrk_${uuidv4().replace(/-/g, '')}`;

        const workspace: InsomniaWorkspace = {
          _id: workspaceId,
          _type: 'workspace',
          name: params.name,
          description: params.description || '',
          scope: params.scope || 'collection',
          modified: Date.now(),
          created: Date.now(),
        };

        const collectionStructure: CollectionStructure = {
          workspace,
          folders: [],
          requests: [],
          environments: [],
        };

        storage.saveCollection(workspaceId, collectionStructure);

        return {
          content: [
            {
              type: 'text',
              text: `Collection "${params.name}" created successfully with ID: ${workspaceId}`,
            },
          ],
        };
      },
    },

    {
      name: 'create_folder',
      description: 'Create a folder to group requests within a collection',
      inputSchema: {
        type: 'object',
        properties: {
          collectionId: { type: 'string', description: 'ID collection' },
          parentId: { type: 'string', description: 'ID parent folder (optional)' },
          name: { type: 'string', description: 'Folder name' },
          description: { type: 'string', description: 'Folder description' },
        },
        required: ['collectionId', 'name'],
      },
      handler: async (request) => {
        const params = request.params.arguments as unknown as CreateFolderParams;
        const collection = storage.getCollection(params.collectionId);

        if (!collection) {
          throw new Error(`Collection with ID ${params.collectionId} not found`);
        }

        const folderId = `fld_${uuidv4().replace(/-/g, '')}`;
        const folder: InsomniaRequestGroup = {
          _id: folderId,
          _type: 'request_group',
          parentId: params.parentId || params.collectionId,
          name: params.name,
          description: params.description || '',
          modified: Date.now(),
          created: Date.now(),
        };

        collection.folders.push(folder);
        storage.saveCollection(params.collectionId, collection);

        return {
          content: [
            {
              type: 'text',
              text: `Folder "${params.name}" created successfully with ID: ${folderId}`,
            },
          ],
        };
      },
    },

    {
      name: 'list_collections',
      description: 'List all collections and their structure',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        const collections = storage.getAllCollections();
        const result = Array.from(collections.entries()).map(([id, structure]) => ({
          id,
          name: structure.workspace.name,
          description: structure.workspace.description,
          scope: structure.workspace.scope,
          folders: structure.folders.map(f => ({
            id: f._id,
            name: f.name,
            description: f.description,
          })),
          requestCount: structure.requests.length,
          environmentCount: structure.environments.length,
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
                disabled: { type: 'boolean' }
              },
              required: ['name', 'value']
            }
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
                disabled: { type: 'boolean' }
              },
              required: ['name', 'value']
            }
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
        const { requestId, environmentVariables = {} } = request.params.arguments as any;

        let targetRequest: InsomniaRequest | null = null;
        let collectionId: string | null = null;
        const collections = storage.getAllCollections();
        for (const [cId, collection] of collections.entries()) {
          const foundRequest = collection.requests.find(r => r._id === requestId);
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
          targetRequest.headers?.forEach(header => {
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
                processedHeaders['Authorization'] = `Bearer ${auth.token}`;
                break;
              case 'basic':
                const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
                processedHeaders['Authorization'] = `Basic ${credentials}`;
                break;
            }
          }

          let processedBody: any = undefined;
          if (targetRequest.body) {
            if (targetRequest.body.text) {
              processedBody = targetRequest.body.text;
              Object.entries(environmentVariables).forEach(([key, value]) => {
                processedBody = processedBody.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
              });

              if (targetRequest.body.mimeType === 'application/json') {
                try {
                  processedBody = JSON.parse(processedBody);
                } catch (e) {
                }
              }
            }
          }

          const response = await axios({
            method: targetRequest.method.toLowerCase() as any,
            url: processedUrl,
            headers: processedHeaders,
            data: processedBody,
            timeout: 30000,
          });

          const duration = Date.now() - startTime;
          const result: RequestExecutionResult = {
            status: response.status,
            statusText: response.statusText,
            headers: normalizeHeaders(response.headers),
            data: response.data,
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
              headers: normalizeHeaders(response.headers),
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

        } catch (error: any) {
          const duration = Date.now() - startTime;
          const errorResult = {
            error: true,
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            headers: normalizeHeaders(error.response?.headers),
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
              statusMessage: error.response?.statusText ?? error.message,
              headers: normalizeHeaders(error.response?.headers),
              body: JSON.stringify(error.response?.data),
              duration,
              size: JSON.stringify(error.response?.data).length,
            },
            error: {
              message: error.message,
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
                disabled: { type: 'boolean' }
              },
              required: ['name', 'value']
            }
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
                disabled: { type: 'boolean' }
              },
              required: ['name', 'value']
            }
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
          const foundRequest = collection.requests.find(r => r._id === params.requestId);
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

        const updatedCollection = collections.get(targetCollectionId)!;
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
        const { requestId } = request.params.arguments as any;
        const collections = storage.getAllCollections();

        for (const [collectionId, collection] of collections.entries()) {
          const requestIndex = collection.requests.findIndex(r => r._id === requestId);
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
      name: 'set_environment_variable',
      description: 'Set environment variables for a collection',
      inputSchema: {
        type: 'object',
        properties: {
          collectionId: { type: 'string', description: 'ID collection' },
          environmentId: { type: 'string', description: 'Environment ID (optional, will be created if not exists)' },
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

        let environment: InsomniaEnvironment | undefined = collection.environments.find(env => env._id === params.environmentId);

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
              text: `Environment variable "${params.key}" set successfully with value: ${params.value}`,
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
        const { collectionId, environmentId } = request.params.arguments as any;
        const collection = storage.getCollection(collectionId);

        if (!collection) {
          throw new Error(`Collection with ID ${collectionId} not found`);
        }

        let environments = collection.environments;
        if (environmentId) {
          environments = environments.filter(env => env._id === environmentId);
        }

        const result = environments.map(env => ({
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

    {
      name: 'export_collection',
      description: 'Export collection to JSON (Insomnia V4 format)',
      inputSchema: {
        type: 'object',
        properties: {
          collectionId: { type: 'string', description: 'ID of the collection to export' },
          filePath: { type: 'string', description: 'Output file path (optional)' },
        },
        required: ['collectionId'],
      },
      handler: async (request) => {
        const { collectionId, filePath } = request.params.arguments as any;
        const collection = storage.getCollection(collectionId);

        if (!collection) {
          throw new Error(`Collection with ID ${collectionId} not found`);
        }

        const exportData: InsomniaCollection = {
          _type: 'export',
          __export_format: 4,
          __export_date: new Date().toISOString(),
          __export_source: 'mcp-insomnia',
          resources: [
            collection.workspace,
            ...collection.folders,
            ...collection.requests,
            ...collection.environments,
          ],
        };

        const jsonData = JSON.stringify(exportData, null, 2);

        if (filePath) {
          fs.writeFileSync(filePath, jsonData);
          return {
            content: [
              {
                type: 'text',
                text: `Collection exported successfully to: ${filePath}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: jsonData,
              },
            ],
          };
        }
      },
    },

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
        const { filePath } = request.params.arguments as any;

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found at path: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(fileContent) as InsomniaCollection;

        if (data._type !== 'export' || data.__export_format !== 4) {
          throw new Error('Invalid Insomnia V4 export file format.');
        }

        const allResources = data.resources || [];
        const workspaces = allResources.filter(r => r._type === 'workspace') as InsomniaWorkspace[];

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
          const resourcesInWorkspace = allResources.filter(r => r.parentId === workspace._id);

          const folderIds = new Set<string>();
          resourcesInWorkspace.forEach(r => {
            if (r._type === 'request_group') {
              folderIds.add(r._id);
              allChildrenIds.add(r._id);
            }
          });

          allResources.forEach(r => {
            if (!r.parentId || !allChildrenIds.has(r.parentId)) return;

            switch (r._type) {
              case 'request_group':
                structure.folders.push(r as InsomniaRequestGroup);
                break;
              case 'request':
                structure.requests.push(r as InsomniaRequest);
                break;
              case 'environment':
                // Environments can be at the root of the workspace
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
              text: `Successfully imported ${importedCount} collection(s) from ${filePath}`,
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
              "c", "clojure", "csharp", "go", "http", "java", "javascript",
              "kotlin", "node", "objc", "ocaml", "php", "powershell", "python",
              "ruby", "shell", "swift"
            ]
          },
          client: {
            type: 'string',
            description: 'Optional: specify a client for the target language (e.g., "axios" for javascript, "curl" for shell)',
          }
        },
        required: ['requestId', 'target'],
      },
      handler: async (request) => {
        const { requestId, target, client } = request.params.arguments as any;

        let targetRequest: InsomniaRequest | null = null;
        const collections = storage.getAllCollections();
        for (const [, collection] of collections.entries()) {
          const foundRequest = collection.requests.find(r => r._id === requestId);
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
          const code = snippet.convert(target, client);
          return {
            content: [
              {
                type: 'text',
                text: code,
              },
            ],
          };
        } catch (error: any) {
          throw new Error(`Failed to generate code snippet for target "${target}" with client "${client || 'default'}": ${error.message}`);
        }
      },
    },
  ];
}
