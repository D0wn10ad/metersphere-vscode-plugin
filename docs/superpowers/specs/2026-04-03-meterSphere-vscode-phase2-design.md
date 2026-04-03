# Phase 2 Design — Core Navigator + Option C integration (on-demand sync)

## Objective
Add Core Navigator (TreeView) for MeterSphere v2 API discovery, integrated with the existing WebView-based API debugger. Phase 2 adopts Option C UX (WebView + Command-driven flows) as first-class interactions, with on-demand pull/push sync.

## Scope
- NavigatorEngine: TreeView reflecting MeterSphere v2 API structure; selection loads a request skeleton into WebView.
- Command surface: all major actions exposed as VSCode commands (set token, set workspace, set project, pull, push, open debugger, refresh).
- Sync: on-demand pull/push with conflict prompts; token/workspace/project persistence carried over from Phase 1.
- Persistence: global settings baseline; per-workspace toggle considered for Phase 3+ but not mandatory in Phase 2.

## Architecture overview
- Modules: TokenManager, SettingsManager, ApiDebugger (WebView), NavigatorEngine (TreeView), SyncEngine, CommandRouter, UI layers.
- Data models: ApiDefinition, ApiNode, ApiRequestTemplate, SyncMetadata, Token/Workspace/Project context.
- Data flows: Discovery → TreeView → selection → prefill in WebView; Pull/Push flows through SyncEngine.

## Navigator design
- Tree structure: folders and endpoints; endpoints map to ApiDefinition nodes; operation nodes carry templates.
- Selection: when a node is selected, ApiDebugger loads a template with prefilled fields.
- Caching: naive in-memory cache with optional workspace-scoped snapshots for performance.

## Sync design
- Pull: fetch definitions from MeterSphere v2, refresh Navigator, and update templates in WebView.
- Push: push local edits to MeterSphere v2 with conflicts surfaced in prompts.
- Conflict resolution: simple prompts to choose overwrite or keep local; log events for telemetry.

## Command surface
- Phase 2 commands: metersphere.setToken, metersphere.setWorkspace, metersphere.setProject, metersphere.pull, metersphere.push, metersphere.openDebugger, metersphere.refreshNavigator, metersphere.openNavigator

## Persistence
- Settings keys: metersphere.apiToken, metersphere.workspaceId, metersphere.projectId, metersphere.syncEnabled
- Global first; per-workspace toggle considered for Phase 3.

## UI/UX blueprint
- WebView: primary editing surface; TreeView on the side; status indicators for token/workspace/project/sync.
- Keyboard navigation: leveraged via VSCode commands; focus management between navigator and debugger.

## Testing
- Unit tests: NavigatorEngine, SyncEngine, TokenManager, SettingsManager
- Integration tests: mocked MeterSphere v2 endpoints for pull/push and token validation
- E2E tests: end-to-end flow across Navigator → WebView → API execution

## Security considerations
- Migration plan for SecretStorage; Phase 2 will document opt-in migration and best practices.

## Milestones
- M1: Navigator UI scaffold and API discovery integration with mock data
- M2: WebView integration with selection-driven prefill
- M3: Pull/Push conflict flows and end-to-end sync validation
- M4: QA readiness and docs
