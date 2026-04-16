# Sync to MeterSphere Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement "Sync to MeterSphere" feature in VSCode plugin that parses Java Spring controller files and uploads API definitions to MeterSphere v2.

**Architecture:** Hybrid parser combining LSP documentSymbols (class/method structure), regex (annotation path extraction), and hover provider (Javadoc if Java extension installed). Output format: Postman Collection v2.1 (v2-compatible).

**Tech Stack:** TypeScript, VSCode API (executeCommand, showOpenDialog), regex patterns, Postman JSON format

---

## File Structure

```
src/metersphere/
├── javaParser.ts           # NEW - Java file parsing (hybrid LSP + regex + hover)
├── syncService.ts          # NEW - Orchestrates parse → format → upload
├── syncEngine.ts           # MODIFY - Add multipart file upload support
├── navigatorEngine.ts       # REUSE - Module selection (already has discoverModules)
└── views/sidebarView.ts    # MODIFY - Add file picker button to Sync WebView
```

---

## Task 1: Create Java Parser Module

**Files:**
- Create: `src/metersphere/javaParser.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/javaParser.test.ts
import { JavaParser } from '../../src/metersphere/javaParser';

describe('JavaParser', () => {
  it('should parse @RestController class', () => {
    const code = `
package com.example;

@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe('UserController');
    expect(result.classes[0].isRestController).toBe(true);
  });

  it('should extract @GetMapping path', () => {
    const code = `
@RestController
@RequestMapping("/api")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis).toHaveLength(1);
    expect(result.apis[0].method).toBe('GET');
    expect(result.apis[0].path).toBe('/users');
    expect(result.apis[0].fullPath).toBe('/api/users');
  });

  it('should extract @PathVariable parameter', () => {
    const code = `
@RestController
public class UserController {
  @GetMapping("/users/{id}")
  public User getUser(@PathVariable("id") Long id) { return null; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis[0].parameters).toHaveLength(1);
    expect(result.apis[0].parameters[0].name).toBe('id');
    expect(result.apis[0].parameters[0].in).toBe('path');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/javaParser.test.ts --verbose`
Expected: FAIL - "JavaParser not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/metersphere/javaParser.ts

export interface ParsedApi {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  fullPath: string;
  summary?: string;
  parameters: ParsedParameter[];
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'body' | 'header';
  required?: boolean;
  type?: string;
  description?: string;
}

export interface ParsedClass {
  name: string;
  isRestController: boolean;
  isController: boolean;
  basePath: string;
  apis: ParsedApi[];
}

export interface ParseResult {
  classes: ParsedClass[];
  apis: ParsedApi[];
}

const ANNOTATION_PATTERNS = {
  restController: /@RestController\s*\(\s*\)/g,
  controller: /@Controller\s*\(\s*\)/g,
  requestMapping: /@RequestMapping\s*\(\s*"([^"]+)"\s*\)/g,
  getMapping: /@GetMapping\s*\(\s*"([^"]+)"\s*\)/g,
  postMapping: /@PostMapping\s*\(\s*"([^"]+)"\s*\)/g,
  putMapping: /@PutMapping\s*\(\s*"([^"]+)"\s*\)/g,
  deleteMapping: /@DeleteMapping\s*\(\s*"([^"]+)"\s*\)/g,
  patchMapping: /@PatchMapping\s*\(\s*"([^"]+)"\s*\)/g,
  pathVariable: /@PathVariable\s*\(\s*"([^"]+)"\s*\)/g,
  requestParam: /@RequestParam\s*\(\s*"([^"]+)"\s*\)/g,
  requestBody: /@RequestBody\s*\(\s*\)/g,
  requestHeader: /@RequestHeader\s*\(\s*"([^"]+)"\s*\)/g,
};

export class JavaParser {
  static parseSource(code: string, uri: string): ParseResult {
    const result: ParseResult = { classes: [], apis: [] };
    
    // Find @RestController or @Controller classes
    const restControllerMatch = ANNOTATION_PATTERNS.restController(code);
    const controllerMatch = ANNOTATION_PATTERNS.controller(code);
    const isRestController = restControllerMatch.length > 0;
    const isController = controllerMatch.length > 0 || isRestController;
    
    if (!isController) {
      return result;
    }

    // Extract class name (simplified)
    const classMatch = code.match(/class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : 'Unknown';

    // Extract @RequestMapping base path
    const requestMappingMatch = code.match(ANNOTATION_PATTERNS.requestMapping);
    const basePath = requestMappingMatch ? requestMappingMatch[1] : '';

    // Find all HTTP method mappings
    const methods = [
      { regex: ANNOTATION_PATTERNS.getMapping, method: 'GET' as const },
      { regex: ANNOTATION_PATTERNS.postMapping, method: 'POST' as const },
      { regex: ANNOTATION_PATTERNS.putMapping, method: 'PUT' as const },
      { regex: ANNOTATION_PATTERNS.deleteMapping, method: 'DELETE' as const },
      { regex: ANNOTATION_PATTERNS.patchMapping, method: 'PATCH' as const },
    ];

    const parsedClass: ParsedClass = {
      name: className,
      isRestController,
      isController,
      basePath,
      apis: [],
    };

    for (const { regex, method } of methods) {
      let match;
      while ((match = regex.exec(code)) !== null) {
        const path = match[1];
        const api: ParsedApi = {
          method,
          path,
          fullPath: basePath + path,
          parameters: [],
        };

        // Extract parameters for this method (basic implementation)
        const apiEnd = code.indexOf('}', match.index);
        const methodBody = code.substring(match.index, apiEnd > 0 ? apiEnd : code.length);
        
        // Find @PathVariable parameters
        let paramMatch;
        while ((paramMatch = ANNOTATION_PATTERNS.pathVariable.exec(methodBody)) !== null) {
          api.parameters.push({
            name: paramMatch[1],
            in: 'path',
          });
        }

        // Find @RequestParam parameters
        while ((paramMatch = ANNOTATION_PATTERNS.requestParam.exec(methodBody)) !== null) {
          api.parameters.push({
            name: paramMatch[1],
            in: 'query',
          });
        }

        // Check for @RequestBody
        if (ANNOTATION_PATTERNS.requestBody.test(methodBody)) {
          api.parameters.push({
            name: 'body',
            in: 'body',
          });
        }

        parsedClass.apis.push(api);
        result.apis.push(api);
      }
    }

    result.classes.push(parsedClass);
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/javaParser.test.ts --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/javaParser.ts test/javaParser.test.ts
git commit -m "feat: add JavaParser for Spring annotation extraction"
```

---

## Task 2: Create Sync Service Module

**Files:**
- Create: `src/metersphere/syncService.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/syncService.test.ts
import { SyncService, PostmanCollection } from '../../src/metersphere/syncService';
import { JavaParser, ParseResult } from '../../src/metersphere/javaParser';

describe('SyncService', () => {
  it('should convert parsed APIs to Postman format', () => {
    const parseResult: ParseResult = {
      classes: [{
        name: 'UserController',
        isRestController: true,
        isController: true,
        basePath: '/api',
        apis: [{
          method: 'GET',
          path: '/users',
          fullPath: '/api/users',
          parameters: [],
        }],
      }],
      apis: [{
        method: 'GET',
        path: '/users',
        fullPath: '/api/users',
        parameters: [],
      }],
    };

    const postman = SyncService.toPostmanCollection(parseResult, 'User APIs');
    expect(postman.info.name).toBe('User APIs');
    expect(postman.item).toHaveLength(1);
    expect(postman.item[0].request.method).toBe('GET');
  });

  it('should handle multiple APIs with different methods', () => {
    const parseResult: ParseResult = {
      classes: [{
        name: 'UserController',
        isRestController: true,
        isController: true,
        basePath: '/api',
        apis: [
          { method: 'GET', path: '/users', fullPath: '/api/users', parameters: [] },
          { method: 'POST', path: '/users', fullPath: '/api/users', parameters: [] },
          { method: 'GET', path: '/users/{id}', fullPath: '/api/users/{id}', parameters: [{ name: 'id', in: 'path' }] },
        ],
      }],
      apis: [],
    };

    const postman = SyncService.toPostmanCollection(parseResult, 'User APIs');
    expect(postman.item).toHaveLength(3);
    expect(postman.item[0].request.method).toBe('GET');
    expect(postman.item[1].request.method).toBe('POST');
    expect(postman.item[2].request.method).toBe('GET');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/syncService.test.ts --verbose`
Expected: FAIL - "SyncService not defined"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/metersphere/syncService.ts
import { ParseResult, ParsedApi } from './javaParser';

export interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: Array<{ key: string; value: string }>;
    url: {
      raw: string;
      host: string[];
      path: string[];
    };
    body?: {
      mode: string;
      raw: string;
    };
  };
}

export interface PostmanCollection {
  info: {
    name: string;
    description: string;
    schema: string;
  };
  item: PostmanItem[];
}

export class SyncService {
  static toPostmanCollection(parseResult: ParseResult, name: string): PostmanCollection {
    const collection: PostmanCollection = {
      info: {
        name,
        description: `Exported from Java Spring controllers`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [],
    };

    for (const api of parseResult.apis) {
      const item = SyncService.apiToPostmanItem(api);
      collection.item.push(item);
    }

    return collection;
  }

  static apiToPostmanItem(api: ParsedApi): PostmanItem {
    const url = api.fullPath;
    const pathParts = url.split('/').filter(Boolean);

    return {
      name: `${api.method} ${api.path}`,
      request: {
        method: api.method,
        header: [],
        url: {
          raw: url,
          host: ['{{baseUrl}}'],
          path: pathParts,
        },
      },
    };
  }

  static async syncToMeterSphere(
    parseResult: ParseResult,
    projectId: string,
    moduleId: string,
    mode: 'incrementalMerge' | 'fullCoverage',
    options: {
      contextPath?: string;
      coverModule?: boolean;
      versionId?: string;
      updateVersionId?: string;
    },
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<unknown>
  ): Promise<unknown> {
    // Convert to Postman JSON
    const collection = SyncService.toPostmanCollection(parseResult, 'Exported APIs');
    const jsonStr = JSON.stringify(collection, null, 2);
    
    // Build import URL with params
    const params = new URLSearchParams({
      modeId: mode,
      projectId,
      moduleId,
      protocol: 'HTTP',
      origin: 'vscode',
      coverModule: String(options.coverModule ?? false),
    });

    if (options.contextPath) {
      // Context path is handled in parsing, not as separate param
    }

    const { SettingsManager } = require('./settingsManager');
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080';
    const importUrl = `${baseUrl}/api/definition/import?${params.toString()}`;

    // Create multipart form
    const formData = new FormData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    formData.append('file', blob, 'collection.json');

    const requestJson = JSON.stringify({
      modeId: mode,
      projectId,
      moduleId,
      platform: 'Postman',
      model: 'definition',
      protocol: 'HTTP',
      origin: 'vscode',
      coverModule: options.coverModule ?? false,
    });
    formData.append('request', new Blob([requestJson], { type: 'application/json' }));

    // Note: Actual upload requires file upload support in httpClient
    // This is handled in Task 3
    return { url: importUrl, formData: 'multipart/form-data' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/syncService.test.ts --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/syncService.ts test/syncService.test.ts
git commit -m "feat: add SyncService for Postman conversion"
```

---

## Task 3: Update SyncEngine for File Upload

**Files:**
- Modify: `src/metersphere/syncEngine.ts`

- [ ] **Step 1: Read existing syncEngine.ts**

Already read - see Task 3 implementation below.

- [ ] **Step 2: Add importToMeterSphereWithFile method**

Update syncEngine.ts to support file upload:

```typescript
import { HttpResponse } from './httpClient';

export enum SyncDirection {
  PULL = 'pull',
  PUSH = 'push',
}

interface SyncItem {
  id: string;
  version: number;
  body: unknown;
  updatedAt?: string;
}

interface ImportOptions {
  modeId: 'incrementalMerge' | 'fullCoverage' | 'merge' | 'cover' | 'add';
  projectId: string;
  moduleId: string;
  platform?: string;
  model?: string;
  protocol?: string;
  origin?: string;
  coverModule?: boolean;
  versionId?: string;
  updateVersionId?: string;
  contextPath?: string;
}

export class SyncEngine {
  static detectConflict(local: SyncItem, remote: SyncItem): boolean {
    if (local.version !== remote.version) return true;
    return JSON.stringify(local.body) !== JSON.stringify(remote.body);
  }

  static async pull(
    resourceId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const { SettingsManager } = require('./settingsManager');
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080';
    return fetchFn('GET', `${baseUrl}/api/definition/${resourceId}`, {});
  }

  static async push(
    resourceId: string,
    body: unknown,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body: unknown) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const { SettingsManager } = require('./settingsManager');
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080';
    return fetchFn('PUT', `${baseUrl}/api/definition/${resourceId}`, {}, body);
  }

  // Original method - kept for backward compatibility
  static async importToMeterSphere(
    projectId: string,
    moduleId: string,
    mode: 'incrementalMerge' | 'fullCoverage',
    syncCase: boolean,
    protocol: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const { SettingsManager } = require('./settingsManager');
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080';
    
    const params = new URLSearchParams({
      modeId: mode,
      projectId: projectId,
      moduleId: moduleId,
      syncCase: String(syncCase),
      protocol: protocol,
      origin: 'vscode',
      coverModule: 'false',
    });
    
    return fetchFn('POST', `${baseUrl}/api/definition/import?${params.toString()}`, {}, null);
  }

  // New method - supports file upload with all options
  static async importWithFile(
    fileContent: string,
    fileName: string,
    options: ImportOptions,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const { SettingsManager } = require('./settingsManager');
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080';
    
    const params = new URLSearchParams({
      modeId: options.modeId,
      projectId: options.projectId,
      moduleId: options.moduleId,
      platform: options.platform ?? 'Postman',
      model: options.model ?? 'definition',
      protocol: options.protocol ?? 'HTTP',
      origin: options.origin ?? 'vscode',
      coverModule: String(options.coverModule ?? false),
    });

    if (options.versionId) {
      params.append('versionId', options.versionId);
    }
    if (options.updateVersionId) {
      params.append('updateVersionId', options.updateVersionId);
    }

    // Note: Actual multipart upload requires httpClient to support FormData
    // For now, this method prepares the params - full implementation needs httpClient update
    return fetchFn('POST', `${baseUrl}/api/definition/import?${params.toString()}`, {}, {
      file: fileContent,
      fileName,
      request: options,
    });
  }
}
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/metersphere/syncEngine.ts
git commit -m "feat: add importWithFile to SyncEngine for file upload"
```

---

## Task 4: Update Sync WebView with File Picker

**Files:**
- Modify: `src/metersphere/views/sidebarView.ts:648-718`

- [ ] **Step 1: Read current getSyncHtml**

Already read - see implementation below.

- [ ] **Step 2: Add file picker button and module selection**

Update getSyncHtml to include file picker:

```typescript
static getSyncHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; margin: 0; }
    h3 { margin: 0 0 16px 0; }
    label { display: block; margin-bottom: 4px; font-weight: 500; }
    select, input[type="text"] { width: 100%; padding: 8px; margin-bottom: 12px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
    select:focus, input:focus { outline: 2px solid #007acc; outline-offset: 1px; border-color: #007acc; }
    input[type="checkbox"] { margin-right: 8px; }
    .info { 
      background: rgba(0, 122, 204, 0.1); 
      border: 1px solid #007acc;
      border-radius: 6px; 
      padding: 12px 16px; 
      margin-bottom: 16px;
      color: #333;
      font-size: 13px;
      line-height: 1.5;
    }
    .info p { margin: 4px 0; }
    .info strong { color: #007acc; }
    .warning {
      background: rgba(204, 122, 0, 0.1);
      border: 1px solid #cc7a00;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      color: #333;
      font-size: 13px;
    }
    .warning a { color: #007acc; text-decoration: none; }
    button { padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; font-weight: 500; font-size: 13px; transition: all 0.15s ease; }
    button:hover { opacity: 0.85; }
    button:active { transform: scale(0.98); }
    .btn-primary { background: #007acc; color: white; }
    .btn-primary:hover { background: #005a9e; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #5a6268; }
    .form-group { margin-bottom: 16px; }
    .file-list { margin-bottom: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
    .file-list-item { padding: 4px 8px; margin: 4px 0; background: white; border-radius: 2px; }
    .status { padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
    .status.success { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    .status.loading { background: #fff3cd; color: #856404; }
  </style>
</head>
<body>
  <h3>Sync to MeterSphere</h3>
  <div class="info">
    <p><strong>Export Java Spring Controllers to MeterSphere</strong></p>
    <p>Select .java files with @RestController or @Controller annotations.</p>
  </div>
  
  <div class="warning" id="javaExtWarning" style="display: none;">
    <p>For Javadoc support, install:</p>
    <p><a href="#" onclick="vscode.postMessage({command: 'openExtension', data: 'redhat.java'})">Language Support for Java (Red Hat)</a></p>
    <p>or <a href="#" onclick="vscode.postMessage({command: 'openExtension', data: 'georgewfraser.vscode-javac'})">Java Language Support</a></p>
  </div>

  <div class="form-group">
    <label>Java Files</label>
    <button class="btn-secondary" onclick="selectFiles()">Select Java Files</button>
    <div class="file-list" id="fileList"></div>
  </div>

  <label>Module (from Navigator)</label>
  <select id="moduleSelect">
    <option value="">Select module...</option>
  </select>
  
  <label>Import Mode</label>
  <select id="importMode">
    <option value="incrementalMerge">Add New (incrementalMerge)</option>
    <option value="fullCoverage">Overwrite (fullCoverage)</option>
  </select>

  <label>
    <input type="checkbox" id="syncCases">
    Sync Test Cases
  </label>

  <label>Context Path (optional)</label>
  <input type="text" id="contextPath" placeholder="/api/v1">
  
  <label>
    <input type="checkbox" id="coverModule">
    Cover Module
  </label>
  
  <div id="status"></div>
  
  <button class="btn-primary" onclick="upload()" id="uploadBtn">Upload to MeterSphere</button>
  <script>
    const vscode = acquireVsCodeApi();
    let selectedFiles = [];

    function selectFiles() {
      vscode.postMessage({ command: 'selectJavaFiles' });
    }

    window.addEventListener('message', function(event) {
      const data = event.data;
      if (data.command === 'javaFilesSelected') {
        selectedFiles = data.files;
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = selectedFiles.map(f => 
          '<div class="file-list-item">' + f + '</div>'
        ).join('');
      } else if (data.command === 'modulesLoaded') {
        const select = document.getElementById('moduleSelect');
        select.innerHTML = '<option value="">Select module...</option>' +
          data.modules.map(m => '<option value="' + m.id + '">' + m.name + '</option>').join('');
      } else if (data.command === 'javaExtMissing') {
        document.getElementById('javaExtWarning').style.display = 'block';
      } else if (data.command === 'uploadProgress') {
        showStatus(data.message, 'loading');
      } else if (data.command === 'uploadSuccess') {
        showStatus('Successfully uploaded ' + data.count + ' APIs to MeterSphere!', 'success');
      } else if (data.command === 'uploadError') {
        showStatus('Error: ' + data.message, 'error');
      }
    });

    function showStatus(message, type) {
      document.getElementById('status').innerHTML = '<div class="status ' + type + '">' + message + '</div>';
    }

    function upload() {
      const moduleId = document.getElementById('moduleSelect').value;
      if (!moduleId) {
        showStatus('Please select a module', 'error');
        return;
      }
      if (selectedFiles.length === 0) {
        showStatus('Please select at least one Java file', 'error');
        return;
      }

      vscode.postMessage({ command: 'uploadToMeterSphere', data: {
        files: selectedFiles,
        moduleId: moduleId,
        mode: document.getElementById('importMode').value,
        syncCases: document.getElementById('syncCases').checked,
        contextPath: document.getElementById('contextPath').value,
        coverModule: document.getElementById('coverModule').checked,
      }});
    }
  </script>
</body>
</html>`;
}
```

- [ ] **Step 3: Add message handlers in SidebarView class**

Add upload handler and file picker logic. The sidebar view needs to handle messages from the webview:

```typescript
// Add to SidebarView class - handle sync webview messages
static handleSyncMessage(command: string, data: unknown, sendResponse: (response: unknown) => void): void {
  switch (command) {
    case 'selectJavaFiles':
      this.handleSelectJavaFiles(sendResponse);
      break;
    case 'uploadToMeterSphere':
      this.handleUploadToMeterSphere(data as SyncUploadData, sendResponse);
      break;
    case 'openExtension':
      this.handleOpenExtension(data as string);
      break;
  }
}

private static async handleSelectJavaFiles(sendResponse: (response: unknown) => void): Promise<void> {
  const { Uri } = require('vscode');
  const { window } = require('vscode');
  
  const files = await window.showOpenDialog({
    title: 'Select Java Files',
    filters: { 'Java Files': ['java'] },
    canSelectMany: true,
  });
  
  if (files && files.length > 0) {
    sendResponse({ command: 'javaFilesSelected', files: files.map(f => f.fsPath) });
  }
}

private static async handleUploadToMeterSphere(data: SyncUploadData, sendResponse: (response: unknown) => void): Promise<void> {
  // Implementation in Task 5
  sendResponse({ command: 'uploadProgress', message: 'Parsing Java files...' });
}

private static handleOpenExtension(extensionId: string): void {
  const { Uri } = require('vscode');
  const { env } = require('vscode');
  env.openExternal(Uri.parse('vscode:extension/' + extensionId));
}
```

- [ ] **Step 4: Commit**

```bash
git add src/metersphere/views/sidebarView.ts
git commit -m "feat: add file picker to Sync WebView"
```

---

## Task 5: Integrate Java Parser with Sync WebView

**Files:**
- Modify: `src/metersphere/views/sidebarView.ts`

- [ ] **Step 1: Update handleUploadToMeterSphere to use JavaParser**

```typescript
// In sidebarView.ts - update handleUploadToMeterSphere
import { JavaParser } from '../javaParser';
import { SyncService } from '../syncService';
import { NavigatorEngine } from '../navigatorEngine';
import { SettingsManager } from '../settingsManager';

interface SyncUploadData {
  files: string[];
  moduleId: string;
  mode: string;
  syncCases: boolean;
  contextPath?: string;
  coverModule?: boolean;
}

private static async handleUploadToMeterSphere(data: SyncUploadData, sendResponse: (response: unknown) => void): Promise<void> {
  try {
    sendResponse({ command: 'uploadProgress', message: 'Parsing Java files...' });
    
    const parseResults = { classes: [], apis: [] };
    
    // Parse each selected Java file
    for (const filePath of data.files) {
      const { workspace } = require('vscode');
      const fs = require('fs');
      
      const doc = await workspace.openTextDocument(filePath);
      const code = doc.getText();
      
      const result = JavaParser.parseSource(code, doc.uri.toString());
      parseResults.classes.push(...result.classes);
      parseResults.apis.push(...result.apis);
    }

    if (parseResults.apis.length === 0) {
      sendResponse({ command: 'uploadError', message: 'No APIs found. Ensure files have @RestController or @Controller annotations.' });
      return;
    }

    sendResponse({ command: 'uploadProgress', message: `Found ${parseResults.apis.length} APIs. Converting to Postman format...` });

    // Convert to Postman collection
    const collection = SyncService.toPostmanCollection(parseResults, 'Exported APIs');
    const jsonStr = JSON.stringify(collection, null, 2);

    sendResponse({ command: 'uploadProgress', message: 'Uploading to MeterSphere...' });

    // Get module info from NavigatorEngine
    const moduleId = data.moduleId;
    // Extract projectId from moduleId or use stored projectId
    const projectId = SettingsManager.getLastProjectId() || '';

    // Call import API (needs httpClient multipart support - simplified for now)
    const { HttpClient } = require('./httpClient');
    
    const result = await HttpClient.postFormData(
      `${SettingsManager.getMsUrl()}/api/definition/import`,
      {
        file: jsonStr,
        request: JSON.stringify({
          modeId: data.mode,
          projectId: projectId,
          moduleId: moduleId,
          platform: 'Postman',
          model: 'definition',
          protocol: 'HTTP',
          origin: 'vscode',
          coverModule: data.coverModule ?? false,
        }),
      },
      SettingsManager.getAccessKey(),
      SettingsManager.generateSignature()
    );

    if (result.status === 200 || result.status === 201) {
      sendResponse({ command: 'uploadSuccess', count: parseResults.apis.length });
    } else {
      sendResponse({ command: 'uploadError', message: 'Upload failed: ' + (result.body?.message || 'Unknown error') });
    }
  } catch (error) {
    sendResponse({ command: 'uploadError', message: 'Error: ' + (error as Error).message });
  }
}
```

- [ ] **Step 2: Check if httpClient supports FormData**

Need to verify if httpClient.ts has postFormData or similar method. If not, this task needs to add it.

- [ ] **Step 3: Commit**

```bash
git add src/metersphere/views/sidebarView.ts
git commit -m "feat: integrate JavaParser with Sync WebView upload"
```

---

## Task 6: Add Javadoc Extraction (Optional Enhancement)

**Files:**
- Modify: `src/metersphere/javaParser.ts`

- [ ] **Step 1: Add Javadoc extraction using hover provider**

```typescript
// Add to javaParser.ts
export class JavaParser {
  // ... existing code ...

  static async extractJavadoc(uri: vscode.Uri, position: vscode.Position): Promise<string | null> {
    const { commands, extensions } = require('vscode');
    
    // Check for Java extensions
    const javaExts = ['redhat.java', 'georgewfraser.vscode-javac'];
    const hasJavaExt = extensions.all.some(ext => javaExts.includes(ext.id));
    
    if (!hasJavaExt) {
      return null;
    }

    try {
      const hovers = await commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        uri,
        position
      );
      
      if (hovers && hovers[0]?.contents[0]) {
        const md = hovers[0].contents[0];
        // Extract first line as summary
        const lines = md.value.split('\n');
        return lines[0] || null;
      }
    } catch (error) {
      // Hover failed, return null
    }
    
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/metersphere/javaParser.ts
git commit -m "feat: add Javadoc extraction via hover provider"
```

---

## Task 7: Integration Test - End to End

**Files:**
- Run: Manual integration test

- [ ] **Step 1: Verify all components work together**

1. Select a Java file with @RestController
2. Click "Upload to MeterSphere"
3. Verify APIs are parsed correctly
4. Verify Postman collection is generated
5. Verify upload to MeterSphere succeeds

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "test: add end-to-end sync integration"
```

---

## Summary of Tasks

| Task | Description | Status |
|------|-------------|--------|
| 1 | Create JavaParser module | Pending |
| 2 | Create SyncService module | Pending |
| 3 | Update SyncEngine for file upload | Pending |
| 4 | Update Sync WebView with file picker | Pending |
| 5 | Integrate JavaParser with WebView | Pending |
| 6 | Add Javadoc extraction (optional) | Pending |
| 7 | End-to-end integration test | Pending |

---

## Execution Choice

**Plan complete and saved to `docs/superpowers/plans/2026-04-10-sync-to-metersphere-plan.md`. Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?