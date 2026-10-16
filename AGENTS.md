# AGENTS.md — MeterSphere VSCode Plugin

## Overview

This repository hosts a VSCode extension for MeterSphere (v2.x baseline) spanning Phases 1–8, plus planning artifacts. The current release is v0.2.0.

Agents who touch this codebase should follow the guidance in this document to ensure consistent builds, tests, and code quality.

---

## 1) Build, lint, and test commands

### Setup

```bash
npm install
```

**Important:** `ts-jest` must be `^29.0.0` (v28 is incompatible with Jest 29). If you see ERESOLVE peer dependency errors, update `ts-jest` to v29 in `package.json`.

### Build and type-check

```bash
npm run compile      # TypeScript compile (out/ directory)
npm run watch        # Watch mode for development
npx tsc -p tsconfig.json --noEmit   # Type-check only (no emit)
```

### Package VSIX

```bash
npx @vscode/vsce package          # Build .vsix in repo root
```

Pre-existing warnings: no LICENSE file (add one to suppress). The VSIX ships ~272 files / ~400 KB after the `.vscodeignore` tightening (see Section 4).

### Lint

```bash
npx eslint "src/**/*.{ts,tsx}"   # Run ESLint if configured
```

### Tests (Jest + ts-jest)

```bash
npm test                        # Run all Jest tests
npx jest --verbose              # Run all with verbose output
npx jest test/tokenManager.test.ts --verbose   # Run specific test file
npx jest --no-cache            # Clear cache and re-run
```

**Node-based tests** (standalone `.js` files with `process.exit()`) are excluded from Jest to avoid worker crashes. Run them directly:

```bash
node test/httpClient.test.js        # Legacy node-only tests
```

### VSCode mock

Tests run without the VSCode runtime using a mock stack:
- `src/vscode.d.ts` — TypeScript type declarations for the VSCode API
- `test/vscode-mock-setup.js` — Jest setup that mocks the `vscode` module globally (per-test configurable via `globalThis.__vscodeMock`)

Do not modify these mock files without a corresponding update to tests.

---

## 2) Code style guidelines

- **Language:** TypeScript with strict mode enabled; no implicit `any`.
- **Imports:**
  - Use absolute imports for internal modules: `import { TokenManager } from './metersphere/tokenManager'`
  - Group imports: stdlib, third-party, local.
  - No unused imports; remove dead code paths.
- **Formatting:**
  - 2 spaces per indentation; semicolons optional if project ESLint config allows; be consistent with existing codebase.
  - Use Prettier formatting if configured; otherwise align with existing TS style in this repo.
- **Types and interfaces:**
  - Prefer explicit interfaces for public shapes: `interface ApiRequest { ... }`
  - Prefer type aliases for simple unions and discriminated unions where appropriate.
- **Naming conventions:**
  - Variables and functions: `camelCase`
  - Types and classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
- **Error handling:**
  - Do not swallow errors; throw meaningful, typed errors.
  - Centralize HTTP errors in a shared error type when possible.
- **API design:**
  - Favor small, focused modules with single responsibilities.
  - Expose stable interfaces between modules; avoid leaking implementation details.
- **Testing philosophy (TDD):**
  - Write a failing test first (RED), then implement minimal code to satisfy it (GREEN), then refactor (REFACTOR).
  - Tests live in `test/` alongside their subject module. One test file per unit feature.
  - TS tests (`.test.ts`) run via Jest + ts-jest. CommonJS tests (`.js`) run directly with Node.
- **Documentation:**
  - JSDoc/TSDoc on public APIs; explain non-obvious decisions.
- **Security:**
  - Do not log tokens; ensure token is only used in Authorization headers and not leaked in UI logs.
- **Accessibility and UX:**
  - Ensure UI strings are i18n-friendly and simple to translate when needed.

---

## 3) Cursor rules and Copilot rules

- Cursor rules: Not present in this repository yet. If you add Cursor rules, include them under a dedicated `.cursor` or `.cursorrules` directory and reference them here.
- Copilot rules: Not present in this repository yet. If you add a Copilot policy (e.g., `.github/copilot-instructions.md`), document it here and ensure agents follow it.

---

## 4) File structure and task decomposition strategy

```
src/
  extension.ts               # Top-level extension entry point
  vscode.d.ts                # VSCode API type declarations (mock-friendly)
  metersphere/
    extension.ts             # Inner extension bootstrap
    tokenManager.ts          # Token persistence via VSCode settings
    tokenManager.js          # CommonJS token manager (for Node tests)
    settingsManager.ts       # Workspace/project ID persistence
    httpClient.ts            # HTTP client with token injection
    httpClient.js            # CommonJS HTTP client (for Node tests)
    webviewController.ts     # WebView-based API debugger
    authHeader.js            # Simple auth header helper
    retry.js                 # Retry utility
    math.js                  # Utility module
    connectionManager.ts     # Connection state tracking
    commandRouter.ts         # Command registration and dispatch
    navigatorEngine.ts       # Tree data fetching (workspaces → projects → modules → APIs)
    navigatorTreeProvider.ts # VSCode TreeDataProvider for Navigator
    syncEngine.ts            # Controller scanning and sync logic
    syncService.ts           # Sync upload service
    javaFileScanner.ts       # Java file discovery
    javaParser.ts            # Java annotation parser (regex engine)
    javaParserDispatch.ts    # CST-first dispatch with deterministic regex fallback
    scanLifecycle.ts         # Scan guard: exactly one terminal scanComplete per scan
    uploadParsing.ts         # Upload parse orchestration + OpenAPI DTO pre-pass
    typeResolver.ts          # Return-type extraction + type registry
    openApiBuilder.ts        # OpenAPI 3.0 document assembly
    validationSchema.ts      # Bean-validation constraints -> JSON Schema keywords
    uploadPlatform.ts        # Server platform mapping (OpenAPI ships as "Swagger2")
    variableResolver.ts      # {{var}} environment variable resolution
    escapeHtml.ts            # Webview HTML/JS escaping helpers
    contextPathResolver.ts   # Context-path detection from application.* (prefill only)
    serviceRootPathResolver.ts # Webflux-first service root path detection
    rulesLoader.ts           # Runtime rules JSON loading (branch/placement routing)
    categoryResolver.ts      # eapi/iapi/both branch resolution chain
    versionProbe.ts          # Server version probe (v2/v3 payload shape)
    contextHolder.ts         # Global extension context holder
    debugLogger.ts           # Debug logging to Output panel
    javaAst/                 # CST parser stack (java-parser / Chevrotain based)
      cstJavaParser.ts       # CST controller/method parser (primary engine)
      annotationReader.ts    # Annotation values: nested annotations, string escapes
      cstParamParser.ts      # Parameter extraction (varargs-aware, Spring required semantics)
      projectSymbolIndex.ts  # LSP/disk type resolution for cross-file DTOs
      javadocIndex.ts        # Javadoc comment index (@param, summaries)
      cstWalk.ts             # CST tree walking helpers
      loadJavaParser.ts      # Vendored java-parser loader
    models/
      navigatorNode.ts       # Tree node types (workspace/project/module/api)
      apiTemplate.ts         # API definition template
    views/
      sidebarView.ts         # Control Panel HTML and message handling
test/
  tokenManager.test.ts       # TokenManager Jest tests
  httpClient.test.ts         # HttpClient Jest tests
  vscode-mock-setup.js       # Global vscode mock for Jest (jest.mock factory)
  commandRouter.test.ts      # CommandRouter tests
  connectionManager.test.ts  # ConnectionManager tests
  navigatorEngine.test.ts    # NavigatorEngine tests
  navigatorTreeProvider.test.ts # NavigatorTreeProvider tests
  syncEngine.test.ts         # SyncEngine tests
  syncService.test.ts        # SyncService tests
  models/                    # Model tests
docs/superpowers/
  specs/                     # Design specifications per phase
  plans/                     # Implementation plans per phase
```

When adding features, decompose into small, self-contained tasks. Each task should produce a self-contained, testable change.

**esbuild bundling** remains a deferred enhancement, but the urgent size problem is solved: the tightened `.vscodeignore` (node_modules java-parser tree, all `.ts` sources, source maps, dev scaffolding) cut the VSIX from 2284 files / 1.97 MB to ~272 files / ~400 KB while keeping `out/**`, the vendored `vendor/java-parser.cjs`, and the `form-data` runtime chain. If load time ever matters again, wire up `esbuild` (or `@vscode/vsce`'s built-in esbuild integration) to produce a single JS bundle.

---

## 5) Commit and PR hygiene

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Each task should result in a focused commit with a descriptive message.
- All work is committed directly to `main` (no PRs required for this project).
- Keep the working tree clean before committing.

---

## 6) Local development notes

- Ensure `npm install` runs successfully before building.
- Use TypeScript compile checks (`npx tsc -p tsconfig.json --noEmit`) to verify types during development.
- Run `npm test` to confirm all Jest tests pass before committing.
- If TypeScript errors appear related to `vscode` module, verify `src/vscode.d.ts` and `test/vscode-mock-setup.js` exist.

---

## 7) Execution handoff

After design and planning, choose one:

- **1) Subagent-Driven (recommended):** Spawn a fresh subagent per task with review steps between tasks.
- **2) Inline Execution:** Execute tasks in a single session with checkpoints.

---

## 8) Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 MVP1 | ✅ Complete | TokenManager, HttpClient, SettingsManager, WebView scaffold, Jest wired |
| Phase 2 | ✅ Complete | Navigator, TreeView, on-demand sync |
| Phase 3A | ✅ Complete | WebView scaffold, Sync upload, Environment/History panels (populated during Sidebar Migration) |
| Phase 3B | ✅ Complete | Mocks, Test Data |
| Phase 3C | ✅ Stub Complete | DebugLogger only (telemetry deprecated) |
| Phase 4 | ✅ Complete | Context menus, Settings enhancements, testConnection, syncCases, Responsive Sync |
| Phase 4 Enhancement | ✅ Complete | FilesExplorer inline button, scan scope dialog, scanning state UI, parallel module selection |
| Phase 5 | ✅ Complete | API Debugger (1:1 with IDEA plugin) |
| Sidebar Migration | ✅ Complete | 4 separate webviews merged into single Control Panel; tab-bar replaced with accordion panels |
| API Endpoints in Navigator | ✅ Complete | API definitions shown under modules in tree |
| Debugger Polish & Sidebar Integration | ✅ Complete | VSCode theme CSS variables in debugger; inline History removed (sidebar-only); onclick→addEventListener cleanup; message queuing; upload duplication guard |
| Header/Naming Fixes | ✅ Complete | @RequestHeader propagation, API naming precedence (Operation > Javadoc > path) |
| Sync Name/Path/Branch Routing | ✅ Complete | Order-independent annotation lookup; context path in both formats; runtime rules JSON; @category-preferred eapi/iapi/both routing with dual upload; version probe + post-import verification; v3 experimental/untested |
| OpenAPI Schema Resolution | ✅ Complete | Tiers 1–2 (java-ast type extraction + $ref) plus Tiers 3–4 (async DTO pre-pass via LSP symbol provider / bounded disk scan, graceful degradation without redhat.java) |
| Gap Analysis (IDEA vs VSCode) | ✅ Complete | `docs/superpowers/gap-analysis-vscode-vs-idea.md` documents all P0–P2 gaps |
| OCR Security & Robustness Hardening | ✅ Complete | 52 review findings fixed across 14 themes (XSS escaping, timeouts, parser correctness, lifecycle guards, packaging); live-verified against v2.10.26-lts; 35 suites / 535 tests |

NOTE on phases:
- Phase 3A was initially Stub because getEnvironmentHtml() and getHistoryHtml() were stubs (populated with real data during Sidebar Migration; now fully Complete)
- Phase 3C "Complete" marked as Stub because: telemetryEngine was deprecated, only DebugLogger exists
- Phase 4 includes: Editor/File Explorer context menus, Settings UI with testConnection, exportName field, syncCases checkbox
- Phase 4 Enhancement includes: Inline sync button, right-click sync improvements, responsive scanning UI
- **Phase 5: API Debugger ONLY (1:1 with IDEA plugin) - Pull from MeterSphere REMOVED from Phase 5**
- Phase 6-8 deferred for future implementation
- dataFile.ts: DEPRECATED (use VSCode workspaceState instead)

**SecretStorage** is explicitly out of scope for Phases 1–8. Per-workspace persistence is the default stance.

---

## 9) Sync Operations

This extension supports multiple ways to sync Java Spring Controllers to MeterSphere:

### Supported Actions

| Action | Trigger | Behavior |
|--------|---------|----------|
| **Right-click single `.java` file** | FilesExplorer context menu | Scans that file only, opens Sync WebView |
| **Right-click multiple `.java` files** | FilesExplorer context menu | Scans all selected files, opens Sync WebView |
| **Right-click folder** | FilesExplorer context menu | Scans folder recursively for `@RestController`/`@Controller` files, opens Sync WebView |
| **Click inline button on `.java` file** | FilesExplorer hover | Shows dialog: "This file" vs "Parent folder" |
| **Right-click Navigator project** | MeterSphere Navigator | Scans project recursively, opens Sync WebView |
| **Select files manually** | Sync WebView "Select Java Files" button | Opens file picker |

### Sync Flow

```
1. User triggers sync (any action above)
2. Sync WebView opens immediately with "Scanning..." state
3. Module/project dropdowns are ENABLED for selection during scan
4. Upload button shows "Scanning..." and is DISABLED
5. Background scan runs (discovers @RestController classes)
6. Scan completes:
   - Files found: Upload button ENABLED, files shown in list
   - No files: Error message shown, Upload button remains DISABLED
7. User configures:
   - Selects module from dropdown
   - Optionally: Import mode, Context Path, Export Name, Sync Test Cases
8. User clicks "Upload to MeterSphere"
```

### Navigator vs Explorer

- **MeterSphere Navigator TreeView**: Use for browsing and selecting MeterSphere projects/modules
- **VSCode FilesExplorer**: Use for syncing Java files - both right-click and inline button available

---

## 10) OpenAPI Schema Resolution (Type System)

The extension supports OpenAPI 3.0 JSON export (`platform=Swagger2`) alongside legacy Postman format, controlled by `metersphere.exportFormat` setting.

See spec: `docs/superpowers/specs/2026-10-15-openapi-spec-coverage.md`

### Type Resolution Tiers

| Tier | Name | Tool | What It Produces | LSP Dep |
|------|------|------|------------------|---------|
| 1 | Return type string | `java-ast` AST (method node) | Raw type text: `Response<IDDShoppingModel>` | No |
| 2 | Type name / $ref | `typeResolver.ts` | Strips generics → `IDDShoppingModel` | No |
| 3 | Field-level schemas | `projectSymbolIndex.ts` async pre-pass (LSP symbol provider → bounded disk scan) | Type → field list → `components/schemas` | Optional (degrades gracefully) |
| 4 | Deep nested expansion | Recursive resolution through the same index (bounded, capped at 64 type names per upload) | Nested `$ref`s for cross-file DTOs, enums, records | Optional (degrades gracefully) |

Tiers 1–2 run synchronously at build time. Tiers 3–4 run in the upload path via the async DTO
pre-pass (`parseUploadedFiles(..., isOpenApi=true)` → `resolveDependencyTypes`), gated to the
OpenAPI export only (never for Postman); results land in the symbol-index cache which is cleared
at each pre-pass start so a prior upload cannot leak stale entries. Without the Red Hat Java
extension the pre-pass falls back to a bounded on-disk scan, and unresolvable types export as
generic objects — upload never blocks or throws.

### Emitted export surface (OpenAPI path)

- Responses: real status code (`@ResponseStatus` else 200) + body schema; wrapper types
  (`Response`/`Result`/`R`/`HttpEntity`/`ResponseEntity`/`Optional`/`Page`/`IPage`) unwrap fully to
  the payload (`Response<Page<T>>` → `T`); `@ResponseHeader` → response `headers`; `@ApiResponse` →
  extra response codes.
- Parameters: `description` (`@ApiParam`/`@Parameter` > javadoc `@param`), `default` (coerced to the
  schema type for numerics), `required`, and validation keywords (`@NotNull`/`@Size`/`@Min`/`@Max`/
  `@Pattern`/`@Email` — positional and named annotation forms both captured).
- DTO fields: field-level validation + `@Schema` description, class-level `required`.
- Types: `enum` → `{type:'string', enum:[...]}`; `record` → object from components; `interface` →
  best-effort from methods; `Map<K,V>` → `{type:'object', additionalProperties:<V>}`.
- Auth: `@PreAuthorize`/`@Secured`/`@RolesAllowed` → `components.securitySchemes.bearerAuth`
  (bearer JWT) + document `security`; `@PermitAll` → per-op `security: []`; springdoc
  `@SecurityScheme`/`@SecurityRequirement` override.
- Misc: `operationId` (collision-suffixed) + `tags`; `@RequestPart`/`MultipartFile` →
  `multipart/form-data` (parts win over `@RequestBody`); `@CookieValue` → `in: cookie`.
- `format` hints are limited to `date-time` (`LocalDateTime`/`Date`) and `uuid` (`UUID`) — integer/
  number schemas stay bare (pinned export tests depend on it).

### New Modules

| Module | File | Purpose |
|--------|------|---------|
| TypeResolver | `typeResolver.ts` | Extract type name from return type string, build type registry |
| OpenApiBuilder | `openApiBuilder.ts` | Assemble full OpenAPI 3.0 document |
| ValidationSchema | `validationSchema.ts` | Map bean-validation constraints → JSON Schema keywords |

Note: `schemaGenerator.ts` was removed (dead module — schema generation lives in
`typeResolver.ts` + `openApiBuilder.ts`).

---

## 13) Worktree Merge Best Practices

### The Problem
When merging a worktree branch back to main, files that exist ONLY in the worktree (not in main) can be easily lost if:
- `--ours` strategy is used for conflict resolution (keeps main's version)
- The worktree is deleted before verifying all files are merged

### Signs of Data Loss
- VSIX size drops significantly (e.g., 268KB → 56KB)
- Missing files in `out/src/metersphere/` (e.g., sidebarView.js, engines)
- Missing source files in `src/metersphere/`

### Prevention Checklist
Before merging worktree to main:
- [ ] Verify ALL dependencies in package.json are present
- [ ] Check file count in compiled output: `ls out/src/metersphere/ | wc -l`
- [ ] Compare with last known good build: `unzip -l vsix | grep extension/out`
- [ ] Run tests to verify functionality
- [ ] Do NOT delete worktree until merge is verified

### Recovery Steps
1. Extract VSIX from last known good build: `unzip -o old.vsix -d /tmp/extract`
2. Copy missing files: `cp /tmp/extract/extension/out/src/metersphere/* out/src/metersphere/`
3. Re-implement session-specific changes that were lost

### Never Do
- [ ] Use `git merge --ours` without checking what exists only in worktree
- [ ] Delete worktree before verifying merge is complete
- [ ] Assume `node_modules/` is included in git (it's in .gitignore)

---

## 14) Gap Analysis: VSCode vs IDEA Plugin

See full document: `docs/superpowers/gap-analysis-vscode-vs-idea.md`

### Priority Summary

| Priority | Count | Key Items |
|----------|-------|-----------|
| **P0** | 3 | Upload format (Postman → Swagger2/3), Version management, URL query param cleanup |
| **P1** | 4 | V2/V3 mode selection, URL `/api` suffix auto-append, State caching, Retrieve config workflow |
| **P2** | 4 | Self-signed cert support, authManager audit, userId in project list, i18n |

### Reference

The gap analysis compares the VSCode plugin against:
- IDEA plugin v2.0 standalone (original Postman-based approach)
- IDEA plugin v3.x `MsBaseTransferV2` (V2 server compatibility mode, OpenAPI-based)

When implementing a gap fix, first consult the IDEA source analysis in the gap doc for exact parameter names, endpoint paths, and serialization format.

---

## 15) MeterSphere v2.x Server API Findings (verified live)

These findings come from live debugging against a running `v2.10.26-lts` instance (Docker: `gateway` on :8081 → microservices), plus the same gateway pattern observed in another v2 project. Re-verify against the server source for YOUR target version before changing anything that depends on them. Server source for the exact image version: branch/tag `v2.10.26-lts`, module `api-test/backend/src/main/java/io/metersphere/...` (note: a local checkout whose branch is *named* `v2.10.26-lts` may actually contain v3-lineage code — verify the package layout, e.g. `io.metersphere.service.definition` vs `io.metersphere.api.service.definition`, before trusting its line numbers).

### 15.1 Upload platform: OpenAPI content MUST be labelled `Swagger2`, never `Swagger3`

- `ApiDefinitionImportParserFactory.getApiImportParser(platform)` (api-test service) registers ONLY: `Metersphere`, `Postman`, `Swagger2`, `Har`, `Jmeter`. **There is no `Swagger3` parser in v2.x.**
- Sending `platform: "Swagger3"` → the factory returns `null` → `Objects.requireNonNull(runService)` NPEs inside `ApiDefinitionService.apiTestImport` → HTTP 500 with an **empty message** (`{"success":false,"message":"","data":null}`) — the response body carries no hint of the real cause.
- The server's `Swagger2Parser.parse` auto-detects OpenAPI 3.0 documents (checks the `openapi` key) and delegates to an internal `Swagger3Parser`. So `platform: "Swagger2"` is the correct label for OpenAPI 3.0.3 exports on v2.x servers.
- Extension mapping: `src/metersphere/uploadPlatform.ts` (`resolveUploadPlatform`), guarded by `test/uploadPlatform.test.ts`, which asserts no platform outside the server's registered set is ever emitted.
- Debugging recipe: a 500 with `success:false, message:""` on `/api/api/definition/import` means read the api-test container's error log (`docker exec api-test tail -100 /opt/metersphere/logs/api-test/error.log`) — the response body will not tell you anything.

### 15.2 One `/api` gateway, two backends: single- vs double-prefix routing (v2 only)

Behind the v2 gateway, single- and double-`/api` prefixes hit **different backend services**. Verified live on v2.10.26-lts; v3 has no such gateway structure.

- **Never** rewrite API-definition endpoints to the single prefix: `/api/definition/...` → 404. The double prefix `/api/api/definition/...` is the valid form. (In the request helper, passing an empty string as the 4th parameter still falls back to the `api` prefix.)
- Single prefix `/api/project/list/related` → hits the **project-management** service (`BaseProjectController`) → returns only projects where the current user is a **member** — possibly an empty list.
- Double prefix `/api/api/project/list/{goPage}/{pageSize}` → hits the **api-test** service (`ExtProjectController`; class-level `@RequestMapping()` with an empty prefix, method-level full literal path) → returns **all** projects in the workspace.
- Therefore: an empty list from the single prefix does **not** mean "no projects exist". When investigating projects, always query the double-prefix paginated list first; never assert "zero projects" from a single-prefix empty result.
- Relevance to this extension: the Navigator's project discovery currently uses the single prefix (`/api/project/list/related`), so it can under-report projects for non-member users. Switching project enumeration to the double-prefix paginated list is a candidate fix (see §14 P2 "userId in project list").
