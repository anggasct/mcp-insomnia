# Changelog

## [0.6.0](https://github.com/anggasct/mcp-insomnia/compare/v0.5.6...v0.6.0) (2026-06-07)


### Features

* harden execution tools with response cap, abort, and check gate ([#18](https://github.com/anggasct/mcp-insomnia/issues/18)) ([970c69a](https://github.com/anggasct/mcp-insomnia/commit/970c69aad38a59d3cbcc8bec13ebf517ceabfe91))

## [0.5.6](https://github.com/anggasct/mcp-insomnia/compare/v0.5.5...v0.5.6) (2026-06-07)


### Bug Fixes

* read server version from package.json and harden request parsing ([#16](https://github.com/anggasct/mcp-insomnia/issues/16)) ([65a50c8](https://github.com/anggasct/mcp-insomnia/commit/65a50c871659fe6ed1616eda89444c764a63b081))

## [0.5.5](https://github.com/anggasct/mcp-insomnia/compare/v0.5.4...v0.5.5) (2026-06-07)


### Bug Fixes

* **ci:** restore npm publish via workflow_run and OIDC ([#14](https://github.com/anggasct/mcp-insomnia/issues/14)) ([4148b16](https://github.com/anggasct/mcp-insomnia/commit/4148b161d7fd63db340256eee864ffb04440b0d3))

## [0.5.4](https://github.com/anggasct/mcp-insomnia/compare/v0.5.3...v0.5.4) (2026-06-05)


### Bug Fixes

* **ci:** remove npm@latest upgrade, pin to setup-node built-in npm 10.x ([#12](https://github.com/anggasct/mcp-insomnia/issues/12)) ([c546926](https://github.com/anggasct/mcp-insomnia/commit/c54692620d3024c79fd24b8144926bf69f1567fc))

## [0.5.3](https://github.com/anggasct/mcp-insomnia/compare/v0.5.2...v0.5.3) (2026-06-05)


### Bug Fixes

* **deps:** resolve all npm vulnerabilities ([#10](https://github.com/anggasct/mcp-insomnia/issues/10)) ([4aa5f50](https://github.com/anggasct/mcp-insomnia/commit/4aa5f501c73a5e55c0dae7430e2738850ee972ee))

## [0.5.2](https://github.com/anggasct/mcp-insomnia/compare/v0.5.1...v0.5.2) (2026-05-08)


### Bug Fixes

* **deps:** resolve all dependabot vulnerabilities ([#8](https://github.com/anggasct/mcp-insomnia/issues/8)) ([d07b7bc](https://github.com/anggasct/mcp-insomnia/commit/d07b7bcab358d61ea262ce307811f558a63bf891))

## [0.5.1](https://github.com/anggasct/mcp-insomnia/compare/v0.5.0...v0.5.1) (2026-04-10)


### Bug Fixes

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
