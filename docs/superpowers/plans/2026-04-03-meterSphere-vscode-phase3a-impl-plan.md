# Phase 3A Implementation Plan — Environment + History

## Objective
- Implement Environment management and History capture as Phase 3A, integrating with Phase 2's Navigator + WebView debugger.

## Milestones
- M1: Environment definitions (2 environments) + history scaffolding
- M2: Environment substitution in ApiRequest + history recording
- M3: Basic templates for environments and endpoints
- M4: End-to-end test plan for Phase 3A flows
- M5: Documentation and onboarding updates

## Tasks
- T1: Extend EnvironmentEngine with CRUD and substitution hooks
- T2: Extend HistoryEngine with recording pipeline and search
- T3: Integrate Environment with ApiDebugger request templates
- T4: Implement TemplatesEngine starter for reusable env/endpoints
- T5: Add per-workspace default storage for environments/history (global fallback)
- T6: Add unit tests for engines; integration tests for environment substitution
- T7: Add end-to-end tests for Phase 3A flows
- T8: Documentation update (phase3a-design and onboarding)
- T9: CI hooks and linting updates

## Data models (Phase 3A)
- Environment: id, name, variables, isDefault, associatedWorkspaceId?
- HistoryEntry: id, timestamp, environmentId, ApiRequestTemplate, ApiResponse, durationMs, status
- Template: id, name, content

## Data flows
- On executing a request, environment variables are resolved and substituted into the ApiRequest
- HistoryEntry is created after the response is returned

## Testing plan
- Unit tests for EnvironmentEngine and HistoryEngine
- Integration tests using mocked endpoints
- End-to-end tests for environment selection and history replay
