# MCP-Insomnia

MCP-Insomnia is an MCP (Model Context Protocol) server that enables AI agents to create and manage API collections in Insomnia-compatible format. This server provides tools and resources for managing collections, requests, and environments that can be exported to Insomnia.

## Installation and Usage

### Prerequisites

- Node.js 18+
- npm or yarn

There are three ways to use `mcp-insomnia`.

### 1. Run with NPX (Recommended)

You can run `mcp-insomnia` directly using `npx` without a global installation.

**Configuration:**

```json
{
  "mcpServers": {
    "insomnia": {
      "command": "npx",
      "args": ["mcp-insomnia"]
    }
  }
}
```

### 2. Install Globally from NPM

Install the package globally using npm.

**Installation:**

```bash
npm install -g mcp-insomnia
```

**Configuration:**

```json
{
  "mcpServers": {
    "insomnia": {
      "command": "mcp-insomnia"
    }
  }
}
```

### 3. Install from Source

Clone the repository and build the project.

**Installation:**

```bash
git clone https://github.com/anggasct/mcp-insomnia.git
cd mcp-insomnia
npm install
npm run build
```

**Configuration:**

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
- `import_from_insomnia_export` - Import collections from a standard Insomnia V4 export file

### Folder Management  

- `create_folder` - Create folder within collection

### Request Management

- `create_request_in_collection` - Create new request
- `update_request` - Update existing request
- `delete_request` - Delete request
- `execute_request` - Execute request and view response
- `generate_code_snippet` - Generate a code snippet for a request in various languages/frameworks

### Environment Management

- `set_environment_variable` - Set environment variable
- `get_environment_variables` - Get environment variables

## Available Resources

- `insomnia://collections` - List all collections
- `insomnia://requests` - List all requests. Can be filtered by `?collectionId={id}`.
- `insomnia://environments` - List environment variables. Can be filtered by `?collectionId={id}`.
- `insomnia://collection/{id}` - Specific collection details
- `insomnia://request/{id}` - Specific request details
- `insomnia://request/{id}/history` - Get the execution history for a specific request
- `insomnia://search?q={keyword}` - Search across all collections, folders, and requests.
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

### Generate Code Snippet

```
Generate a code snippet for request "Get Users" in "javascript"
```

## Data Storage

Data is stored in `~/.mcp-insomnia/collections.json` in JSON format.

## License

MIT License
