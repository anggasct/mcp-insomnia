import { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';

export interface ResourceContent {
    type: 'text' | 'blob';
    text?: string;
    blob?: string;
    uri?: string;
    mimeType?: string;
}

export interface ResourceResponse {
    [x: string]: ResourceContent[] | Record<string, string> | undefined;
    contents: ResourceContent[];
}

export interface Resource {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
    handler: (request: ReadResourceRequest) => Promise<ResourceResponse>;
}
