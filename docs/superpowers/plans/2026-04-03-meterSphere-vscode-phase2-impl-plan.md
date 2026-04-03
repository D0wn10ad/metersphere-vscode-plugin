# Phase 2 Implementation Plan — Core Navigator + Option C (on-demand sync)

## Objective
Deliver Phase 2 with a Core Navigator (TreeView) and Option C UX, enabling on-demand pull/push sync, integrated with the WebView API debugger.

## Milestones
- M1: NavigatorEngine and TreeView skeleton implemented; API definitions model in place
- M2: Navigator + WebView integration; selection prefill workflow
- M3: Command surface wired; pull/push integrated; conflict prompts
- M4: End-to-end tests and QA
- M5: Documentation and onboarding materials

## Tasks
- T1: Extend SettingsManager to support per-workspace toggle (optional) [scaffold].
- T2: Implement NavigatorEngine with discovery API + caching.
- T3: Wire Navigator with TreeView UI and selection events to preload WebView templates.
- T4: Implement CommandRouter for Phase 2 commands.
- T5: Integrate on-demand SyncEngine with pull/push flows.
- T6: Update ApiDebugger to accept prefilled templates from Navigator selections.
- T7: Implement conflict resolution prompts.
- T8: Implement tests (unit/integration) for navigator + sync.
- T9: Documentation updates for Phase 2.
- T10: QA and user feedback loop.

## Data flow overview
- Token/Context: Token/WorkspaceId/ProjectId persisted in global settings; used by Dispatcher.
- Discovery: MeterSphere v2 discovery endpoints powering Navigator.
- Pre-fill: Selecting a node updates the WebView with a prefilled template.
- Sync: Pull refreshes discovery; Push sends edits; conflicts surfaced via prompts.

## Per-workspace persistence note
- Phase 2 defaults to global persistence; a switch to per-workspace persistence can be introduced in Phase 3 or a mid-Phase 2 patch.

## Testing plan
- Unit tests for NavigatorEngine and SyncEngine
- Integration tests against mocked MeterSphere v2 endpoints
- E2E tests for Navigator → WebView → Run request
