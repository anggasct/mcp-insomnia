#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createInsomniaTools } from './tools/index.js';

const mcpServer = new McpServer(
    {
        name: 'mcp-insomnia',
        version: '0.5.0',
    },
    {
        capabilities: {
            tools: {},
        },
    },
);

const server = mcpServer.server;
const tools = createInsomniaTools();

server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
        tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        })),
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
        throw new Error(`Tool ${name} not found`);
    }
    return await tool.handler(request);
});

async function main() {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
}

main().catch((error: unknown) => {
    console.error('Server error:', error);
    process.exit(1);
});
