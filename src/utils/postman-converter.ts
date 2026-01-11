import type { InsomniaRequest, HttpMethod, InsomniaHeader, InsomniaParameter } from '../types/request.js';
import type { CollectionStructure, InsomniaWorkspace, InsomniaRequestGroup } from '../types/collection.js';
import type { InsomniaEnvironment } from '../types/environment.js';

export interface PostmanCollection {
    info: {
        _postman_id?: string;
        name: string;
        description?: string;
        schema: string;
    };
    item: PostmanItem[];
    variable?: PostmanVariable[];
}

export interface PostmanItem {
    name: string;
    request?: PostmanRequest;
    item?: PostmanItem[];
    description?: string;
}

export interface PostmanRequest {
    method: string;
    header?: PostmanHeader[];
    body?: PostmanBody;
    url: PostmanUrl | string;
    auth?: PostmanAuth;
    description?: string;
}

export interface PostmanHeader {
    key: string;
    value: string;
    disabled?: boolean;
    description?: string;
}

export interface PostmanBody {
    mode: 'raw' | 'formdata' | 'urlencoded' | 'file' | 'graphql';
    raw?: string;
    formdata?: PostmanFormData[];
    urlencoded?: PostmanUrlEncoded[];
    options?: {
        raw?: {
            language?: string;
        };
    };
}

export interface PostmanFormData {
    key: string;
    value?: string;
    type?: 'text' | 'file';
    src?: string;
    disabled?: boolean;
}

export interface PostmanUrlEncoded {
    key: string;
    value: string;
    disabled?: boolean;
}

export interface PostmanUrl {
    raw?: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: PostmanQuery[];
}

export interface PostmanQuery {
    key: string;
    value: string;
    disabled?: boolean;
}

export interface PostmanAuth {
    type: 'bearer' | 'basic' | 'apikey' | 'oauth2' | 'noauth';
    bearer?: Array<{ key: string; value: string }>;
    basic?: Array<{ key: string; value: string }>;
    apikey?: Array<{ key: string; value: string }>;
}

export interface PostmanVariable {
    key: string;
    value: string;
    type?: string;
}

export function convertPostmanToInsomnia(postman: PostmanCollection, workspaceId: string): CollectionStructure {
    const workspace: InsomniaWorkspace = {
        _id: workspaceId,
        _type: 'workspace',
        name: postman.info.name,
        description: postman.info.description || '',
        scope: 'collection',
        created: Date.now(),
        modified: Date.now(),
    };

    const folders: InsomniaRequestGroup[] = [];
    const requests: InsomniaRequest[] = [];
    const environments: InsomniaEnvironment[] = [];

    let requestCounter = 0;
    let folderCounter = 0;

    function processItems(items: PostmanItem[], parentId: string): void {
        for (const item of items) {
            if (item.item && item.item.length > 0) {
                const folderId = `fld_${workspaceId}_${String(folderCounter++)}`;
                folders.push({
                    _id: folderId,
                    _type: 'request_group',
                    parentId,
                    name: item.name,
                    description: item.description,
                    created: Date.now(),
                    modified: Date.now(),
                });
                processItems(item.item, folderId);
            } else if (item.request) {
                const requestId = `req_${workspaceId}_${String(requestCounter++)}`;
                const req = convertPostmanRequest(item.request, requestId, parentId, item.name);
                requests.push(req);
            }
        }
    }

    processItems(postman.item, workspaceId);

    if (postman.variable && postman.variable.length > 0) {
        const envData: Record<string, string | number | boolean> = {};
        for (const v of postman.variable) {
            envData[v.key] = v.value;
        }

        environments.push({
            _id: `env_${workspaceId}_base`,
            _type: 'environment',
            parentId: workspaceId,
            name: 'Base Environment',
            description: 'Variables from Postman collection',
            data: envData,
            created: Date.now(),
            modified: Date.now(),
        });
    }

    return {
        workspace,
        folders,
        requests,
        environments,
    };
}

function convertPostmanRequest(
    request: PostmanRequest,
    requestId: string,
    parentId: string,
    name: string,
): InsomniaRequest {
    let url = '';
    const parameters: InsomniaParameter[] = [];

    if (typeof request.url === 'string') {
        url = request.url;
    } else {
        url = request.url.raw || '';

        if (request.url.query) {
            for (const q of request.url.query) {
                if (!q.disabled) {
                    parameters.push({
                        name: q.key,
                        value: q.value,
                    });
                }
            }
        }
    }

    const headers: InsomniaHeader[] = [];
    if (request.header) {
        for (const h of request.header) {
            if (!h.disabled) {
                headers.push({
                    name: h.key,
                    value: h.value,
                    description: h.description,
                });
            }
        }
    }

    let body = undefined;
    if (request.body) {
        switch (request.body.mode) {
            case 'raw':
                body = {
                    mimeType: request.body.options?.raw?.language === 'json' ? 'application/json' : 'text/plain',
                    text: request.body.raw || '',
                };
                break;
            case 'urlencoded':
                body = {
                    mimeType: 'application/x-www-form-urlencoded',
                    params: request.body.urlencoded
                        ?.filter((p) => !p.disabled)
                        .map((p) => ({
                            name: p.key,
                            value: p.value,
                        })),
                };
                break;
            case 'formdata':
                body = {
                    mimeType: 'multipart/form-data',
                    params: request.body.formdata
                        ?.filter((p) => !p.disabled)
                        .map((p) => ({
                            name: p.key,
                            value: p.value || '',
                            type: p.type as 'text' | 'file',
                            fileName: p.src,
                        })),
                };
                break;
        }
    }

    let authentication = undefined;
    if (request.auth) {
        switch (request.auth.type) {
            case 'bearer': {
                const bearerToken = request.auth.bearer?.find((b) => b.key === 'token');
                if (bearerToken) {
                    authentication = {
                        type: 'bearer' as const,
                        token: bearerToken.value,
                    };
                }
                break;
            }
            case 'basic': {
                const username = request.auth.basic?.find((b) => b.key === 'username');
                const password = request.auth.basic?.find((b) => b.key === 'password');
                if (username && password) {
                    authentication = {
                        type: 'basic' as const,
                        username: username.value,
                        password: password.value,
                    };
                }
                break;
            }
        }
    }

    return {
        _id: requestId,
        _type: 'request',
        parentId,
        name,
        description: request.description,
        url,
        method: request.method.toUpperCase() as HttpMethod,
        headers,
        parameters,
        body,
        authentication,
        created: Date.now(),
        modified: Date.now(),
    };
}
