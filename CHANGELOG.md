# Changelog

## [0.5.1](https://github.com/anggasct/mcp-insomnia/compare/v0.5.0...v0.5.1) (2026-04-10)


### Bug Fixes

* **deps:** update vulnerable dependencies ([#4](https://github.com/anggasct/mcp-insomnia/issues/4)) ([fb6a042](https://github.com/anggasct/mcp-insomnia/commit/fb6a0424dc0bbe882c17d0821fcff454dd5fed85))
* **deps:** update vulnerable dependencies ([#5](https://github.com/anggasct/mcp-insomnia/issues/5)) ([1d19852](https://github.com/anggasct/mcp-insomnia/commit/1d198521e4b24da03735127e37595b8bc2e4cfbf))

## [0.5.0] - 2026-03-17

### Added
- `INSOMNIA_DATA_DIR` environment variable for custom Insomnia data path
- Auto-detect Flatpak installation on Linux (`~/.var/app/rest.insomnia.Insomnia/config/Insomnia`)
- Improved error messages showing all checked paths when Insomnia is not found
- New tools: `get_collection_detail`, `list_requests`, `get_request`, `get_request_history`, `search`, `get_stats`

### Changed
- All MCP resources converted to tools for better client compatibility

### Removed
- MCP resource layer (`insomnia://` resources)

---

## [0.4.0] - 2026-01-13

### Added
- **Environment Management**:
  - Cascading environment merging: Global → Base → Sub → Folder → Override
- **Internal**:
  - New storage helpers: `getGlobalEnvironment`, `getAncestorChain`, `getBaseEnvironment`


## [0.3.0] - 2025-07-10

### Added
- `execute_insomnia_request` tool for direct request execution
- Environment variable substitution support
- `list_insomnia_projects` tool

### Changed
- Improved error handling in request execution

---

## [0.2.1] - 2025-07-04

### Fixed
- Version bump fix

---

## [0.2.0] - 2025-07-04

### Added
- `generate_code_snippet` tool for generating code from requests

---

## [0.1.0] - 2025-07-02

### Added
- Initial release
- Basic collection management
- Request CRUD operations
- MCP server implementation
