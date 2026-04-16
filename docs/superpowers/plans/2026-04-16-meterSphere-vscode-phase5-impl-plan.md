# Phase 5 Implementation Plan — API Debugger & Pull from MeterSphere

## Objective
Implement Phase 5 features: Pull API definitions from MeterSphere into Navigator tree, and enable full browse → test workflow matching IDEA v3 behavior.

## Background

Phase 5 was originally planned to include full Environment/History WebViews. These have been moved to Phase 6 (Environment) and Phase 7 (History).

**Current Phase 5 Scope:**
- Pull API definitions from MeterSphere
- Navigator shows individual APIs under modules
- Click API → open in WebView debugger
- Search/filter APIs

## Milestones
- M1: Add API definitions endpoint to Navigator (pull from MeterSphere)
- M2: TreeView expansion shows individual APIs under modules
- M3: API selection opens in WebView debugger with prefilled fields
- M4: Search/filter APIs in Navigator
- M5: End-to-end verification (Navigator → WebView → execute)

## Tasks

### T1: Extend NavigatorEngine with API discovery
- **File:** `src/metersphere/navigatorEngine.ts`
- Add `discoverApiDefinitions(projectId, moduleId)` method
- Endpoint: `POST /api/definition/page` with `{ projectId, moduleId, pageSize: 100, current: 1 }`
- Returns: paginated list of `id, name, method, path, moduleId`

### T2: Update NavigatorNode model
- **File:** `src/metersphere/models/navigatorNode.ts`
- Add `NodeType.API` enum value
- Add `method?: string` field to store HTTP method
- Add `path?: string` field for URL path

### T3: Update NavigatorTreeProvider
- **File:** `src/metersphere/navigatorTreeProvider.ts`
- When `getChildren()` receives a module node, call `discoverApiDefinitions()`
- Cache API results per module to avoid redundant fetches
- Handle pagination if >100 APIs per module

### T4: Update getTreeItem for API nodes
- **File:** `src/metersphere/navigatorTreeProvider.ts`
- Display method badge (GET=green, POST=blue, PUT=orange, DELETE=red)
- Show path as label after method

### T5: API selection → WebView prefill
- **File:** `src/metersphere/navigatorTreeProvider.ts`
- On tree item selection (`onDidSelectionChange`), send node to WebView
- WebView receives: method, url, headers, body template

### T6: WebView API loading
- **File:** `src/metersphere/views/sidebarView.ts`
- Add handler for `loadApiDefinition` message
- Populate request fields from received node data
- Enable "Send" with prefilled values

### T7: API search in Navigator
- **File:** `src/metersphere/views/sidebarView.ts` or new component
- Add search box above Navigator TreeView
- Filter nodes by name/path/method (case-insensitive)

### T8: Unit tests
- **File:** `test/navigatorEngine.test.ts`
- Add tests for `discoverApiDefinitions()` mocking response
- Add tests for pagination handling

### T9: Integration tests
- **File:** `test/e2e/navigator-api-pull.e2e.ts`
- Test pull flow: connect → expand module → see APIs → click → verify WebView

## Data Models

```typescript
// New NodeType
enum NodeType {
  WORKSPACE = 'workspace',
  PROJECT = 'project',
  MODULE = 'module',
  API = 'api',  // NEW
}

// API Node extends NavigatorNode
interface ApiNode extends NavigatorNode {
  type: NodeType.API;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  moduleId: string;
}
```

## API Endpoint

```
POST /api/definition/page
Body: {
  "projectId": "xxx",
  "moduleId": "yyy",
  "pageSize": 100,
  "current": 1
}
Response: {
  "success": true,
  "data": {
    "list": [
      { "id": "...", "name": "GET /users", "method": "GET", "path": "/api/users", "moduleId": "yyy" },
      ...
    ],
    "total": 42
  }
}
```

## UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 🌐 Navigator                                [Search...]    │
├─────────────────────────────────────────────────────────────┤
│ ▼ Workspace 1                                              │
│   ▼ Project A                                              │
│     ▼ 未规划接口                                           │
│       ├─ GET /api/users         ← NEW: Shows APIs          │
│       ├─ POST /api/users                                   │
│       ├─ PUT /api/users/:id                               │
│       └─ DELETE /api/users/:id                             │
│     ▼ vscode plugin                                        │
│       ▼ Test API Collection                                │
│         ├─ GET /api/definition/get                         │
│         └─ ...                                             │
└─────────────────────────────────────────────────────────────┘
         │
         │ Click "GET /api/users"
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 🌐 API Debugger                                             │
├─────────────────────────────────────────────────────────────┤
│ [GET ▼] [____________________] [Send]                      │
├─────────────────────────────────────────────────────────────┤
│ Params  Headers  Body  Auth                                 │
│ ─────────────────────────────────────────────────────────│
│ {                                                       │
│   "key": "value"                                         │
│ }                                                       │
└─────────────────────────────────────────────────────────────┘
```

## Comparison: Current vs Phase 5

| Feature | Current | After Phase 5 |
|---------|---------|---------------|
| Navigator shows modules | ✅ | ✅ |
| Navigator shows APIs | ❌ | ✅ |
| Click module → expand | ✅ | ✅ |
| Click API → open in debugger | ❌ | ✅ |
| Search APIs | ❌ | ✅ |
| Pull from MeterSphere | ❌ | ✅ |

## Dependencies
- Phase 2 Navigator (existing: workspace/project/module)
- Phase 3 Sidebar WebView (existing: debugger UI)

## Non-Goals (Phase 5)
- Push API changes back to MeterSphere (sync push is Phase 4)
- API editing in Navigator (edit in WebView only)
- API deletion from Navigator (delete in MeterSphere UI)