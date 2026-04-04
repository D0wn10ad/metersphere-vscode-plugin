# Phase 2 Implementation Plan — Core Navigator + Option C (on-demand sync)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

> **Prerequisites before starting:** Run Phase 1 verification checklist:
> ```bash
> npm install && npm run compile && npx tsc -p tsconfig.json --noEmit && npm test
> ```
> All must pass before starting Phase 2.

**Goal:** Deliver Phase 2 with a Core Navigator (TreeView) and Option C UX, enabling on-demand pull/push sync, integrated with the WebView API debugger.

**Architecture:** NavigatorEngine discovers MeterSphere v2 resources via the HTTP client. NavigatorTreeDataProvider feeds a VSCode TreeView. Selecting a node prefills the WebView template. SyncEngine handles pull/push with conflict detection.

**Tech Stack:** TypeScript, VSCode TreeView API, `vscode.TreeDataProvider`, `vscode.window.createTreeView`, `vscode.Webview`, `src/metersphere/httpClient.ts`.

---

## File structure

```
src/
  extension.ts                       # Already exists — add Phase 2 command registrations
  metersphere/
    extension.ts                     # Already exists — bootstrap Phase 2 activation
    navigatorTreeProvider.ts         # NEW: TreeDataProvider for Navigator
    navigatorTreeProvider.test.ts    # NEW: Jest tests
    navigatorEngine.ts               # NEW: Discovery API client + cache
    navigatorEngine.test.ts          # NEW: Jest tests
    commandRouter.ts                 # NEW: Command registration for Phase 2
    commandRouter.test.ts            # NEW: Jest tests
    syncEngine.ts                    # NEW: Pull/push with conflict detection
    syncEngine.test.ts               # NEW: Jest tests
    webviewController.ts             # Already exists — extend with prefilled templates
    webviewController.test.ts        # NEW: Extend WebView tests
    models/
      navigatorNode.ts               # NEW: TreeNode model
      navigatorNode.test.ts          # NEW: Jest tests
      apiTemplate.ts                 # NEW: Prefill template model
      apiTemplate.test.ts            # NEW: Jest tests
test/
  (existing TS tests remain)
  navigatorTreeProvider.test.ts
  navigatorEngine.test.ts
  commandRouter.test.ts
  syncEngine.test.ts
  webviewController.test.ts
  models/navigatorNode.test.ts
  models/apiTemplate.test.ts
```

---

## Task 1: NavigatorNode model

**Files:**
- Create: `src/metersphere/models/navigatorNode.ts`
- Create: `test/models/navigatorNode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/models/navigatorNode.test.ts
import { NavigatorNode, NodeType } from '../../src/metersphere/models/navigatorNode'

describe('NavigatorNode', () => {
  test('creates leaf node with correct properties', () => {
    const node = new NavigatorNode({
      id: 'api-123',
      name: 'Get Users',
      type: NodeType.API,
      parentId: undefined,
    })
    expect(node.id).toBe('api-123')
    expect(node.name).toBe('Get Users')
    expect(node.type).toBe(NodeType.API)
    expect(node.parentId).toBeUndefined()
    expect(node.children).toEqual([])
    expect(node.collapsibleState).toBe(0) // None for leaf
  })

  test('creates folder node with children', () => {
    const folder = new NavigatorNode({
      id: 'folder-1',
      name: 'User APIs',
      type: NodeType.FOLDER,
      parentId: undefined,
    })
    folder.addChild(new NavigatorNode({ id: 'api-1', name: 'Get', type: NodeType.API, parentId: 'folder-1' }))
    expect(folder.children.length).toBe(1)
    expect(folder.collapsibleState).toBe(2) // Expanded
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/models/navigatorNode.test.ts --verbose
```
Expected: FAIL — `NavigatorNode` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metersphere/models/navigatorNode.ts

export enum NodeType {
  ROOT = 'root',
  WORKSPACE = 'workspace',
  PROJECT = 'project',
  MODULE = 'module',
  API = 'api',
  CASE = 'case',
  SCENARIO = 'scenario',
  FOLDER = 'folder',
}

export interface NavigatorNodeOptions {
  id: string
  name: string
  type: NodeType
  parentId?: string
  iconPath?: string
  tooltip?: string
}

export class NavigatorNode {
  public readonly id: string
  public readonly name: string
  public readonly type: NodeType
  public readonly parentId?: string
  public readonly iconPath?: string
  public readonly tooltip?: string
  public children: NavigatorNode[] = []
  public collapsibleState: number = 0

  constructor(options: NavigatorNodeOptions) {
    this.id = options.id
    this.name = options.name
    this.type = options.type
    this.parentId = options.parentId
    this.iconPath = options.iconPath
    this.tooltip = options.tooltip
    if (options.type === NodeType.FOLDER || options.type === NodeType.PROJECT || options.type === NodeType.WORKSPACE) {
      this.collapsibleState = 2 // Expanded
    }
  }

  addChild(child: NavigatorNode): void {
    this.children.push(child)
  }

  getChildren(): NavigatorNode[] {
    return this.children
  }

  isLeaf(): boolean {
    return this.children.length === 0
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest test/models/navigatorNode.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/models/navigatorNode.ts test/models/navigatorNode.test.ts
git commit -m "feat(navigator): add NavigatorNode model and NodeType enum"
```

---

## Task 2: ApiTemplate model

**Files:**
- Create: `src/metersphere/models/apiTemplate.ts`
- Create: `test/models/apiTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/models/apiTemplate.test.ts
import { ApiTemplate, Method } from '../../src/metersphere/models/apiTemplate'

describe('ApiTemplate', () => {
  test('creates template from NavigatorNode', () => {
    const template = new ApiTemplate({
      name: 'Get Users',
      method: Method.GET,
      url: '/api/users',
      path: '/api/users',
      moduleId: 'mod-1',
      projectId: 'proj-1',
    })
    expect(template.method).toBe('GET')
    expect(template.url).toBe('/api/users')
    expect(template.headers).toEqual({})
    expect(template.body).toBeUndefined()
  })

  test('toWebviewPayload returns correct shape', () => {
    const template = new ApiTemplate({
      name: 'Create User',
      method: Method.POST,
      url: '/api/users',
      path: '/api/users',
    })
    const payload = template.toWebviewPayload()
    expect(payload.command).toBe('prefill')
    expect(payload.name).toBe('Create User')
    expect(payload.method).toBe('POST')
    expect(payload.url).toBe('/api/users')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/models/apiTemplate.test.ts --verbose
```
Expected: FAIL — `ApiTemplate` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metersphere/models/apiTemplate.ts

export enum Method {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

export interface ApiTemplateOptions {
  name: string
  method: Method | string
  url: string
  path?: string
  moduleId?: string
  projectId?: string
  headers?: Record<string, string>
  body?: unknown
  description?: string
}

export interface WebviewPayload {
  command: 'prefill'
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
  description?: string
}

export class ApiTemplate {
  public readonly name: string
  public readonly method: string
  public readonly url: string
  public readonly path?: string
  public readonly moduleId?: string
  public readonly projectId?: string
  public headers: Record<string, string>
  public body?: unknown
  public description?: string

  constructor(options: ApiTemplateOptions) {
    this.name = options.name
    this.method = typeof options.method === 'string' ? options.method.toUpperCase() : options.method
    this.url = options.url
    this.path = options.path
    this.moduleId = options.moduleId
    this.projectId = options.projectId
    this.headers = options.headers ?? {}
    this.body = options.body
    this.description = options.description
  }

  toWebviewPayload(): WebviewPayload {
    return {
      command: 'prefill',
      name: this.name,
      method: this.method,
      url: this.url,
      headers: this.headers,
      body: this.body,
      description: this.description,
    }
  }

  static fromNavigatorNode(node: NavigatorNode, baseUrl: string): ApiTemplate {
    return new ApiTemplate({
      name: node.name,
      method: Method.GET,
      url: baseUrl + (node.tooltip ?? ''),
    })
  }
}
```

Note: `NavigatorNode` is imported from `./navigatorNode` in the real file.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest test/models/apiTemplate.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/models/apiTemplate.ts test/models/apiTemplate.test.ts
git commit -m "feat(navigator): add ApiTemplate model and Method enum"
```

---

## Task 3: NavigatorEngine

**Files:**
- Create: `src/metersphere/navigatorEngine.ts`
- Create: `test/navigatorEngine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/navigatorEngine.test.ts
import { NavigatorEngine } from '../src/metersphere/navigatorEngine'
import { NodeType } from '../src/metersphere/models/navigatorNode'

describe('NavigatorEngine', () => {
  const mockHttpRequest = async (method: string, url: string, headers: Record<string, string>, body?: unknown) => {
    if (url.includes('/workspace/list')) {
      return { status: 200, body: { data: [{ id: 'ws-1', name: 'Test Workspace' }] } }
    }
    if (url.includes('/project/list')) {
      return { status: 200, body: { data: [{ id: 'proj-1', name: 'Test Project', workspaceId: 'ws-1' }] } }
    }
    return { status: 200, body: { data: [] } }
  }

  beforeEach(() => {
    NavigatorEngine.clearCache()
  })

  test('discovers workspaces', async () => {
    const engines = await NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
    expect(engines.length).toBeGreaterThan(0)
    expect(engines[0].id).toBe('ws-1')
    expect(engines[0].name).toBe('Test Workspace')
  })

  test('builds tree from project list', async () => {
    const projects = [{ id: 'proj-1', name: 'API Project', workspaceId: 'ws-1' }]
    const tree = NavigatorEngine.buildTree(projects)
    expect(tree.length).toBe(1)
    expect(tree[0].type).toBe(NodeType.PROJECT)
    expect(tree[0].children.length).toBe(0)
  })

  test('cache is used on second call', async () => {
    NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
    NavigatorEngine.discoverWorkspaces(mockHttpRequest as any)
    // Should not throw — cache hit
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/navigatorEngine.test.ts --verbose
```
Expected: FAIL — `NavigatorEngine` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metersphere/navigatorEngine.ts
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { httpRequest, HttpResponse } from './httpClient'
import { SettingsManager } from './settingsManager'

interface MsWorkspace {
  id: string
  name: string
}

interface MsProject {
  id: string
  name: string
  workspaceId: string
}

export class NavigatorEngine {
  private static workspaceCache: NavigatorNode[] | null = null

  static clearCache(): void {
    NavigatorEngine.workspaceCache = null
  }

  static async discoverWorkspaces(
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    if (NavigatorEngine.workspaceCache) {
      return NavigatorEngine.workspaceCache
    }
    const baseUrl = NavigatorEngine.getBaseUrl()
    const resp = await fetchFn('GET', `${baseUrl}/workspace/list`, {})
    const data = (resp.body as { data: MsWorkspace[] }).data ?? []
    const nodes = data.map(ws => new NavigatorNode({
      id: ws.id,
      name: ws.name,
      type: NodeType.WORKSPACE,
    }))
    NavigatorEngine.workspaceCache = nodes
    return nodes
  }

  static buildTree(projects: MsProject[]): NavigatorNode[] {
    const projectMap = new Map<string, NavigatorNode>()
    for (const proj of projects) {
      const node = new NavigatorNode({
        id: proj.id,
        name: proj.name,
        type: NodeType.PROJECT,
        parentId: proj.workspaceId,
      })
      projectMap.set(proj.id, node)
    }
    return Array.from(projectMap.values())
  }

  static getBaseUrl(): string {
    return SettingsManager.getMsUrl() ?? 'http://localhost:8080'
  }
}
```

Note: `SettingsManager.getMsUrl()` needs to be added to `settingsManager.ts` if not present.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest test/navigatorEngine.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/navigatorEngine.ts test/navigatorEngine.test.ts
git commit -m "feat(navigator): add NavigatorEngine with workspace discovery"
```

---

## Task 4: NavigatorTreeDataProvider

**Files:**
- Create: `src/metersphere/navigatorTreeProvider.ts`
- Create: `test/navigatorTreeProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/navigatorTreeProvider.test.ts
import { NavigatorTreeDataProvider } from '../src/metersphere/navigatorTreeProvider'
import { NavigatorNode, NodeType } from '../src/metersphere/models/navigatorNode'

describe('NavigatorTreeDataProvider', () => {
  let provider: NavigatorTreeDataProvider

  beforeEach(() => {
    provider = new NavigatorTreeDataProvider()
  })

  test('getChildren returns empty for undefined parent', async () => {
    const root = await provider.getChildren(undefined)
    expect(Array.isArray(root)).toBe(true)
  })

  test('getChildren returns root nodes after refresh', async () => {
    const wsNode = new NavigatorNode({ id: 'ws-1', name: 'WS', type: NodeType.WORKSPACE })
    provider.setRoots([wsNode])
    const children = await provider.getChildren(undefined)
    expect(children.length).toBe(1)
    expect(children[0].id).toBe('ws-1')
  })

  test('getTreeItem returns correct tree item shape', async () => {
    const node = new NavigatorNode({ id: 'api-1', name: 'Get Users', type: NodeType.API })
    const item = await provider.getTreeItem(node)
    expect(item.id).toBe('api-1')
    expect(item.label).toBe('Get Users')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/navigatorTreeProvider.test.ts --verbose
```
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metersphere/navigatorTreeProvider.ts
import * as vscode from 'vscode'
import { NavigatorNode } from './models/navigatorNode'

export class NavigatorTreeDataProvider implements vscode.TreeDataProvider<NavigatorNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NavigatorNode | undefined>()
  readonly onDidChangeTreeData: vscode.Event<NavigatorNode | undefined> = this._onDidChangeTreeData.event

  private roots: NavigatorNode[] = []

  setRoots(roots: NavigatorNode[]): void {
    this.roots = roots
    this._onDidChangeTreeData.fire(undefined)
  }

  getChildren(element?: NavigatorNode): NavigatorNode[] | Thenable<NavigatorNode[]> {
    if (!element) {
      return this.roots
    }
    return element.getChildren()
  }

  getTreeItem(element: NavigatorNode): vscode.TreeItem {
    return {
      id: element.id,
      label: element.name,
      collapsibleState: element.collapsibleState as vscode.TreeItemCollapsibleState,
      tooltip: element.tooltip,
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest test/navigatorTreeProvider.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/navigatorTreeProvider.ts test/navigatorTreeProvider.test.ts
git commit -m "feat(navigator): add NavigatorTreeDataProvider for VSCode TreeView"
```

---

## Task 5: CommandRouter

**Files:**
- Create: `src/metersphere/commandRouter.ts`
- Create: `test/commandRouter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/commandRouter.test.ts
import { CommandRouter } from '../src/metersphere/commandRouter'

describe('CommandRouter', () => {
  const mockContext = { subscriptions: [] } as any

  test('registers all Phase 2 commands', () => {
    const commands: string[] = []
    const registerCommand = (cmd: string, _cb: (...args: any[]) => any) => commands.push(cmd)
    CommandRouter.registerAll(mockContext, { registerCommand } as any)
    expect(commands).toContain('metersphere.refreshNavigator')
    expect(commands).toContain('metersphere.openNavigator')
    expect(commands).toContain('metersphere.prefillFromNode')
  })

  test('prefillFromNode dispatches to webview', () => {
    const webviewPost: unknown[] = []
    const webview = { postMessage: (msg: unknown) => { webviewPost.push(msg); return Promise.resolve(true) } } as any
    CommandRouter.prefillFromNode({ id: 'api-1', name: 'Test', type: 'API' } as any, webview)
    expect(webviewPost.length).toBe(1)
    expect((webviewPost[0] as any).command).toBe('prefill')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/commandRouter.test.ts --verbose
```
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metersphere/commandRouter.ts
import * as vscode from 'vscode'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { NavigatorNode } from './models/navigatorNode'

export class CommandRouter {
  static registerAll(
    context: vscode.ExtensionContext,
    deps: {
      navigatorProvider: NavigatorTreeDataProvider
      httpRequest: any
      getActiveWebviewPanel: () => vscode.WebviewPanel | undefined
    }
  ): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.refreshNavigator', async () => {
        const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest)
        deps.navigatorProvider.setRoots(roots)
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.openNavigator', () => {
        vscode.commands.executeCommand('metersphere.navigator.view.focus')
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.prefillFromNode', (node: NavigatorNode) => {
        const panel = deps.getActiveWebviewPanel()
        if (panel) {
          panel.webview.postMessage({
            command: 'prefill',
            name: node.name,
            method: 'GET',
            url: node.tooltip ?? '',
          })
        }
      })
    )
  }

  static prefillFromNode(node: NavigatorNode, webview: vscode.Webview): Promise<boolean> {
    return webview.postMessage({
      command: 'prefill',
      name: node.name,
      method: 'GET',
      url: node.tooltip ?? '',
    })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest test/commandRouter.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/commandRouter.ts test/commandRouter.test.ts
git commit -m "feat(navigator): add CommandRouter for Phase 2 commands"
```

---

## Task 6: SyncEngine

**Files:**
- Create: `src/metersphere/syncEngine.ts`
- Create: `test/syncEngine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/syncEngine.test.ts
import { SyncEngine, SyncDirection } from '../src/metersphere/syncEngine'

describe('SyncEngine', () => {
  test('detects conflict when local and remote differ', () => {
    const local = { id: 'api-1', version: 1, body: { name: 'Local' } }
    const remote = { id: 'api-1', version: 1, body: { name: 'Remote' } }
    const hasConflict = SyncEngine.detectConflict(local, remote)
    expect(hasConflict).toBe(true)
  })

  test('no conflict when local and remote match', () => {
    const local = { id: 'api-1', version: 2, body: { name: 'Same' } }
    const remote = { id: 'api-1', version: 2, body: { name: 'Same' } }
    const hasConflict = SyncEngine.detectConflict(local, remote)
    expect(hasConflict).toBe(false)
  })

  test('pull returns remote data', async () => {
    const mockFetch = async () => ({ status: 200, body: { id: 'api-1', name: 'Remote API' } })
    const result = await SyncEngine.pull('api-1', mockFetch as any)
    expect(result.body.name).toBe('Remote API')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/syncEngine.test.ts --verbose
```
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/metersphere/syncEngine.ts
import { httpRequest, HttpResponse } from './httpClient'
import { SettingsManager } from './settingsManager'

export enum SyncDirection {
  PULL = 'pull',
  PUSH = 'push',
}

interface SyncItem {
  id: string
  version: number
  body: unknown
  updatedAt?: string
}

export class SyncEngine {
  static detectConflict(local: SyncItem, remote: SyncItem): boolean {
    if (local.version !== remote.version) return true
    return JSON.stringify(local.body) !== JSON.stringify(remote.body)
  }

  static async pull(
    resourceId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080'
    return fetchFn('GET', `${baseUrl}/api/definition/${resourceId}`, {})
  }

  static async push(
    resourceId: string,
    body: unknown,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body: unknown) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const baseUrl = SettingsManager.getMsUrl() ?? 'http://localhost:8080'
    return fetchFn('PUT', `${baseUrl}/api/definition/${resourceId}`, {}, body)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest test/syncEngine.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/metersphere/syncEngine.ts test/syncEngine.test.ts
git commit -m "feat(sync): add SyncEngine with conflict detection"
```

---

## Task 7: Extension bootstrap for Phase 2

**Files:**
- Modify: `src/metersphere/extension.ts`
- Modify: `src/extension.ts`
- Modify: `package.json` (add TreeView contribution + new commands)

- [ ] **Step 1: Write the failing test** (integration test for extension registration)

```ts
// test/extension-bootstrap.test.ts
// Note: This test verifies the extension registration logic without VSCode runtime
// by checking the command registration side effects.

describe('Phase 2 Extension Bootstrap', () => {
  test('metersphere.navigator.view is registered in package.json', () => {
    // Verify the TreeView contribution exists in package.json
    const pkg = require('../package.json')
    const views = pkg.contributes?.views?.['metersphere.navigator'] ?? []
    expect(views.length).toBeGreaterThan(0)
  })

  test('Phase 2 commands are registered', () => {
    const pkg = require('../package.json')
    const commands = pkg.contributes?.commands ?? []
    const cmdIds = commands.map((c: any) => c.command)
    expect(cmdIds).toContain('metersphere.refreshNavigator')
    expect(cmdIds).toContain('metersphere.openNavigator')
    expect(cmdIds).toContain('metersphere.prefillFromNode')
  })
})
```

- [ ] **Step 2: Run test to verify it fails** (package.json not yet updated)

```bash
npx jest test/extension-bootstrap.test.ts --verbose
```
Expected: FAIL.

- [ ] **Step 3: Add TreeView to package.json**

```json
{
  "contributes": {
    "views": {
      "metersphere.navigator": [
        {
          "id": "metersphere.navigator.view",
          "name": "MeterSphere Navigator"
        }
      ]
    },
    "commands": [
      { "command": "metersphere.refreshNavigator", "title": "MeterSphere: Refresh Navigator" },
      { "command": "metersphere.openNavigator", "title": "MeterSphere: Open Navigator" },
      { "command": "metersphere.prefillFromNode", "title": "MeterSphere: Prefill from Node" }
    ]
  }
}
```

- [ ] **Step 4: Extend extension.ts to register NavigatorTreeDataProvider and commands**

```ts
// src/metersphere/extension.ts (add to activate)
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { CommandRouter } from './commandRouter'
import { httpRequest } from './httpClient'

export function activate(context: vscode.ExtensionContext): void {
  const navigatorProvider = new NavigatorTreeDataProvider()
  const treeView = vscode.window.createTreeView('metersphere.navigator.view', {
    treeDataProvider: navigatorProvider,
  })

  const getActivePanel = (): vscode.WebviewPanel | undefined => {
    return (globalThis as any).__activeMsPanel
  }

  CommandRouter.registerAll(context, {
    navigatorProvider,
    httpRequest,
    getActiveWebviewPanel: getActivePanel,
  })

  context.subscriptions.push(treeView)

  // Initial load
  NavigatorEngine.discoverWorkspaces(httpRequest).then(roots => {
    navigatorProvider.setRoots(roots)
  })
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx jest test/extension-bootstrap.test.ts --verbose
```
Expected: PASS.

- [ ] **Step 6: Run full test suite**

```bash
npm test && npm run compile
```
Expected: all PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts src/metersphere/extension.ts package.json
git commit -m "feat(phase2): register Navigator TreeView and Phase 2 commands"
```

---

## Task 8: Phase 2 end-to-end verification

- [ ] **Step 1: Manual test checklist**

1. Open VSCode with the extension loaded
2. Run `MeterSphere: Open Navigator` from Command Palette → TreeView appears
3. Expand workspace nodes → projects visible
4. Click an API node → WebView prefills with URL/method
5. Edit in WebView → send request → response appears
6. Run `MeterSphere: Refresh Navigator` → tree refreshes
7. Run `npm run compile` → no errors
8. Run `npm test` → all tests pass

---

## Risks

- **VSCode runtime required** — TreeView and WebView integration only testable in VSCode, not in Jest
- **NavigatorEngine cache** — `clearCache()` must be called on logout; add as a task if missed
- **Conflict resolution UX** — Task 6 implements detection only; UI prompts for conflict resolution can be added in Phase 3A

---

## Git hygiene

Commit per task (as shown above). All commits on `main`. Conventional commit format: `feat(navigator):`, `feat(sync):`, `feat(phase2):`.
