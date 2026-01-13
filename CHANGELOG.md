# Changelog

## [Unreleased]

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
