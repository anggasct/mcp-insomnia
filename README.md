# MCP-Insomnia

MCP-Insomnia is an MCP (Model Context Protocol) server that enables AI agents to create and manage API collections in Insomnia-compatible format. This server provides tools and resources for managing collections, requests, and environments that can be exported to Insomnia.

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Install from NPM

```bash
npm install -g mcp-insomnia
```

### Install from Source

```bash
git clone https://github.com/anggasct/mcp-insomnia.git
cd mcp-insomnia
npm install
npm run build
```

### Add to MCP Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "insomnia": {
      "command": "mcp-insomnia"
    }
  }
}
```

Or if installed from source:

```json
{
  "mcpServers": {
    "insomnia": {
      "command": "node",
      "args": ["/path/to/mcp-insomnia/dist/index.js"]
    }
  }
}
```

## Available Tools

### Collection Management

- `create_collection` - Create new collection/workspace
- `list_collections` - List all collections
- `export_collection` - Export collection to JSON format

### Folder Management  

- `create_folder` - Create folder within collection

### Request Management

- `create_request_in_collection` - Create new request
- `update_request` - Update existing request
- `delete_request` - Delete request
- `execute_request` - Execute request and view response

### Environment Management

- `set_environment_variable` - Set environment variable
- `get_environment_variables` - Get environment variables

## Available Resources

- `insomnia://collections` - List all collections
- `insomnia://requests` - List all requests  
- `insomnia://environments` - List environment variables
- `insomnia://collection/{id}` - Specific collection details
- `insomnia://request/{id}` - Specific request details
- `insomnia://stats` - Global statistics

## Usage Examples

### Create Collection

```
Create a new collection named "API Testing" for testing endpoints
```

### Add Request

```
Add GET request to "API Testing" collection with:
- Name: Get Users
- URL: https://jsonplaceholder.typicode.com/users
- Headers: Content-Type: application/json
```

### Set Environment Variable

```
Set environment variable "baseUrl" with value "https://api.example.com" for "API Testing" collection
```

### Execute Request

```
Execute "Get Users" request using the configured environment variables
```

## Data Storage

Data is stored in `~/.mcp-insomnia/collections.json` in JSON format.

## License

MIT License
