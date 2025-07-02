#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createInsomniaTools } from './tools.js';
import { createInsomniaResources } from './resources.js';

const server = new Server(
  {
    name: 'mcp-insomnia',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

const tools = createInsomniaTools();

server.setRequestHandler(
  ListToolsRequestSchema,
  async () => {
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  }
);

server.setRequestHandler(
  CallToolRequestSchema,
  async (request) => {
    const { name } = request.params;
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return await tool.handler(request);
  }
);

const resources = createInsomniaResources();

server.setRequestHandler(
  ListResourcesRequestSchema,
  async () => {
    return {
      resources: resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      })),
    };
  }
);

server.setRequestHandler(
  ReadResourceRequestSchema,
  async (request) => {
    const { uri } = request.params;
    const resource = resources.find(r => r.uri === uri || uri.startsWith(r.uri.replace('{id}', '')));
    if (!resource) {
      throw new Error(`Resource ${uri} not found`);
    }
    return await resource.handler(request);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Insomnia server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
