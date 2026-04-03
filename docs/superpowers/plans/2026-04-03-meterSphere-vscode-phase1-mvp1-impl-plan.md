# Phase 1 MVP1 Implementation Plan

> **For agentic workers:** Use subagent-driven-development where possible.

**Goal:** Implement Phase 1 MVP1 for MeterSphere VSCode extension with token-based authentication, workspaceId/projectId persistence, a WebView API debugger, and on-demand sync to MeterSphere v2.

**Architecture:** Layered extension with TokenManager, SettingsManager, ApiDebugger (WebView), and SyncEngine. Phase 2 will introduce NavigatorEngine; Phase 3 will expand features.

**Tech Stack:** TypeScript, VSCode Extension API, WebView, Node-fetch for HTTP, JSON for payloads.

---

## Task 1 — Settings keys and global persistence
- Files: `src/metersphere/settingsManager.ts` (read/write)  
- Modify: None (new file added by patch; ensure keys exist)
- Test: Manually verify VSCode settings: metersphere.apiToken, metersphere.workspaceId, metersphere.projectId, metersphere.syncEnabled
- Steps:
 1. Add constants for token/workspace/project keys.
 2. Implement get/set helpers for token, workspace, project, and sync flag.
 3. Expose a clear reset action in UI (not code-driven in plan).
- Expected outcome: Settings are persisted globally and retrievable by TokenManager/SettingsManager.

- Code snippet (illustrative, not final):
```ts
// in settingsManager.ts
export class SettingsManager { ... }
```

---

## Task 2 — Token management
- Files: `src/metersphere/tokenManager.ts` (new)
- Task: Persist token in global settings; provide getToken, setToken, applyAuth, clearToken
- Test: Simulate token storage and applyAuth to header map; ensure Authorization header is present when token exists
- Steps:
 1. Implement setToken/getToken in TokenManager
 2. Implement applyAuth to mutate headers
 3. Implement clearToken for reset path
- Expected outcome: Token attached to every HTTP request via Authorization header.

- Code: see `src/metersphere/tokenManager.ts` (added)

---

## Task 3 — HTTP client wrapper
- Files: `src/metersphere/httpClient.ts` (new)
- Task: Provide a generic httpRequest that attaches token and returns structured HttpResponse
- Test: Request to mocked endpoint; ensure token is added and body parsed as JSON when content-type is JSON
- Steps:
 1. Implement httpRequest with token integration
 2. Return status, headers, body, durationMs
- Expected outcome: Consistent HTTP layer for API calls.

- Code: see `src/metersphere/httpClient.ts` (added)

---

## Task 4 — WebView-based API debugger scaffold
- Files: `src/metersphere/webviewController.ts` (new)
- Task: Provide a simple WebView with a minimal UI and a message bridge for sending requests to MeterSphere v2
- Test: Open debugger; issue a dummy request; observe a response event
- Steps:
 1. Create WebView panel with script bridge
 2. Implement placeholder methods for sending requests to API
 3. Render simple response payloads in the WebView
- Expected outcome: A working UI surface for building/sending API calls
- Note: This is MVP scaffolding; more UI polish will come in Phase 2/3

- Code: see `src/metersphere/webviewController.ts` (added)

---

## Task 5 — Extension bootstrap
- Files: `src/extension.ts`, `src/extension.ts` (new bootstrap), `src/extension.ts`/`src/metersphere/extension.ts` integration
- Task: Wire up a single command to open the API debugger; ensure activation etc.
- Test: Load extension and run the debugger via Command Palette
- Steps:
 1. Implement `activate` function to register command `metersphere.openDebugger`.
 2. Provide minimal activation path for MVP.
- Expected outcome: Triggerable debugger from VSCode.

- Code: see `src/extension.ts` and `src/metersphere/extension.ts` (added)

---

## Task 6 — Phase 1 tests scaffolding
- Files: `test/placeholder.test.js` (added)
- Task: Add placeholder test scaffold; later replace with actual unit tests for TokenManager and httpClient
- Steps:
 1. Add a basic test that always passes to keep CI green during early wiring
- Expected outcome: CI passes; ready to fill in tests as features are wired

---

## Task 7 — Documentation and plan consolidation
- Files: All designs and implementation plan markdowns under `docs/` as drafted in previous messages
- Task: Ensure all design and plan artifacts exist and are consistent
- Steps:
 1. Create/verify `docs/superpowers/specs/...` and `docs/superpowers/plans/...` entries
- Expected outcome: All planning artifacts present in repo for review

---

## Git hygiene & commits
- Commit structure: separate commits per task; message format: feat(scope): description
- PR policy: ensure review checkpoints if merging to main

---

## Risks
- Token security: document migration to SecretStorage in Phase 2
- Navigator and Sync integration risk: managed via phased milestones
