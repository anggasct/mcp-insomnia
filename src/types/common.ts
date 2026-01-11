import type { InsomniaRequestGroup } from './collection.js';
import type { InsomniaRequest } from './request.js';
import type { InsomniaEnvironment } from './environment.js';

export interface CollectionItem {
    _id: string;
    _type: string;
    name: string;
    parentId?: string;
    description?: string;
    created: number;
    modified: number;
}

export interface EnvironmentVariable {
    key: string;
    value: string | number | boolean;
    type: string;
}

export interface SearchResult {
    type: 'Collection' | 'Folder' | 'Request';
    id: string;
    name: string;
    collection?: {
        id: string;
        name: string;
    };
    match: string;
}

export interface ActivityItem {
    type: 'request' | 'collection';
    id: string;
    name: string;
    collectionName?: string;
    method?: string;
    requestCount?: number;
    modified: number;
}

export interface ExportCollectionArgs {
    collectionId: string;
    filePath?: string;
}

export interface ImportFileArgs {
    filePath: string;
}

export interface DeleteRequestArgs {
    requestId: string;
}

export interface ExecuteRequestArgs {
    requestId: string;
    environmentVariables?: Record<string, string | number | boolean>;
}

export interface GetEnvironmentArgs {
    collectionId: string;
    environmentId?: string;
}

export interface GenerateCodeArgs {
    requestId: string;
    target: string;
    client?: string;
}

export type FolderList = InsomniaRequestGroup[];
export type RequestList = InsomniaRequest[];
export type EnvironmentList = InsomniaEnvironment[];
