export interface InsomniaCollection {
    _type: 'export';
    __export_format: number;
    __export_date: string;
    __export_source: string;
    resources: InsomniaResource[];
}

export interface InsomniaResource {
    _id: string;
    _type: string;
    parentId?: string;
    name: string;
    description?: string;
    modified: number;
    created: number;
}

export interface InsomniaWorkspace extends InsomniaResource {
    _type: 'workspace';
    scope: 'collection' | 'design';
}

export interface InsomniaProject extends InsomniaResource {
    _type: 'project';
    remoteId: string | null;
}

export interface InsomniaRequestGroup extends InsomniaResource {
    _type: 'request_group';
    environment?: Record<string, string | number | boolean>;
}

export interface CollectionStructure {
    workspace: InsomniaWorkspace;
    folders: InsomniaRequestGroup[];
    requests: InsomniaRequest[];
    environments: InsomniaEnvironment[];
}

export interface CreateCollectionParams {
    name: string;
    description?: string;
    scope?: 'collection' | 'design';
}

export interface CreateFolderParams {
    collectionId: string;
    parentId?: string;
    name: string;
    description?: string;
}

import type { InsomniaRequest } from './request.js';
import type { InsomniaEnvironment } from './environment.js';
