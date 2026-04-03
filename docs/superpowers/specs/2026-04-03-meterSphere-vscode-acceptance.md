# Acceptance Criteria — Phase 1 MVP1 and Phase 2

Phase 1 MVP1:
- Token attached to all API calls via Authorization: Bearer <token> and persisted
- workspaceId and projectId persisted in global settings and used in requests
- WebView API Debugger can send a request and render a readable JSON response
- Pull fetches API definitions and populates internal cache
- Push pushes local definitions with basic conflict prompts

Phase 2:
- Navigator TreeView renders API structure from MeterSphere v2 discovery data
- Selecting a node preloads a template into WebView
- All major actions accessible via commands (token/workspace/project/pull/push/openDebugger/refresh)
- On-demand sync works with UI indicators
