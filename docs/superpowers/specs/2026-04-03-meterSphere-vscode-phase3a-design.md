# Phase 3A Design — Environment + History

## Objective
- Introduce Environment management and robust History capture, integrating with the existing Phase 2 Navigator + Option C UX and WebView debugger.

## Scope
- Phase 3A focuses on EnvironmentEngine and HistoryEngine plus the integration touchpoints with WebView templates.
- Per-workspace persistence as the default; Phase 4 may extend to per-workspace toggles for other features.
- SecretStorage migration remains out-of-scope for Phases 1–3.

## Architecture overview
- EnvironmentEngine: manages definitions, variables, resolution, and substitution within ApiRequest/Template payloads.
- HistoryEngine: stores HistoryEntry records with environment context, request/response payloads, duration, and status.
- TemplatesEngine (starter): supports reusable templates for environments and endpoints; exposes via Navigator/WebView integration.
- TelemetryEngine: optional, opt-in analytics scaffolding for Phase 3 insights.
- Persisted state: Phase 3A uses per-workspace storage defaults for environments/history; global as fallback.

## Data models (Phase 3A)
- Environment: id, name, variables (Record<string, string>), isDefault, associatedWorkspaceId?
- HistoryEntry: id, timestamp, environmentId, ApiRequestTemplate, ApiResponse, durationMs, status
- Template: id, name, content

## Data flows
- Execution: Resolve environment variables, apply to ApiRequest, execute via MeterSphere v2, record HistoryEntry
- Navigator: Expose environments in UI; selection updates WebView environment context

## UI/UX
- Environment editor panel (CRUD for environments; variable editor grid)
- History panel: search, filter, replay
- WebView: environment-aware payloads; template visibility

## Persistence & settings
- Phase 3A persists environments/history in workspace-scoped storage by default; allow future toggle to global scope if needed
- Settings keys retained from Phase 1/2; Environment/History persistence is separate from token/workspace/project keys

## Testing strategy
- Unit: EnvironmentEngine, HistoryEngine
- Integration: environment substitution with mocked endpoints
- E2E: environment selection + execution + history replay

## Milestones
- M1: Basic environment definitions (2 environments) + history scaffolding
- M2: Environment substitution validated in requests; history capture
- M3: Templates integration and export/import
- M4: End-to-end testing and QA readiness

## Risks and mitigations
- Substitution complexity; start simple with key-value pairs
- Persistence scope ambiguity; document per-workspace default clearly

## Acceptance criteria
- Multiple environments definable; variables resolve in requests
- History entries with environment context; replay works
- Phase 2 persistence unaffected
