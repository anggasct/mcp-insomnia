import { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

export interface JsonSchema {
    type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null';
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    description?: string;
    additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
    description?: string;
    enum?: string[];
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    default?: string | number | boolean;
}

export interface ToolResponseContent {
    type: 'text' | 'image' | 'resource';
    text?: string | string[] | false;
    data?: string;
    mimeType?: string;
}

export interface ToolResponse {
    [x: string]: ToolResponseContent[] | Record<string, string> | boolean | undefined;
    content: ToolResponseContent[];
    isError?: boolean;
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    handler: (request: CallToolRequest) => Promise<ToolResponse>;
}
