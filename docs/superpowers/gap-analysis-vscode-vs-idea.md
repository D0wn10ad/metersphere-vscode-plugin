# Gap Analysis: VSCode Plugin vs IDEA Plugin (v3.x V2 Server Mode)

> Generated 2026-05-24 from comparison of IDEA plugin v2.0 standalone,
> IDEA plugin v3.x V2 transfer mode (`MsBaseTransferV2`), and current VSCode plugin (v0.2.0).
>
> Targets **MeterSphere v2.x** servers.

## Priority Legend

| Priority | Meaning | Timeline |
|----------|---------|----------|
| **P0** | Must-have for basic functional parity | Pre-v1.0 |
| **P1** | Strongly recommended for production use | v1.0–v1.x |
| **P2** | Nice-to-have, quality-of-life | v1.x+ |
| **P3** | Deferred / future | Post-v1.x |

---

## Critical Gaps (P0)

### 1. Upload Format: Postman vs Swagger2/3

| Aspect | IDEA Plugin | VSCode Plugin | Gap |
|--------|-------------|---------------|-----|
| File format | OpenAPI 3.0 JSON (Swagger) | Postman Collection v2.1 | Different format |
| `platform` value | `"Swagger2"` (V2 mode) / `"Swagger3"` (V3 mode) | `"Postman"` | Different platform enum |
| Request body | Minimal JSON (coverModule, platform, moduleId, projectId, protocol, origin) | Same minimal JSON + duplicated URL query params | URL query params should be removed |

**Why this matters:** IDEA uses the richer OpenAPI v3 format which carries type/schema metadata. Postman format is flatter. Switching to OpenAPI format is a prerequisite for schema resolution.

**Status:** `exportFormat` setting added, `openApiBuilder.ts`/`schemaGenerator.ts`/`typeResolver.ts` implemented. Not yet wired as the default.

**Action:** Switch default `platform` from `"Postman"` to `"Swagger2"`, emit OpenAPI 3.0 JSON instead of Postman Collection.

---

### 2. Version Management (Missing)

IDEA V2 mode maintains full version awareness:

| Capability | IDEA V2 | VSCode | Gap |
|-----------|---------|--------|-----|
| Fetch versions | `GET /project/version/get-project-versions/{projectId}` | Not implemented | P0 |
| `versionId` in upload | Sent as actual version ID | Hardcoded `''` | P0 |
| `updateVersionId` in upload | Sent when fullCoverage mode | Hardcoded `''` | P0 |
| `MsProject.versionEnable` flag | Read and used | Not read | P1 |
| Version dropdown UI | Two dropdowns (version, update version) | Not present | P1 |

**Why this matters:** Without version IDs, syncs are unversioned and cannot target specific releases. This is a basic MeterSphere feature.

**Action:** Add version endpoint call, store version state, propagate to upload body.

---

### 3. Upload URL Query Params (Cleanup)

| Aspect | IDEA V2 | VSCode | Gap |
|--------|---------|--------|-----|
| Request params | Only in multipart `request` JSON body | In both URL query string AND request JSON body | P0 |

The VSCode plugin duplicates upload parameters (`modeId`, `projectId`, `moduleId`, `platform`, `model`, `protocol`, `origin`, `coverModule`) in the URL query string. IDEA sends them ONLY in the multipart `request` body.

**Why this matters:** Duplicate params could be ignored by server, but create an inconsistency that may cause issues with future server versions.

**Action:** Remove all query params from upload URL; send only in `request` JSON body.

---

## Medium Gaps (P1)

### 4. V2/V3 Mode Selection

IDEA has a radio-button toggle between V2 and V3 transfer modes, routing to different transfer implementations and UI panels. VSCode has no such concept — it always operates in V2 mode.

**Action:** Add a `metersphere.serverVersion` setting (`"v2"` / `"v3"`) that controls:
- Whether to append `/api` suffix to URL (V2 yes, V3 no)
- Which upload format to use (Swagger2 vs Swagger3)
- Which param set to use (with/without versionId, type, coverData, syncCase)

---

### 5. URL /api Suffix Handling

| Aspect | IDEA V2 | VSCode | Gap |
|--------|---------|--------|-----|
| URL suffix | Auto-appends `/api` to address if missing | User must enter full URL with `/api` | P1 |

IDEA V2's `getMeterSphereAddress()` automatically appends `/api` if the address doesn't already end with it. VSCode requires the user to enter `http://host:port/api` manually.

**Action:** Auto-append `/api` to `metersphere.msUrl` if not present.

---

### 6. State Caching

IDEA caches full object state (IDs + names + metadata lists for workspaces, projects, modules, versions) and restores selections across sessions. VSCode only persists string IDs and re-fetches lists each time.

**Why this matters:** Re-fetching every activation increases startup time and server load. Caching would improve UX and reduce dependency on server availability.

**Action:** Cache workspace/project/module/version lists in `workspaceState`.

---

### 7. "Retrieve Configuration" Workflow

IDEA has a "Retrieve configuration" button that:
1. Tests connection
2. Fetches workspaces, projects, modules, versions
3. Auto-populates all dropdowns
4. Restores previous selections if available

VSCode's "Test Connection" only validates credentials. Users must use the Navigator tree to manually find and select workspaces/projects.

**Action:** Enhance "Test Connection" to also populate workspace/project/module state.

---

## Minor Gaps (P2)

### 8. Self-Signed Certificate Support

IDEA explicitly trusts self-signed certificates via `TrustSelfSignedStrategy`. VSCode delegates to Node.js / VSCode runtime, which may reject self-signed certs by default.

**Action:** Add a `metersphere.rejectUnauthorized` setting (default `true`) allowing users to disable certificate validation for development setups.

---

### 9. `authManager` Blob Size

VSCode's upload body includes a large `authManager` JSON block that IDEA does not send. While likely harmless, it adds ~200 bytes to every upload request and may differ from what the server expects.

**Action:** Audit `authManager` content and remove fields not required by server.

---

### 10. `userId` in Project List Request

| Aspect | IDEA V2 | VSCode | Gap |
|--------|---------|--------|-----|
| Project list body | `{ workspaceId, userId }` | `{ workspaceIds: [...] }` | P2 |

IDEA sends `userId` (from `/currentUser`) alongside `workspaceId`. VSCode sends a `workspaceIds` array. Both work, but IDEA's approach is what the v2 API docs show.

**Action:** Add userId to project list request if needed for compatibility.

---

### 11. i18n / Localization

IDEA has full Chinese/English localization. VSCode plugin is English-only.

**Action:** Add i18n support using VSCode's `l10n` API when Chinese market requirements emerge.

---

## Summary Table

| # | Gap | Priority | Effort | Module(s) Affected |
|---|-----|----------|--------|--------------------|
| 1 | Upload format (Postman → Swagger2/3) | **P0** | Medium | `syncService.ts`, `openApiBuilder.ts` |
| 2 | Version management | **P0** | Medium | `sidebarView.ts`, `navigatorEngine.ts`, `syncService.ts` |
| 3 | URL query param cleanup | **P0** | Small | `sidebarView.ts` |
| 4 | V2/V3 mode selection | **P1** | Medium | `sidebarView.ts`, `syncService.ts` |
| 5 | URL `/api` suffix auto-append | **P1** | Small | `settingsManager.ts` |
| 6 | State caching | **P1** | Medium | `navigatorEngine.ts`, `connectionManager.ts` |
| 7 | Retrieve config workflow | **P1** | Small | `sidebarView.ts` |
| 8 | Self-signed cert support | **P2** | Small | `httpClient.ts` |
| 9 | authManager audit | **P2** | Small | `sidebarView.ts` |
| 10 | userId in project list | **P2** | Small | `navigatorEngine.ts` |
| 11 | i18n | **P2** | Large | All UI modules |

---

## IDEA Plugin Architecture Reference

### Upload Flow

```
Java PSI (full AST + type resolution)
  → ApiDefinition list (internal model)
    → OpenApiDataConvert (→ io.swagger.v3.oas.models.OpenAPI)
      → OpenApiGenerator (Gson serialization, excluding exampleSetFlag + specVersion)
        → MultipartEntityBuilder (file + request binary parts)
          → HTTP POST /api/definition/import
```

### Key Source Files (IDEA v3.x V2 mode)

| File | Purpose |
|------|---------|
| `MsBaseTransferV2.java` | Upload params, multipart build, auth headers |
| `MsClientV2.java` | API client: test, workspace/project/module/version endpoints |
| `UploadSettingPaneV2.java` | UI: dropdowns, test button, auto-fill |
| `UploadSettingStateV2.java` | Persistent state: all selections cached |
| `OpenApiDataConvert.java` | ApiDefinition → io.swagger OpenAPI model |
| `OpenApiGenerator.java` | Gson serialization to JSON |
| `CodingUtils.java` | AES-CBC-PKCS5Padding signature |
| `URLConstants.java` | API endpoint paths |
| `CoverModule.java` | fullCoverage / incrementalMerge |
| `MsVersion.java` | Version model (id, name, latest) |

### Key Source Files (IDEA v2.0 standalone)

| File | Purpose |
|------|---------|
| `MeterSphereExporter.java` | Postman format, platform=Postman |
| `V2Exporter.java` | Java PSI → PostmanModel |
| `MSApiUtil.java` | HTTP helpers, signature, modeId |

---

## Features KIV (Keep In View) for V3 Server Support

The following features are **not gaps** today (neither IDEA V3 V2-mode nor VSCode implement them as write operations), but should be reconsidered if a full V3 server mode is ever built.

### 1. Environment Parameter Upload

| Aspect | Current Status | KIV Reasoning |
|--------|---------------|----------------|
| IDEA V3 (V2 mode) | Read-only: fetches `GET /api/environment/list/{projectId}` for display/debugger variable resolution. No environment upload. | V3 server may support environment CRUD via separate API endpoints. |
| VSCode plugin | Read-only: same endpoint, displays environment cards in Control Panel and standalone view. No environment upload. | Matches IDEA behavior — no gap to close. |
| Environment ID in upload body | `environmentId` is sent as a reference to an existing server-side environment (hardcoded `''` in VSCode, removed in planned OpenAPI body). | If V3 server requires environment association during import, re-add field with selector UI. |

**Finding:** Environment definitions are server-managed objects on MeterSphere v2. The IDE plugin reads them for two purposes: (1) displaying in a panel, (2) resolving `{{var}}` placeholders during API debugging. Neither plugin uploads environments to the server as a separate operation. This is consistent across IDEA V3 V2-mode and VSCode.

**Action if V3 mode is re-enabled:**
1. Verify whether V3 server keeps the same `GET /api/environment/list/{projectId}` endpoint
2. Check if V3 import API requires `environmentId` in the request body (the IDEA V3 mode body currently omits it)
3. If environment CRUD from IDE is desired, implement against MeterSphere V3 environment API endpoints
