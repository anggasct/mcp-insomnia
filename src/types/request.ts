import type { InsomniaResource } from './collection.js';
import type { InsomniaAuthentication } from './auth.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';

export interface InsomniaHeader {
    id?: string;
    name: string;
    value: string;
    description?: string;
    disabled?: boolean;
}

export interface InsomniaParameter {
    id?: string;
    name: string;
    value: string;
    description?: string;
    disabled?: boolean;
}

export interface InsomniaRequestBody {
    mimeType?: string;
    text?: string;
    params?: InsomniaFormParameter[];
    fileName?: string;
    graphql?: {
        query: string;
        variables?: string; // JSON string
    };
}

export interface InsomniaFormParameter {
    id?: string;
    name: string;
    value: string;
    description?: string;
    disabled?: boolean;
    type?: 'text' | 'file';
    fileName?: string;
}

export interface InsomniaRequest extends InsomniaResource {
    _type: 'request';
    url: string;
    method: HttpMethod;
    headers: InsomniaHeader[];
    body?: InsomniaRequestBody;
    parameters: InsomniaParameter[];
    authentication?: InsomniaAuthentication;
    settingStoreCookies?: boolean;
    settingSendCookies?: boolean;
    settingDisableRenderRequestBody?: boolean;
    settingEncodeUrl?: boolean;
    settingRebuildPath?: boolean;
    settingFollowRedirects?: 'global' | 'on' | 'off';
    history?: InsomniaExecution[];
}

export interface InsomniaExecution {
    _id: string;
    parentId: string;
    timestamp: number;
    response: {
        statusCode: number;
        statusMessage: string;
        headers: Record<string, string | string[] | undefined>;
        body: string;
        duration: number;
        size: number;
    };
    error?: {
        message: string;
        stack?: string;
    };
}

export type ResponseData = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface RequestExecutionResult {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: ResponseData;
    duration: number;
    size: number;
    timestamp: string;
}

export interface CreateRequestParams {
    collectionId: string;
    folderId?: string;
    name: string;
    method: HttpMethod;
    url: string;
    headers?: InsomniaHeader[];
    body?: InsomniaRequestBody;
    parameters?: InsomniaParameter[];
    authentication?: InsomniaAuthentication;
    description?: string;
}

export interface UpdateRequestParams {
    requestId: string;
    name?: string;
    method?: HttpMethod;
    url?: string;
    headers?: InsomniaHeader[];
    body?: InsomniaRequestBody;
    parameters?: InsomniaParameter[];
    authentication?: InsomniaAuthentication;
    description?: string;
}
