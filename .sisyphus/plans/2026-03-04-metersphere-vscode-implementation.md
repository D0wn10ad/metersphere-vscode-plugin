# MeterSphere VSCode Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a VSCode extension that exports Java REST controllers to MeterSphere as API definitions, with configuration UI and connection management.

**Architecture:** Hybrid approach - settings.json for basic config + QuickPick for dynamic selectors + Status Bar for connection indicator. API client with AKSK signature authentication. Java code parsing via java-parser library.

**Tech Stack:** TypeScript, VSCode Extension API, Axios, java-parser, AES encryption

---

## Pre-Implementation Setup

### Phase 0: Project Initialization

**Task 0.1: Initialize VSCode Extension Project**

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscode/launch.json`

**Step 1: Create package.json**

```json
{
  "name": "metersphere-vscode",
  "displayName": "MeterSphere",
  "description": "VSCode extension for MeterSphere API testing platform",
  "version": "1.0.0",
  "publisher": "metersphere",
  "engines": { "vscode": "^1.74.0" },
  "categories": ["Other", "Testing"],
  "activationEvents": ["onCommand:metersphere.configure"],
  "contributes": {
    "commands": [
      { "command": "metersphere.configure", "title": "MeterSphere: Configure" },
      { "command": "metersphere.connect", "title": "MeterSphere: Connect" },
      { "command": "metersphere.export", "title": "MeterSphere: Export to MeterSphere" }
    ],
    "configuration": {
      "title": "MeterSphere",
      "properties": {
        "metersphere.url": {
          "type": "string",
          "default": "http://localhost:8080",
          "description": "MeterSphere server URL"
        },
        "metersphere.accessKey": {
          "type": "string",
          "default": "",
          "description": "API Access Key"
        },
        "metersphere.secretKey": {
          "type": "string",
          "default": "",
          "description": "API Secret Key"
        },
        "metersphere.contextPath": {
          "type": "string",
          "default": "/api",
          "description": "API context path"
        },
        "metersphere.exportMode": {
          "type": "string",
          "enum": ["fullCoverage", "incrementalMerge"],
          "default": "incrementalMerge",
          "description": "Export mode"
        },
        "metersphere.useJavadoc": {
          "type": "boolean",
          "default": true,
          "description": "Use Javadoc comments as API names"
        },
        "metersphere.nestingDepth": {
          "type": "number",
          "default": 3,
          "description": "Nested object parsing depth"
        }
      }
    },
    "menus": {
      "editor/context": [
        {
          "when": "resourceExtname == .java",
          "command": "metersphere.export",
          "group": "metersphere"
        }
      ]
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/vscode": "^1.74.0",
    "@types/node": "^18.0.0",
    "typescript": "^5.0.0",
    "@vscode/test-electron": "^2.3.0"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "uuid": "^9.0.0",
    "java-parser": "^1.4.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "test"]
}
```

**Step 3: Create .vscode/launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}", "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"],
      "outFiles": ["${workspaceFolder}/out/test/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

**Step 4: Commit**

```bash
git add package.json tsconfig.json .vscode/launch.json
git commit -m "chore: scaffold VSCode extension project"
```

---

### Phase 1: Foundation Services

### Task 1.1: Create Type Definitions

**Files:**
- Create: `src/types/index.ts`

**Step 1: Write the failing test**

```typescript
// test/types.test.ts
import * as assert from 'assert';
import { MeterSphereConfig, PostmanCollection } from '../src/types';

const config: MeterSphereConfig = {
  url: 'http://localhost:8080',
  accessKey: 'test-key',
  secretKey: 'test-secret',
  contextPath: '/api',
  exportMode: 'incrementalMerge',
  useJavadoc: true,
  nestingDepth: 3
};

assert.strictEqual(config.url, 'http://localhost:8080');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "types"`
Expected: FAIL with "Cannot find module '../src/types'"

**Step 3: Write the implementation**

```typescript
// src/types/index.ts
export interface MeterSphereConfig {
  url: string;
  accessKey: string;
  secretKey: string;
  contextPath: string;
  exportMode: 'fullCoverage' | 'incrementalMerge';
  useJavadoc: boolean;
  nestingDepth: number;
  
  // Runtime (loaded from API)
  workspaceId?: string;
  workspaceName?: string;
  projectId?: string;
  projectName?: string;
  moduleId?: string;
  moduleName?: string;
  versionId?: string;
}

export interface MSWorkSpace {
  id: string;
  name: string;
}

export interface MSProject {
  id: string;
  name: string;
  versionEnable?: boolean;
}

export interface MSModule {
  id: string;
  name: string;
}

export interface MSProjectVersion {
  id: string;
  name: string;
}

// Postman Collection v2.1 types
export interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
}

export interface PostmanInfo {
  name: string;
  description: string;
  schema: string;
  _postman_id?: string;
}

export interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
  response?: PostmanResponse[];
}

export interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl;
}

export interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
}

export interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded';
  raw?: string;
  formdata?: PostmanFormData[];
  jsonSchema?: string;
}

export interface PostmanFormData {
  key: string;
  value: string;
  type: string;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQuery[];
  variable?: PostmanVariable[];
}

export interface PostmanQuery {
  key: string;
  value: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
}

export interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  header: PostmanHeader[];
  body: string;
  originalRequest: PostmanRequest;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "types"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/index.ts test/types.test.ts
git commit -m "feat: add type definitions"
```

---

### Task 1.2: Create Configuration Service

**Files:**
- Create: `src/services/config.ts`

**Step 1: Write the failing test**

```typescript
// test/config.test.ts
import * as assert from 'assert';
import { MeterSphereConfig } from '../src/types';

const config = { url: 'http://localhost:8080', accessKey: 'key', secretKey: 'secret' };
assert(config.url === 'http://localhost:8080');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "config"`
Expected: FAIL with "Cannot find module '../src/services/config'"

**Step 3: Write the implementation**

```typescript
// src/services/config.ts
import * as vscode from 'vscode';
import { MeterSphereConfig } from '../types';

const CONFIG_PREFIX = 'metersphere';

export class ConfigService {
  private static instance: ConfigService;
  
  private constructor() {}
  
  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }
  
  getConfig(): MeterSphereConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    return {
      url: config.get<string>('url', 'http://localhost:8080'),
      accessKey: config.get<string>('accessKey', ''),
      secretKey: config.get<string>('secretKey', ''),
      contextPath: config.get<string>('contextPath', '/api'),
      exportMode: config.get<'fullCoverage' | 'incrementalMerge'>('exportMode', 'incrementalMerge'),
      useJavadoc: config.get<boolean>('useJavadoc', true),
      nestingDepth: config.get<number>('nestingDepth', 3)
    };
  }
  
  async updateConfig(key: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
  
  getWsConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_PREFIX);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "config"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/config.ts test/config.test.ts
git commit -m "feat: add configuration service"
```

---

### Task 1.3: Create Authentication Service (Signature Generation)

**Files:**
- Create: `src/services/auth.ts`

**Step 1: Write the failing test**

```typescript
// test/auth.test.ts
import * as assert from 'assert';
import { generateSignature } from '../src/services/auth';

const sig = generateSignature('accessKey', 'secretKey');
assert(sig.length > 0, 'signature should not be empty');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "auth"`
Expected: FAIL with "Cannot find module '../src/services/auth'"

**Step 3: Write the implementation**

```typescript
// src/services/auth.ts
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate signature for MeterSphere API authentication
 * Format: AESEncrypt(accessKey|uuid|timestamp, secretKey, accessKey)
 */
export function generateSignature(accessKey: string, secretKey: string): string {
  const timestamp = Date.now();
  const uuid = uuidv4();
  const payload = `${accessKey}|${uuid}|${timestamp}`;
  
  try {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.createHash('sha256').update(accessKey).digest().slice(0, 16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let signature = cipher.update(payload, 'utf8', 'hex');
    signature += cipher.final('hex');
    return signature;
  } catch (error) {
    throw new Error(`Failed to generate signature: ${error}`);
  }
}

/**
 * Build authentication headers for MeterSphere API
 */
export function buildAuthHeaders(accessKey: string, secretKey: string): Record<string, string> {
  return {
    'accessKey': accessKey,
    'signature': generateSignature(accessKey, secretKey)
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "auth"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/auth.ts test/auth.test.ts
git commit -m "feat: add authentication service with signature generation"
```

---

### Task 1.4: Create API Client Service

**Files:**
- Create: `src/services/api.ts`

**Step 1: Write the failing test**

```typescript
// test/api.test.ts
import * as assert from 'assert';
import { MsApiClient } from '../src/services/api';

const client = new MsApiClient('http://localhost:8080', 'key', 'secret');
assert(client.baseUrl === 'http://localhost:8080');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "api client"`
Expected: FAIL with "Cannot find module '../src/services/api'"

**Step 3: Write the implementation**

```typescript
// src/services/api.ts
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { buildAuthHeaders } from './auth';
import { MSWorkSpace, MSProject, MSModule, MSProjectVersion } from '../types';

export class MsApiClient {
  private client: AxiosInstance;
  public baseUrl: string;
  
  constructor(url: string, accessKey: string, secretKey: string) {
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      const headers = buildAuthHeaders(accessKey, secretKey);
      Object.assign(config.headers, headers);
      return config;
    });
  }
  
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/currentUser');
      return response.status === 200;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
  
  async getUserInfo(): Promise<any> {
    const response = await this.client.get('/user/key/validate');
    return response.data;
  }
  
  async getWorkSpaces(): Promise<MSWorkSpace[]> {
    const response = await this.client.get('/workspace/list/userworkspace');
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error('Failed to fetch workspaces');
  }
  
  async getProjects(workspaceId: string): Promise<MSProject[]> {
    const response = await this.client.post('/project/list/related', { workspaceId });
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error('Failed to fetch projects');
  }
  
  async getModules(projectId: string, protocol: string = 'HTTP'): Promise<MSModule[]> {
    const response = await this.client.get(`/api/module/list/${projectId}/${protocol}`);
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error('Failed to fetch modules');
  }
  
  async getVersions(projectId: string): Promise<MSProjectVersion[]> {
    const response = await this.client.get(`/project/version/get-project-versions/${projectId}`);
    if (response.data.success) {
      return response.data.data;
    }
    return [];
  }
  
  async isVersionEnabled(projectId: string): Promise<boolean> {
    try {
      const response = await this.client.get(`/project/version/enable/${projectId}`);
      return response.data.success && response.data.data === true;
    } catch {
      return false;
    }
  }
  
  async uploadDefinition(file: Buffer, params: Record<string, any>): Promise<boolean> {
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('file', file, { filename: 'collection.json', contentType: 'application/json' });
    form.append('request', JSON.stringify(params));
    
    const response = await this.client.post('/api/definition/import', form, {
      headers: {
        ...form.getHeaders(),
        'accessKey': this.client.defaults.headers.common['accessKey'],
        'signature': this.client.defaults.headers.common['signature']
      }
    });
    
    return response.status === 200 || response.status === 201;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "api client"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/api.ts test/api.test.ts
git commit -m "feat: add MeterSphere API client service"
```

---

### Task 1.5: Create Logger Utility

**Files:**
- Create: `src/utils/logger.ts`

**Step 1: Write the failing test**

```typescript
// test/logger.test.ts
import * as assert from 'assert';
import { Logger } from '../src/utils/logger';

const logger = Logger.getInstance('test');
assert(logger !== undefined);
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "logger"`
Expected: FAIL with "Cannot find module '../src/utils/logger'"

**Step 3: Write the implementation**

```typescript
// src/utils/logger.ts
import * as vscode from 'vscode';

export class Logger {
  private static outputChannel: vscode.OutputChannel;
  private name: string;
  
  private constructor(name: string) {
    this.name = name;
    if (!Logger.outputChannel) {
      Logger.outputChannel = vscode.window.createOutputChannel('MeterSphere');
    }
  }
  
  static getInstance(name: string): Logger {
    return new Logger(name);
  }
  
  info(message: string, ...args: any[]): void {
    this.log('INFO', message, args);
  }
  
  warn(message: string, ...args: any[]): void {
    this.log('WARN', message, args);
  }
  
  error(message: string, ...args: any[]): void {
    this.log('ERROR', message, args);
  }
  
  private log(level: string, message: string, args: any[]): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level}] [${this.name}] ${message} ${args.length ? JSON.stringify(args) : ''}`;
    console.log(formatted);
    Logger.outputChannel.appendLine(formatted);
  }
  
  static show(): void {
    Logger.outputChannel.show();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "logger"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/logger.ts test/logger.test.ts
git commit -m "feat: add logger utility"
```

---

### Phase 2: Core Export Functionality

### Task 2.1: Create Java Parser Service

**Files:**
- Create: `src/services/javaParser.ts`

**Step 1: Write the failing test**

```typescript
// test/javaParser.test.ts
import * as assert from 'assert';
import { JavaParser } from '../src/services/javaParser';

const code = `
@RestController
@RequestMapping("/api/users")
public class UserController {
    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id) {
        return new User();
    }
}
`;

const parser = new JavaParser(code);
const endpoints = parser.parse();
assert(endpoints.length === 1);
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "java parser"`
Expected: FAIL with "Cannot find module '../src/services/javaParser'"

**Step 3: Write the implementation**

```typescript
// src/services/javaParser.ts
import { parse } from 'java-parser';

export interface ParsedEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  name: string;
  description?: string;
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responseType?: string;
}

export interface ParsedParameter {
  name: string;
  type: string;
  annotation: 'path' | 'request' | 'query' | 'unknown';
}

export interface ParsedRequestBody {
  type: string;
  required: boolean;
}

export class JavaParser {
  private code: string;
  
  constructor(code: string) {
    this.code = code;
  }
  
  parse(): ParsedEndpoint[] {
    try {
      const ast = parse(this.code);
      const endpoints: ParsedEndpoint[] = [];
      
      // Find class declarations
      const classDeclaration = this.findNode(ast, 'ClassDeclaration');
      if (!classDeclaration) return endpoints;
      
      // Get class annotations and name
      const classAnnotations = this.getAnnotations(classDeclaration);
      const isController = classAnnotations.some(a => 
        a.name === 'RestController' || a.name === 'Controller'
      );
      
      if (!isController) return endpoints;
      
      // Get base path from @RequestMapping
      let basePath = '';
      const requestMapping = classAnnotations.find(a => a.name === 'RequestMapping');
      if (requestMapping && requestMapping.value) {
        basePath = requestMapping.value;
      }
      
      // Find methods
      const methods = this.findNodes(ast, 'MethodDeclaration');
      for (const method of methods) {
        const endpoint = this.parseMethod(method, basePath);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }
      
      return endpoints;
    } catch (error) {
      console.error('Java parsing error:', error);
      return [];
    }
  }
  
  private findNode(ast: any, type: string): any {
    return this.findNodes(ast, type)[0];
  }
  
  private findNodes(ast: any, type: string): any[] {
    const results: any[] = [];
    const traverse = (node: any) => {
      if (!node) return;
      if (node.type === type) {
        results.push(node);
      }
      if (node.body && node.body.statements) {
        for (const stmt of node.body.statements) {
          traverse(stmt);
        }
      }
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };
    traverse(ast);
    return results;
  }
  
  private getAnnotations(node: any): Array<{name: string, value: string}> {
    const annotations: Array<{name: string, value: string}> = [];
    if (!node.decorators) return annotations;
    
    for (const decorator of node.decorators) {
      if (decorator.expression && decorator.expression.name) {
        annotations.push({
          name: decorator.expression.name,
          value: decorator.expression.arguments?.[0]?.value || ''
        });
      }
    }
    return annotations;
  }
  
  private parseMethod(method: any, basePath: string): ParsedEndpoint | null {
    const annotations = this.getAnnotations(method);
    const httpMethod = annotations.find(a => 
      ['GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'PatchMapping'].includes(a.name)
    );
    
    if (!httpMethod) return null;
    
    const methodName = this.mapHttpMethod(httpMethod.name);
    const path = basePath + (httpMethod.value || '');
    
    // Parse parameters
    const parameters: ParsedParameter[] = [];
    if (method.parameters && method.parameters.parameters) {
      for (const param of method.parameters.parameters) {
        const paramAnnotations = this.getAnnotations(param);
        let annotation: 'path' | 'request' | 'query' | 'unknown' = 'unknown';
        
        if (paramAnnotations.some(a => a.name === 'PathVariable')) annotation = 'path';
        else if (paramAnnotations.some(a => a.name === 'RequestBody')) annotation = 'request';
        else if (paramAnnotations.some(a => a.name === 'RequestParam')) annotation = 'query';
        
        parameters.push({
          name: param.name?.identifier || param.name,
          type: param.type?.type?.name || param.type?.name || 'unknown',
          annotation
        });
      }
    }
    
    return {
      path,
      method: methodName,
      name: method.name?.identifier || method.name,
      parameters,
      requestBody: parameters.find(p => p.annotation === 'request') ? {
        type: parameters.find(p => p.annotation === 'request')!.type,
        required: true
      } : undefined,
      responseType: method.returnType?.type?.name || method.returnType?.name
    };
  }
  
  private mapHttpMethod(annotation: string): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' {
    const mapping: Record<string, 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'> = {
      'GetMapping': 'GET',
      'PostMapping': 'POST',
      'PutMapping': 'PUT',
      'DeleteMapping': 'DELETE',
      'PatchMapping': 'PATCH'
    };
    return mapping[annotation] || 'GET';
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "java parser"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/javaParser.ts test/javaParser.test.ts
git commit -m "feat: add Java parser service for REST endpoints"
```

---

### Task 2.2: Create Postman Collection Generator

**Files:**
- Create: `src/services/exporter.ts`

**Step 1: Write the failing test**

```typescript
// test/exporter.test.ts
import * as assert from 'assert';
import { Exporter } from '../src/services/exporter';

const exporter = new Exporter();
const collection = exporter.generateCollection([], 'TestProject');
assert(collection.info.name === 'TestProject');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "exporter"`
Expected: FAIL with "Cannot find module '../src/services/exporter'"

**Step 3: Write the implementation**

```typescript
// src/services/exporter.ts
import { PostmanCollection, PostmanItem, PostmanRequest, PostmanUrl, PostmanBody } from '../types';
import { ParsedEndpoint, JavaParser } from './javaParser';

export class Exporter {
  generateCollection(endpoints: ParsedEndpoint[], projectName: string): PostmanCollection {
    const items: PostmanItem[] = endpoints.map(endpoint => this.endpointToItem(endpoint));
    
    return {
      info: {
        name: projectName,
        description: `Exported from VSCode at ${new Date().toISOString()}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: items
    };
  }
  
  private endpointToItem(endpoint: ParsedEndpoint): PostmanItem {
    const url: PostmanUrl = {
      raw: endpoint.path,
      host: ['{{baseUrl}}'],
      path: endpoint.path.split('/').filter(p => p)
    };
    
    // Add path variables to URL
    const pathParams = endpoint.parameters.filter(p => p.annotation === 'path');
    if (pathParams.length > 0) {
      url.variable = pathParams.map(p => ({ key: p.name, value: '' }));
      url.path = url.path.map(segment => 
        segment.startsWith('{') ? `:${segment.slice(1, -1)}` : segment
      );
      url.raw = endpoint.path.replace(/{([^}]+)}/g, ':$1');
    }
    
    // Add query parameters
    const queryParams = endpoint.parameters.filter(p => p.annotation === 'query');
    if (queryParams.length > 0) {
      url.query = queryParams.map(p => ({ key: p.name, value: '' }));
    }
    
    const request: PostmanRequest = {
      method: endpoint.method,
      url,
      header: [
        { key: 'Content-Type', value: 'application/json' }
      ]
    };
    
    // Add request body for POST/PUT/PATCH
    if (endpoint.method !== 'GET' && endpoint.requestBody) {
      request.body = {
        mode: 'raw',
        raw: this.generateExampleBody(endpoint.requestBody.type)
      };
    }
    
    return {
      name: endpoint.name,
      request,
      response: [{
        name: `${endpoint.name} Example`,
        status: 'OK',
        code: 200,
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: this.generateExampleBody(endpoint.responseType),
        originalRequest: request
      }]
    };
  }
  
  private generateExampleBody(type: string | undefined): string {
    if (!type || type === 'void') return '{}';
    
    // Simple type mapping to example
    if (type.includes('String')) return '{"key": "value"}';
    if (type.includes('Integer') || type.includes('Long')) return '{"count": 0}';
    if (type.includes('Boolean')) return '{"active": true}';
    if (type.includes('List') || type.includes('Array')) return '[]';
    
    return '{}';
  }
  
  async parseAndExport(code: string, projectName: string): Promise<PostmanCollection> {
    const parser = new JavaParser(code);
    const endpoints = parser.parse();
    return this.generateCollection(endpoints, projectName);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "exporter"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/exporter.ts test/exporter.test.ts
git commit -m "feat: add Postman collection generator"
```

---

### Phase 3: Commands and UI

### Task 3.1: Create Configure Command

**Files:**
- Create: `src/commands/configure.ts`

**Step 1: Write the failing test**

```typescript
// test/configure.test.ts
import * as assert from 'assert';
// Mock vscode
const vscode = {
  commands: { registerCommand: () => {} },
  window: { showInformationMessage: () => {} }
};
assert(true);
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --grep "configure command"`
Expected: PASS (mocked)

**Step 3: Write the implementation**

```typescript
// src/commands/configure.ts
import * as vscode from 'vscode';
import { ConfigService } from '../services/config';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance('configure');

export function registerConfigureCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('metersphere.configure', async () => {
    const config = ConfigService.getInstance();
    const wsConfig = config.getWsConfig();
    
    // Open settings
    await vscode.commands.executeCommand('workbench.action.openSettings', 'metersphere');
    
    vscode.window.showInformationMessage('Configure MeterSphere settings in the settings panel.');
    logger.info('Configure command executed');
  });
  
  context.subscriptions.push(command);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "configure command"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/configure.ts test/configure.test.ts
git commit -m "feat: add configure command"
```

---

### Task 3.2: Create Connect Command with QuickPick

**Files:**
- Create: `src/commands/connect.ts`

**Step 1: Write the failing test**

```typescript
// test/connect.test.ts
import * as assert from 'assert';
assert(true); // Placeholder
```

**Step 2: Run test**

Run: `npm test -- --grep "connect command"`
Expected: PASS

**Step 3: Write the implementation**

```typescript
// src/commands/connect.ts
import * as vscode from 'vscode';
import { ConfigService } from '../services/config';
import { MsApiClient } from '../services/api';
import { Logger } from '../utils/logger';
import { MSWorkSpace, MSProject, MSModule } from '../types';

const logger = Logger.getInstance('connect');

export function registerConnectCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('metersphere.connect', async () => {
    try {
      const config = ConfigService.getInstance();
      const settings = config.getConfig();
      
      if (!settings.url || !settings.accessKey || !settings.secretKey) {
        vscode.window.showErrorMessage('Please configure MeterSphere URL, accessKey, and secretKey first.');
        await vscode.commands.executeCommand('metersphere.configure');
        return;
      }
      
      // Create API client
      const client = new MsApiClient(settings.url, settings.accessKey, settings.secretKey);
      
      // Test connection
      const connected = await client.testConnection();
      
      if (!connected) {
        vscode.window.showErrorMessage('Failed to connect to MeterSphere. Check your credentials.');
        return;
      }
      
      // Fetch workspaces
      const workspaces = await client.getWorkSpaces();
      
      if (workspaces.length === 0) {
        vscode.window.showWarningMessage('No workspaces found.');
        return;
      }
      
      // Show workspace picker
      const workspace = await vscode.window.showQuickPick(
        workspaces.map(ws => ({ label: ws.name, value: ws })),
        { placeHolder: 'Select Workspace' }
      );
      
      if (!workspace) return;
      
      // Fetch projects
      const projects = await client.getProjects(workspace.value.id);
      
      const project = await vscode.window.showQuickPick(
        projects.map(p => ({ label: p.name, value: p })),
        { placeHolder: 'Select Project' }
      );
      
      if (!project) return;
      
      // Fetch modules
      const modules = await client.getModules(project.value.id);
      
      const module = await vscode.window.showQuickPick(
        modules.map(m => ({ label: m.name, value: m })),
        { placeHolder: 'Select Module' }
      );
      
      if (!module) return;
      
      // Save selections to config
      await config.updateConfig('workspaceId', workspace.value.id);
      await config.updateConfig('projectId', project.value.id);
      await config.updateConfig('moduleId', module.value.id);
      
      vscode.window.showInformationMessage(`Connected to ${workspace.value.name} > ${project.value.name} > ${module.value.name}`);
      logger.info(`Connected to workspace: ${workspace.value.id}, project: ${project.value.id}, module: ${module.value.id}`);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Connection failed: ${message}`);
      logger.error('Connection error:', error);
    }
  });
  
  context.subscriptions.push(command);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "connect command"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/connect.ts test/connect.test.ts
git commit -m "feat: add connect command with QuickPick selectors"
```

---

### Task 3.3: Create Export Command

**Files:**
- Create: `src/commands/export.ts`

**Step 1: Write the failing test**

```typescript
// test/export.test.ts
import * as assert from 'assert';
assert(true); // Placeholder
```

**Step 2: Run test**

Run: `npm test -- --grep "export command"`
Expected: PASS

**Step 3: Write the implementation**

```typescript
// src/commands/export.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '../services/config';
import { MsApiClient } from '../services/api';
import { Exporter } from '../services/exporter';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance('export');

export function registerExportCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('metersphere.export', async (uri?: vscode.Uri) => {
    try {
      const config = ConfigService.getInstance();
      const settings = config.getConfig();
      
      if (!settings.url || !settings.accessKey || !settings.secretKey) {
        vscode.window.showErrorMessage('Please configure and connect to MeterSphere first.');
        await vscode.commands.executeCommand('metersphere.connect');
        return;
      }
      
      // Get file to export
      let fileUri = uri;
      if (!fileUri) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          fileUri = editor.document.uri;
        }
      }
      
      if (!fileUri) {
        vscode.window.showWarningMessage('No Java file selected.');
        return;
      }
      
      // Read file content
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const code = doc.getText();
      
      // Parse and generate collection
      const exporter = new Exporter();
      const projectName = path.basename(fileUri.fsPath, '.java');
      const collection = await exporter.parseAndExport(code, projectName);
      
      // Check if module is configured
      const wsConfig = config.getWsConfig();
      const moduleId = wsConfig.get<string>('moduleId');
      const projectId = wsConfig.get<string>('projectId');
      
      if (!moduleId || !projectId) {
        vscode.window.showWarningMessage('Please run "MeterSphere: Connect" first to select project and module.');
        await vscode.commands.executeCommand('metersphere.connect');
        return;
      }
      
      // Upload to MeterSphere
      const client = new MsApiClient(settings.url, settings.accessKey, settings.secretKey);
      
      const collectionJson = JSON.stringify(collection, null, 2);
      const buffer = Buffer.from(collectionJson, 'utf-8');
      
      const params = {
        moduleId,
        projectId,
        mode: settings.exportMode === 'fullCoverage' ? 'fullCoverage' : 'incrementalMerge',
        platform: 'Postman',
        model: 'definition',
        protocol: 'HTTP',
        origin: 'vscode'
      };
      
      const success = await client.uploadDefinition(buffer, params);
      
      if (success) {
        vscode.window.showInformationMessage(`Successfully exported ${projectName} to MeterSphere!`);
        logger.info(`Exported ${projectName} to module ${moduleId}`);
      } else {
        vscode.window.showErrorMessage('Failed to export to MeterSphere.');
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Export failed: ${message}`);
      logger.error('Export error:', error);
    }
  });
  
  context.subscriptions.push(command);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "export command"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/export.ts test/export.test.ts
git commit -m "feat: add export command for Java files"
```

---

### Task 3.4: Create Status Bar

**Files:**
- Create: `src/ui/statusBar.ts`

**Step 1: Write the failing test**

```typescript
// test/statusBar.test.ts
import * as assert from 'assert';
assert(true); // Placeholder
```

**Step 2: Run test**

Run: `npm test -- --grep "status bar"`
Expected: PASS

**Step 3: Write the implementation**

```typescript
// src/ui/statusBar.ts
import * as vscode from 'vscode';
import { ConfigService } from '../services/config';
import { MsApiClient } from '../services/api';

let statusBarItem: vscode.StatusBarItem;

export function createStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  
  statusBarItem.text = '$(plug) MeterSphere: Disconnected';
  statusBarItem.command = 'metersphere.connect';
  statusBarItem.tooltip = 'Click to connect to MeterSphere';
  statusBarItem.show();
  
  context.subscriptions.push(statusBarItem);
}

export async function updateStatusBar(connected: boolean): Promise<void> {
  if (!statusBarItem) return;
  
  if (connected) {
    statusBarItem.text = '$(plug) MeterSphere: Connected';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.successBackground');
  } else {
    statusBarItem.text = '$(plug) MeterSphere: Disconnected';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "status bar"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ui/statusBar.ts test/statusBar.test.ts
git commit -m "feat: add status bar indicator"
```

---

### Phase 4: Extension Entry Point

### Task 4.1: Create Extension Entry Point

**Files:**
- Create: `src/extension.ts`

**Step 1: Write the failing test**

```typescript
// test/extension.test.ts
import * as assert from 'assert';
assert(true); // Placeholder
```

**Step 2: Run test**

Run: `npm test -- --grep "extension"`
Expected: PASS

**Step 3: Write the implementation**

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { registerConfigureCommand } from './commands/configure';
import { registerConnectCommand } from './commands/connect';
import { registerExportCommand } from './commands/export';
import { createStatusBar } from './ui/statusBar';
import { Logger } from './utils/logger';

const logger = Logger.getInstance('extension');

export function activate(context: vscode.ExtensionContext): void {
  logger.info('MeterSphere extension activating...');
  
  // Register commands
  registerConfigureCommand(context);
  registerConnectCommand(context);
  registerExportCommand(context);
  
  // Create status bar
  createStatusBar(context);
  
  logger.info('MeterSphere extension activated');
}

export function deactivate(): void {
  logger.info('MeterSphere extension deactivated');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- --grep "extension"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/extension.ts test/extension.test.ts
git commit -m "feat: add extension entry point"
```

---

## Final Verification Wave

### Task F1: Verify Complete Extension

**Step 1: Build the extension**

Run: `npm run compile`
Expected: No TypeScript errors

**Step 2: Test in VSCode**

Run: F5 to launch extension in debug mode
Expected: Extension loads, commands registered

**Step 3: Manual testing**

- Run "MeterSphere: Configure" - settings panel opens
- Run "MeterSphere: Connect" - QuickPick shows (with valid credentials)
- Right-click Java file - "Export to MeterSphere" appears
- Status bar shows "MeterSphere: Disconnected"

---

## Commit Strategy

After each task (Steps labeled "Commit"):
```bash
git add <files>
git commit -m "<type>: <description>"
```

---

## Success Criteria

- [ ] Extension compiles without errors
- [ ] All commands register correctly
- [ ] Settings are saved to VSCode configuration
- [ ] QuickPick selectors work for workspace/project/module
- [ ] Export generates valid Postman collection
- [ ] Upload to MeterSphere succeeds (with valid server)
- [ ] Status bar shows connection status
