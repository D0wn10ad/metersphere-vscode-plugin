# Phase 1 MVP1 Design — MeterSphere VSCode Extension (v2.x baseline)

## Overview
- Phase 1 MVP1 delivers a minimal, user-authenticated VSCode extension capable of debugging MeterSphere v2 APIs and synchronizing API definitions on demand. Authentication uses a user-provided API token. WorkspaceId and ProjectId persist in user settings.

## Goals and success criteria
- Token-based authentication attached as Authorization: Bearer <token> on all API calls.
- WorkspaceId and ProjectId stored in global user settings and included in requests.
- WebView-based API debugger to compose and execute requests; display readable responses.
- On-demand pull/push synchronization with basic conflict prompts.
- Token and IDs persisted in user settings with a reset/clear option.

## Scope
- In-scope: Token, workspace/project persistence; WebView debugger; on-demand pull/push; basic conflict prompts.
- Out-of-scope for Phase 1: Navigator (TreeView), advanced environments, history, mocks, telemetry.

## Assumptions
- MeterSphere v2 endpoints remain stable.
- Tokens are sufficiently long-lived for MVP; users can refresh by re-entering token.

## Architecture overview
- TokenManager: stores/validates token and attaches Authorization header.
- SettingsManager: persists workspaceId and projectId in global settings.
- ApiDebugger (WebViewController): provides a simple request builder/response viewer.
- SyncEngine: handles pull/push against MeterSphere v2 with basic conflict handling.
- Data flows: WebView interacts with TokenManager/SettingsManager; API calls include token and IDs.

## Data models (Phase 1)
- MeterSphereToken: { token: string, issuedAt?: string, expiresAt?: string }
- WorkspaceContext: { workspaceId: string }
- ProjectContext: { projectId: string }
- ApiRequest: { method: string, path: string, headers: Record<string, string>, body?: any }
- ApiResponse: { statusCode: number, headers: Record<string, string>, body?: any, durationMs?: number }
- SyncMetadata: { lastPulledAt?: string, lastSyncedAt?: string, lastSyncedVersion?: string }

## API surface mapping (MeterSphere v2.x)
- Auth: Authorization: Bearer <token>
- Discovery: API definitions discovery endpoints
- Pull: fetch API definitions
- Push: push local API definitions/edits
- Context: workspaceId and projectId propagated per v2 conventions

## UX outline
- WebView: minimal request builder (method, endpoint, headers, body) and response viewport
- Status indicators: token/workspaceId/projectId presence; sync state
- Commands: openDebugger, setToken, setWorkspace, setProject, pull, push, reset
- Settings keys: metersphere.apiToken, metersphere.workspaceId, metersphere.projectId, metersphere.syncEnabled

## Persistence strategy
- Global user settings for token/workspaceId/projectId; reset option available

## Error handling and resilience
- 401/403 re-prompt token; network errors with user guidance; 4xx/5xx surfaced clearly

## Testing plan
- Unit tests for TokenManager/SettingsManager and HTTP layer
- Integration tests with mocked MeterSphere v2 endpoints
- Manual UI checks for WebView and response formatting

## Security considerations
- Token stored in settings (Phase 2 migration to SecretStorage discussed)

## Milestones
- MVP1: token/context persistence, WebView debugger, on-demand sync
- M2: polish sync flow and error handling
- M3: readiness for Phase 2 Navigator integration

## Risks and mitigations
- Token exposure: document SecretStorage migration later
- Sync conflicts: prompts and simple resolution flow
- MVP scope creep: strict scope boundaries and design reviews

## Acceptance criteria
- Token attached to all API calls; workspaceId/projectId used in requests
- WebView can send a request and render a JSON response
- Pull/Push endpoints work with basic conflict prompts
