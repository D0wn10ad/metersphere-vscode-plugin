# MeterSphere VSCode Extension

VSCode extension for interacting with [MeterSphere](https://github.com/metersphere/metersphere) v2.x APIs — browse projects, sync Java Spring controllers, debug API requests, and manage test resources from your editor.

## Features

### 🔐 Authentication & Connection
- Token-based auth via Access Key / Secret Key (stored in VSCode settings)
- Connection status indicator (Connected/Disconnected/Connecting) in the sidebar
- `MeterSphere: Test Connection` command to validate credentials

### 🧭 Navigator (TreeView)
- Browse MeterSphere workspaces → projects → modules in the VSCode sidebar tree
- API endpoints shown under each module
- Selection auto-saves `workspaceId` / `projectId` to settings
- Refresh button in the view title bar

### 🎛️ Control Panel (WebView)
Single accordion-panel view with four panels:

| Panel | Description |
|-------|-------------|
| **Environment** | View and manage MeterSphere environments |
| **History** | Recent sync/upload history |
| **Sync** | Upload Java controllers to MeterSphere with module selection, import mode, context path, export name, and test case sync options |
| **Settings** | Configure URL, credentials, debug mode, connection test |

### 🐞 API Debugger
Standalone WebView for debugging MeterSphere API requests (1:1 parity with IDEA plugin):
- Select HTTP method, enter endpoint path and body
- Send requests and view responses
- Works as a separate panel or within the Control Panel

### ⬆️ Sync Operations
Sync Java Spring Controllers (`@RestController` / `@Controller`) to MeterSphere:

| Trigger | Scope |
|---------|-------|
| Right-click single `.java` file | That file only |
| Right-click multiple `.java` files | All selected files |
| Right-click folder | Recursive scan for controllers |
| Inline button on `.java` file | "This file" vs "Parent folder" dialog |
| Right-click Navigator project | Recursive scan of project |
| Sync panel "Select Java Files" button | File picker |

### 📋 Context Menus
- **Editor context**: Right-click in a Java file → upload to MeterSphere
- **File Explorer context**: Right-click `.java` file(s) or folders → upload
- **Navigator context**: Right-click project → scan and upload
- **View title bar**: Refresh, Environment, History, Sync, Settings, Debugger buttons

## Requirements

- VSCode ^1.80.0
- Node.js (for development)

## Installation

### From VSIX
```bash
code --install-extension metersphere-vscode-extension-0.1.0.vsix
```

### From source
```bash
git clone <repo>
cd metersphere-vscode-plugin
npm install
npm run compile
code --install-extension path/to/generated.vsix  # or symlink out/ to your extensions dir
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `metersphere.msUrl` | `http://localhost:8080` | MeterSphere server URL |
| `metersphere.accessKey` | `""` | Access Key (from User Settings → Token) |
| `metersphere.secretKey` | `""` | Secret Key (from User Settings → Token) |
| `metersphere.workspaceId` | `""` | Workspace ID (auto-synced from Navigator) |
| `metersphere.projectId` | `""` | Project ID (auto-synced from Navigator) |
| `metersphere.debugEnabled` | `false` | Enable debug logging to Output panel |

## Commands

| Command | Title | Icon |
|---------|-------|------|
| `metersphere.showDebugger` | MeterSphere: Show Debugger | `$(debug)` |
| `metersphere.refreshNavigator` | MeterSphere: Refresh Navigator | `$(refresh)` |
| `metersphere.openNavigator` | MeterSphere: Open Navigator | — |
| `metersphere.prefillFromNode` | MeterSphere: Prefill from Node | — |
| `metersphere.configure` | MeterSphere: Configure | — |
| `metersphere.testConnection` | MeterSphere: Test Connection | — |
| `metersphere.statusBarMenu` | MeterSphere: Status Bar Menu | — |
| `metersphere.toggleDebug` | MeterSphere: Toggle Debug Mode | — |
| `metersphere.uploadFromEditor` | MeterSphere: Upload to MeterSphere | — |
| `metersphere.uploadFromFileExplorer` | MeterSphere: Upload to MeterSphere | — |
| `metersphere.syncFolder` | MeterSphere: Sync Folder | — |
| `metersphere.showEnvironment` | MeterSphere: Show Environment | `$(globe)` |
| `metersphere.showHistory` | MeterSphere: Show History | `$(history)` |
| `metersphere.showSettings` | MeterSphere: Show Settings | `$(gear)` |
| `metersphere.showSync` | MeterSphere: Show Sync | `$(sync)` |
| `metersphere.syncToMs` | MeterSphere: Sync to MeterSphere | — |
| `metersphere.uploadFromNavigator` | MeterSphere: Upload to MeterSphere | — |

## Usage

### 1. Configure credentials
Open **Control Panel → Settings** or run `MeterSphere: Configure`. Set `msUrl`, `accessKey`, and `secretKey`. Use `Test Connection` to verify.

### 2. Browse projects
The **Navigator** tree auto-loads workspaces and projects. Select a workspace/project to set context.

### 3. Sync Java files
Right-click a `.java` file or folder in the File Explorer → **MeterSphere: Upload to MeterSphere**. The Sync panel opens with scanning progress, lets you select a module and configure options, then upload.

### 4. Debug APIs
Run `MeterSphere: Show Debugger` — select method, enter path and body, execute against your MeterSphere instance.

## Sync Flow

```
1. User triggers sync (file/folder/project)
2. Sync WebView opens → "Scanning..." state
3. Module/project dropdowns enabled during scan
4. Upload button shows "Scanning..." (disabled)
5. Background scan discovers @RestController classes
6. Scan done:
   - Files found → Upload button enabled, files listed
   - No files → Error shown, upload stays disabled
7. User selects module, options (import mode, context path, export name, sync test cases)
8. User clicks "Upload to MeterSphere"
```

## Development

```bash
npm install                    # Install dependencies
npm run compile                # TypeScript compile → out/
npm run watch                  # Watch mode
npx tsc -p tsconfig.json --noEmit   # Type-check only
npx eslint "src/**/*.{ts,tsx}"      # Lint
npm test                       # Run all Jest tests
npx jest --verbose              # Verbose test output
npx jest test/<file>.test.ts    # Run specific test
node test/<file>.test.js        # Run legacy Node tests
```

Tests use a mock VSCode stack: `src/vscode.d.ts`, `node_modules/vscode/index.js`, and `test/vscode-mock-setup.js`.

## Project Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 MVP1 | ✅ Complete | TokenManager, HttpClient, SettingsManager, WebView scaffold, Jest |
| Phase 2 | ✅ Complete | Navigator TreeView, on-demand sync |
| Phase 3A | ✅ Complete | Sync upload, Environment/History panels |
| Phase 3B | ✅ Complete | Mocks, test data |
| Phase 3C | ✅ Stub Complete | DebugLogger only (telemetry deprecated) |
| Phase 4 | ✅ Complete | Context menus, Settings enhancements, testConnection, syncCases |
| Phase 4 Enhancement | ✅ Complete | Inline sync button, scan scope dialog, scanning UI, parallel module selection |
| Phase 5 | ✅ Complete | API Debugger (1:1 with IDEA plugin) |
| Sidebar Migration | ✅ Complete | 4 webviews → single Control Panel, accordion panels |
| API Endpoints in Navigator | ✅ Complete | API definitions under modules |
| Debugger Polish & Integration | ✅ Complete | VSCode theme CSS, message queuing, upload duplication guard |

## Current Status

- Resolution focus completed: alignment of API naming precedence to: 1) @Operation(summary) 2) first line of Javadoc 3) API path. This removes @ApiOperation as a naming source and ensures predictable API names in the export path.
- Header propagation fixed: extracted @RequestHeader names are now propagated into the Postman/MeterSphere export via SyncService, so headers appear in the generated requests instead of being dropped.
- AST parity enhanced: JavaParserAst now parses @RequestHeader in per-method analysis, bringing AST-based parsing in line with the JavaParser flow for headers.
- Javadoc enrichment behavior adjusted: enhanceWithJavadoc now only fills summary when one is missing, preserving the explicit @Operation(summary) value. If a summary is present from annotations, Javadoc will not override it.
- Tests updated: focused tests added/adjusted to verify header extraction and naming precedence across parser paths and export logic. Focused parser tests pass locally.
- Documentation: README and in-repo task plan reflect current implementation scope and verification steps. No breaking changes to consumer code paths beyond naming precedence and header propagation.

- What remains optional or under consideration:
  - Extend header metadata (e.g., required, default) propagation to Postman headers.
  - Parity parity for JavaParserAst with richer tests or deprecation of AST path if unused by the runtime.

- Verification commands (local):
  - npm test -- test/javaParser.test.ts
  - npm test --silent
  - npm run compile

## Architecture

```
src/
  extension.ts                  # Top-level extension entry
  vscode.d.ts                   # VSCode API type declarations (mock-friendly)
  metersphere/
    extension.ts                # Extension bootstrap, view providers, activation
    tokenManager.ts/js          # Token persistence via VSCode settings
    settingsManager.ts          # Workspace/project ID persistence
    httpClient.ts/js            # HTTP client with token injection
    connectionManager.ts        # Connection state tracking
    commandRouter.ts            # Command registration and dispatch
    webviewController.ts        # WebView-based API debugger
    navigatorEngine.ts          # Tree data fetching (workspaces → projects → modules → APIs)
    navigatorTreeProvider.ts    # VSCode TreeDataProvider for Navigator
    syncEngine.ts               # Controller scanning and sync logic
    syncService.ts              # Sync upload service
    javaFileScanner.ts          # Java file discovery
    javaParser.ts               # Java annotation parser
    javaParserAst.ts            # AST-based Java parser
    contextHolder.ts            # Global extension context holder
    debugLogger.ts              # Debug logging to Output panel
    authHeader.js               # Auth header generation
    retry.js                    # Retry utility
    math.js                     # Math utilities
    models/
      navigatorNode.ts          # Tree node types (workspace/project/module/api)
      apiTemplate.ts            # API definition template
    views/
      sidebarView.ts            # Control Panel HTML and message handling
test/
  tokenManager.test.ts          # TokenManager tests
  httpClient.test.ts            # HttpClient tests
  commandRouter.test.ts         # CommandRouter tests
  connectionManager.test.ts     # ConnectionManager tests
  extension-bootstrap.test.ts   # Extension bootstrap tests
  javaParser.test.ts            # Java parser tests
  navigatorEngine.test.ts       # NavigatorEngine tests
  navigatorTreeProvider.test.ts # NavigatorTreeProvider tests
  syncEngine.test.ts            # SyncEngine tests
  syncService.test.ts           # SyncService tests
  models/                       # Model tests
  vscode-mock-setup.js          # Global vscode mock for Jest
docs/superpowers/
  specs/                        # Design specifications per phase
  plans/                        # Implementation plans per phase
```
