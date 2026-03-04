# MeterSphere VSCode Extension - Design Document

**Date**: 2026-03-04  
**Status**: Approved for Implementation  
**Version**: 1.0

---

## 1. Overview

### Project Goal
Create a VSCode extension that provides integration with MeterSphere (open-source continuous testing platform) for:
1. **API Documentation Export** - Export Java REST controllers directly to MeterSphere as API definitions
2. **Direct API Testing** - Send requests and test APIs from within VSCode
3. **Project Management** - Browse and manage MeterSphere projects/modules from VSCode

### Reference Implementation
Based on analysis of [metersphere-idea-plugin v2.0](https://github.com/metersphere/metersphere-idea-plugin/tree/v2.0) - an IntelliJ IDEA plugin with similar functionality.

---

## 2. Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        VSCode Extension                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │   UI Layer  │  │  Commands   │  │   Tree View Provider   ││
│  │  (Webview)  │  │ (Handlers)  │  │   (MeterSphere Tree)   ││
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘│
│         │                 │                     │              │
│  ┌──────┴─────────────────┴─────────────────────┴─────────────┐│
│  │                    Service Layer                           ││
│  │  ┌───────────────┐  ┌──────────────┐  ┌───────────────┐  ││
│  │  │ ConfigService │  │ MsApiService │  │ ExportService │  ││
│  │  └───────────────┘  └──────────────┘  └───────────────┘  ││
│  └──────────────────────────┬─────────────────────────────────┘│
│                             │                                   │
│  ┌──────────────────────────┴─────────────────────────────────┐│
│  │                    API Client                               ││
│  │  - HTTP requests to MeterSphere                            ││
│  │  - Authentication (AKSK signature)                         ││
│  │  - Multipart file upload                                  ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MeterSphere Server                           │
│  - API Definition Import: POST /api/definition/import          │
│  - Project List: POST /project/list/related                   │
│  - Module List: GET /api/module/list/{projectId}/{protocol}   │
│  - Version List: GET /project/version/get-project-versions/{id} │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. UI Design (Hybrid Approach)

### 3.1 Configuration Settings (settings.json)
Simple key-value settings in VSCode preferences:

```json
{
  "metersphere.url": "http://localhost:8080",
  "metersphere.accessKey": "",
  "metersphere.secretKey": "",
  "metersphere.contextPath": "/api",
  "metersphere.exportMode": "incrementalMerge",
  "metersphere.useJavadoc": true,
  "metersphere.nestingDepth": 3
}
```

### 3.2 Interactive Selectors (QuickPick)
Dynamic dropdowns fetched from MeterSphere API:

| Selector | Source API | When Needed |
|----------|------------|-------------|
| Workspace | `GET /workspace/list/userworkspace` | On connection |
| Project | `POST /project/list/related` | After workspace selected |
| Module | `GET /api/module/list/{projectId}/{protocol}` | After project selected |
| Version | `GET /project/version/get-project-versions/{projectId}` | After project selected (if enabled) |

### 3.3 Commands

| Command | Description | Trigger |
|---------|-------------|---------|
| `metersphere.configure` | Open settings configuration | Command Palette |
| `metersphere.connect` | Test connection & load projects | Command Palette |
| `metersphere.export` | Export selected Java files to MeterSphere | Context Menu / Command Palette |
| `metersphere.testApi` | Open API testing panel | Command Palette |

### 3.4 Context Menu
- Right-click on Java file/folder → "Export to MeterSphere"
- Right-click on API definition → "Test API in MeterSphere"

### 3.5 Status Bar
- Connection status indicator (green=connected, red=disconnected)
- Click to open settings

### 3.6 Output Channel
- Export progress logs
- Error messages
- API response details

---

## 4. Features

### 4.1 API Documentation Export (Priority: High)
Based on IDEA plugin's `MeterSphereExporter` + `V2Exporter`:

| Feature | Description |
|---------|-------------|
| Javadoc parsing | Extract JavaDoc comments as API descriptions |
| Annotation support | `@RestController`, `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping` |
| Parameter parsing | `@PathVariable`, `@RequestBody`, `@RequestParam` |
| Nested types | Support List, Set, Collection with generic types |
| JSON Schema | Auto-generate JSON Schema from Java types |
| Response examples | Generate example responses from return types |

### 4.2 Authentication (Priority: High)
Based on IDEA plugin's `MSApiUtil`:

```typescript
// Signature generation (to be reimplemented in TypeScript)
function generateSignature(accessKey: string, secretKey: string): string {
  const payload = `${accessKey}|${uuid()}|${Date.now()}`;
  return aesEncrypt(payload, secretKey, accessKey);
}

// Headers required:
// - accessKey: <accessKey>
// - signature: <generated signature>
```

### 4.3 API Testing (Priority: Medium)
- Send HTTP requests (GET, POST, PUT, DELETE, PATCH)
- View response body, headers, status
- Save requests to collections
- Environment variables support

### 4.4 Project Browser (Priority: Low)
- Tree view of MeterSphere resources
- Navigate projects, modules, APIs
- View API definitions

---

## 5. API Integration

### 5.1 MeterSphere API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/definition/import` | POST | Upload API definition (multipart) |
| `/currentUser` | GET | Test connection |
| `/user/key/validate` | GET | Validate credentials |
| `/workspace/list/userworkspace` | GET | List workspaces |
| `/project/list/related` | POST | List projects |
| `/project/version/get-project-versions/{id}` | GET | List versions |
| `/project/version/enable/{id}` | GET | Check version support |
| `/api/module/list/{projectId}/{protocol}` | GET | List modules |
| `/license/valid` | GET | Check license |

### 5.2 Upload Request Format

```typescript
// POST /api/definition/import (multipart/form-data)
// Headers:
//   - accessKey: string
//   - signature: string
// Body (multipart):
//   - file: Postman Collection JSON (application/json)
//   - request: JSON string with:
{
  moduleId: string,
  projectId: string,
  versionId?: string,
  mode: "fullCoverage" | "incrementalMerge",
  platform: "Postman",
  model: "definition",
  protocol: "HTTP",
  origin: "vscode",
  coverModule?: boolean,
  updateVersionId?: string
}
```

---

## 6. Data Models

### 6.1 Configuration State
```typescript
interface MeterSphereConfig {
  url: string;              // Server URL
  accessKey: string;        // API access key
  secretKey: string;        // API secret key
  
  // Runtime (loaded from API)
  workspaceId?: string;
  workspaceName?: string;
  projectId?: string;
  projectName?: string;
  moduleId?: string;
  moduleName?: string;
  versionId?: string;
  
  // Export options
  contextPath: string;
  exportMode: 'fullCoverage' | 'incrementalMerge';
  useJavadoc: boolean;
  nestingDepth: number;
}
```

### 6.2 Postman Collection Format
Export uses Postman Collection v2.1 format (same as IDEA plugin):
```typescript
interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
  };
  item: PostmanItem[];
}
```

---

## 7. File Structure

```
metersphere-vscode/
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
├── src/
│   ├── extension.ts          # Entry point (activate/deactivate)
│   │
│   ├── commands/
│   │   ├── configure.ts      # Open settings command
│   │   ├── connect.ts       # Test connection command
│   │   ├── export.ts        # Export to MeterSphere
│   │   └── testApi.ts       # API testing
│   │
│   ├── services/
│   │   ├── config.ts        # Configuration management
│   │   ├── api.ts           # MeterSphere API client
│   │   ├── auth.ts          # Authentication (signature)
│   │   ├── exporter.ts      # Java parser & exporter
│   │   └── javaParser.ts    # Java code parsing
│   │
│   ├── ui/
│   │   ├── quickPick.ts     # QuickPick selectors
│   │   ├── statusBar.ts     # Status bar item
│   │   └── webview/
│   │       ├── settings.html
│   │       └── settings.ts
│   │
│   ├── tree/
│   │   └── msTreeProvider.ts # MeterSphere tree view
│   │
│   ├── types/
│   │   └── index.ts         # TypeScript interfaces
│   │
│   └── utils/
│       ├── logger.ts        # Logging utility
│       └── crypto.ts        # AES encryption for signature
│
└── test/
    └── suite/
        └── extension.test.ts
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Project scaffolding (package.json, tsconfig)
- [ ] Basic extension activate/deactivate
- [ ] Settings configuration (settings.json)
- [ ] API client with authentication
- [ ] Test connection command

### Phase 2: Export Core (Week 2)
- [ ] Java file parsing (using java-parser)
- [ ] Postman collection generation
- [ ] Export command with context menu
- [ ] Multipart upload to MeterSphere
- [ ] Progress notification

### Phase 3: Interactive UI (Week 3)
- [ ] QuickPick selectors for workspace/project/module
- [ ] Connection status in status bar
- [ ] Output channel for logs

### Phase 4: Advanced Features (Week 4)
- [ ] API testing panel (basic HTTP client)
- [ ] Project tree view
- [ ] Version management
- [ ] Error handling & edge cases

---

## 9. Dependencies

### Required Packages
| Package | Purpose |
|---------|---------|
| `axios` | HTTP client |
| `uuid` | Generate UUID for signature |
| `java-parser` | Parse Java code |
| `vscode` | VSCode API |

### Dev Dependencies
| Package | Purpose |
|---------|---------|
| `typescript` | Type safety |
| `@types/vscode` | VSCode types |
| `@types/node` | Node types |
| `esbuild` | Bundling |

---

## 10. Acceptance Criteria

### Must Have (v1.0)
- [ ] Connect to MeterSphere with AKSK credentials
- [ ] Fetch and select workspace/project/module
- [ ] Parse Java REST controllers
- [ ] Export to MeterSphere via `/api/definition/import`
- [ ] Settings stored in VSCode configuration
- [ ] Status bar connection indicator

### Should Have (v1.1)
- [ ] Context menu export
- [ ] Progress notifications
- [ ] Error handling with user-friendly messages

### Nice to Have (v2.0)
- [ ] Built-in API testing UI
- [ ] Project tree browser
- [ ] Test case management

---

## 11. References

- **IDEA Plugin**: https://github.com/metersphere/metersphere-idea-plugin
- **MeterSphere API**: https://metersphere.io/
- **VSCode Extension Docs**: https://code.visualstudio.com/api
- **Postman Collection Format**: https://schema.getpostman.com/

---

*End of Design Document*
