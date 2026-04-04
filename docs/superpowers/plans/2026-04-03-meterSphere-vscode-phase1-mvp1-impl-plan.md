# Phase 1 MVP1 Implementation Plan

> **Status:** ✅ Complete — all tasks finished and committed to `main`.

**Goal:** Implement Phase 1 MVP1 for MeterSphere VSCode extension with token-based authentication, workspaceId/projectId persistence, a WebView API debugger, and on-demand sync to MeterSphere v2.

**Architecture:** Layered extension with TokenManager, SettingsManager, ApiDebugger (WebView), and SyncEngine. Phase 2 will introduce NavigatorEngine; Phase 3 will expand features.

**Tech Stack:** TypeScript, VSCode Extension API, WebView, Node-fetch for HTTP, JSON for payloads.

---

## Task 1 — Settings keys and global persistence ✅

**Files:**
- Created: `src/metersphere/settingsManager.ts`
- Test: `src/metersphere/settingsManager.ts` — manually verify VSCode settings: `metersphere.apiToken`, `metersphere.workspaceId`, `metersphere.projectId`, `metersphere.syncEnabled`

**What was done:**
- Constants for token/workspace/project/sync keys defined on `SettingsManager`
- `getToken`/`setToken`/`getWorkspaceId`/`setWorkspaceId`/`getProjectId`/`setProjectId`/`isSyncEnabled`/`setSyncEnabled` implemented
- All use `vscode.workspace.getConfiguration().update/get` with `vscode.ConfigurationTarget.Global`

**Verification:** `npm run compile` passes; `npx tsc -p tsconfig.json --noEmit` shows zero errors.

---

## Task 2 — Token management ✅

**Files:**
- Created: `src/metersphere/tokenManager.ts` (production, VSCode-based)
- Created: `src/metersphere/tokenManager.js` (CommonJS shim for Node-based tests)
- Test: `test/tokenManager.test.ts`

**What was done:**
- `TokenManager.setToken`/`getToken`/`applyAuth`/`clearToken` implemented
- `applyAuth` sets `Authorization: Bearer <token>` on a headers map when token is non-empty
- Jest test: `test/tokenManager.test.ts` — passes (✓)

**Verification:** `npx jest test/tokenManager.test.ts --verbose` → PASS.

---

## Task 3 — HTTP client wrapper ✅

**Files:**
- Created: `src/metersphere/httpClient.ts` (production)
- Created: `src/metersphere/httpClient.js` (CommonJS shim for Node-based tests)
- Test: `test/httpClient.test.ts`

**What was done:**
- `httpRequest(method, url, headers, body, tokenOverride)` returns `{ status, headers, body, durationMs }`
- Token injected via `TokenManager.applyAuth` when no override given
- Global `fetch` or `node-fetch` fallback for fetch resolution
- JSON body parsing when `content-type` is `application/json`
- Jest test: `test/httpClient.test.ts` — passes (✓)

**Verification:** `npx jest test/httpClient.test.ts --verbose` → PASS.

---

## Task 4 — WebView-based API debugger scaffold ✅

**Files:**
- Created: `src/metersphere/webviewController.ts`
- Test: `test/` (manual; VSCode runtime required for full E2E)

**What was done:**
- `WebViewController` class with `open()` that creates a `vscode.window.createWebviewPanel`
- Minimal HTML form with URL/method/headers/body fields
- Message bridge via `onDidReceiveMessage`; dispatches `sendRequest` and `setToken` commands
- `sendRequest` calls `httpRequest` and posts response back to webview

**Verification:** `npm run compile` passes; `npx tsc -p tsconfig.json --noEmit` zero errors.

---

## Task 5 — Extension bootstrap ✅

**Files:**
- Created: `src/extension.ts` (top-level entry point)
- Created: `src/metersphere/extension.ts` (inner bootstrap)

**What was done:**
- Top-level `activate`/`deactivate` functions in `src/extension.ts`
- Inner `activate` registers `metersphere.openDebugger` command
- Command handler instantiates and opens `WebViewController`

**Verification:** `npm run compile` passes.

---

## Task 6 — Phase 1 test scaffolding ✅

**Files:**
- Created: `test/tokenManager.test.ts` (Jest TS test)
- Created: `test/httpClient.test.ts` (Jest TS test)
- Created: `jest.config.js`
- Created: `test/vscode-mock-setup.js` (global vscode mock for Jest)
- Created: `src/vscode.d.ts` (TypeScript type declarations for vscode mock)
- Created: `node_modules/vscode/index.js` (CommonJS vscode mock)

**What was done:**
- Jest + ts-jest v29 wired (v28 is incompatible with Jest 29)
- `jest.config.js` targets only `**/test/**/*.test.ts` (Node-based `.js` tests with `process.exit()` excluded)
- `test/vscode-mock-setup.js` runs before each test via `setupFilesAfterEnv`, mocking the entire `vscode` module with in-memory config storage
- `src/vscode.d.ts` provides TypeScript declarations for `vscode.ConfigurationTarget`, `vscode.window`, `vscode.commands`, `vscode.WebviewPanel`, `vscode.Webview`, `vscode.ExtensionContext`, etc.
- `node_modules/vscode/index.js` is the CommonJS counterpart of the mock

**Important notes for future agents:**
- `ts-jest` must be `^29.0.0` — if `npm install` fails with ERESOLVE peer dependency errors, check that `package.json` has `"ts-jest": "^29.0.0"` (NOT `^28.0.0`).
- Node-based tests using `process.exit()` must NOT be included in Jest — they crash Jest workers. Run them with `node test/file.js` instead.
- The vscode mock is NOT complete for all VSCode APIs — only what's used in `src/metersphere/*.ts` is declared. Add types to `src/vscode.d.ts` as needed.
- Tests use CommonJS `require()` to import `.js` modules (not `.ts`) for isolation from the VSCode import chain.

**Verification:** `npm test` → 2 suites, 2 tests, all PASS.

---

## Task 7 — Documentation and plan consolidation ✅

**Files:** All `docs/superpowers/specs/` and `docs/superpowers/plans/` markdown files created.

**What was done:**
- Phase 1 MVP1 design and impl plan
- Phase 2 design and impl plan
- Phase 3A/3B/3C design and impl plans
- Common models, UI spec, API mapping, risk log, acceptance criteria, timeline, open questions
- `AGENTS.md` at repo root with governance

---

## Git hygiene & commits

Commit history on `main`:
```
3202f99 test: remove legacy placeholder test file
eac6b35 test: wire up Jest/ts-jest, fix TypeScript errors, add vscode mock
b6e9726 feat: import Phase 3 plan artifacts into main as initial commit
36e3f63 docs(agents): add AGENTS.md with build/test guidelines and phase3 planning policy
```

All work committed directly to `main`. No PRs required.

---

## Phase 1 verification checklist

Before starting Phase 2, confirm all of these pass:

```bash
npm install
npm run compile        # → no errors
npx tsc -p tsconfig.json --noEmit   # → no errors
npm test               # → 2 suites, 2 tests, all PASS
```

---

## Risks (Phase 2 carry-forward)

- Token security: SecretStorage migration documented for Phase 3C; per-workspace persistence default stance maintained
- Navigator and Sync integration risk: managed via phased milestones in Phase 2
- VSCode runtime E2E: not testable in CI — manual testing required for WebView and command registration
