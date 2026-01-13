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


### Folder Management  

- `create_folder` - Create folder within collection

### Request Management

- `create_request_in_collection` - Create new request
- `update_request` - Update existing request
- `delete_request` - Delete request
- `execute_request` - Execute request and view response
- `generate_code_snippet` - Generate a code snippet for a request in various languages/frameworks

### Import Tools

- `import_from_curl` - Parse cURL command into a request
- `import_from_postman` - Import Postman Collection (v2.1) JSON
- `import_from_openapi` - Import OpenAPI/Swagger (v3.0) JSON
- `import_from_insomnia_export` - Import collections from a standard Insomnia V4 export file

### Insomnia Direct Integration (NeDB)

Interact directly with the local Insomnia application database (macOS).

- `list_insomnia_projects` - List all projects/teams from Insomnia
- `list_insomnia_collections` - List all workspaces/collections from Insomnia
- `get_insomnia_collection` - Get full details of a specific Insomnia workspace
- `get_insomnia_request` - Get full details of a specific Insomnia request
- `sync_from_insomnia` - Import a workspace from Insomnia to MCP
- `sync_all_from_insomnia` - Import all workspaces from Insomnia to MCP
- `sync_to_insomnia` - Export an MCP collection back to Insomnia
- `execute_insomnia_request` - Execute a request directly from Insomnia (with env support)

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
Create a new Insomnia collection named "API Testing" for testing endpoints
```

### Add Request

```
Add GET request to "API Testing" Insomnia collection with:
- Name: Get Users
- URL: https://jsonplaceholder.typicode.com/users
- Headers: Content-Type: application/json
```

### Set Environment Variable

```
Set Insomnia environment variable "baseUrl" with value "https://api.example.com" for "API Testing" collection
```

### Execute Request

```
Execute "Get Users" request using the configured environment variables
```

### Generate Code Snippet

```
Generate a code snippet for Insomnia request "Get Users" in "javascript"
```

## Data Storage

Data is stored in two locations:
1. **MCP Storage**: `~/.mcp-insomnia/collections.json`
   - Working area for building/editing collections before syncing
   - Changes here do NOT affect the Insomnia App until synced
   - Ideal for generating new collections, importing from OpenAPI, or mass-refactoring

2. **Insomnia App Storage**: `~/Library/Application Support/Insomnia` (NeDB)
   - The database used by Insomnia App
   - Changes here are visible in the App (may require restart)

## Recommended Workflow

**Scenario A: Creating/Modifying Content**
1. **Import/Fetch**: Pull data from Insomnia (`sync_from_insomnia` or `import_from_openapi`)
2. **Edit**: Modify requests/folders using MCP tools (`create_request`, `update_request`)
3. **Publish**: Sync changes back to Insomnia (`sync_to_insomnia`)

**Scenario B: Running Existing Requests**
- Use `execute_insomnia_request` to run requests directly from Insomnia App without syncing

## License

[MIT License](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
