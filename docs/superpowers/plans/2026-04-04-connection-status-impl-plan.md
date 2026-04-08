# Connection Status + Test Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Test Connection validation and status bar connection state to the MeterSphere VSCode plugin.

**Architecture:** New `ConnectionManager` module as single source of truth for connection state. Status bar driven by `ConnectionManager.update()`. Configure flow uses `ConnectionManager.testConnection()` before saving. NavigatorEngine notifies ConnectionManager on API failure.

**Tech Stack:** TypeScript, VSCode API (StatusBarItem), Jest + ts-jest

---

## File Changes Overview

| File | Change |
|------|--------|
| `src/vscode.d.ts` | Add `StatusBarItem`, `StatusBarAlignment` types |
| `test/vscode-mock-setup.js` | Add status bar mock |
| `src/metersphere/settingsManager.ts` | Add optional params to `generateSignature()` |
| `src/metersphere/connectionManager.ts` | **New** — ConnectionManager class |
| `src/metersphere/extension.ts` | Instantiate ConnectionManager, test on activation |
| `src/metersphere/commandRouter.ts` | Inline validation in configure, add testConnection command |
| `src/metersphere/navigatorEngine.ts` | Notify ConnectionManager on API failure |
| `src/metersphere/navigatorTreeProvider.ts` | Pass ConnectionManager reference for failure notifications |
| `test/connectionManager.test.ts` | **New** — ConnectionManager unit tests |
| `package.json` | Add `metersphere.testConnection` command |

---

## Task 1: Add StatusBarItem to vscode.d.ts

**Files:**
- Modify: `src/vscode.d.ts`
- Test: `src/vscode.d.ts` (compile check)

- [ ] **Step 1: Add StatusBarItem interface and StatusBarAlignment enum to vscode.d.ts**

Add these to the module before the closing `}` of `declare module 'vscode'`:

```typescript
export enum StatusBarAlignment {
  Left = -1,
  Right = 1,
}

export interface StatusBarItem extends Disposable {
  text: string
  tooltip?: string
  color?: string
  command?: string
  show(): void
  hide(): void
}

export namespace window {
  function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem
  function showQuickPick<T>(
    items: T[] | Thenable<T[]>,
    options?: { placeHolder?: string; title?: string }
  ): Thenable<T | undefined>
}
```

- [ ] **Step 2: Compile to verify no errors**

Run: `npm run compile`
Expected: No TypeScript errors related to StatusBarItem

- [ ] **Step 3: Commit**

```bash
git add src/vscode.d.ts
git commit -m "feat(mock): add StatusBarItem and StatusBarAlignment to vscode mock"
```

---

## Task 2: Add status bar mock to vscode-mock-setup.js

**Files:**
- Modify: `test/vscode-mock-setup.js`
- Test: `test/vscode-mock-setup.js` (all tests pass)

- [ ] **Step 1: Update vscode-mock-setup.js to add StatusBarItem and showQuickPick**

Add after the existing `createTreeView` entry in the `window` mock:

```javascript
createStatusBarItem: (alignment, priority) => ({
  text: '',
  tooltip: undefined,
  color: undefined,
  command: undefined,
  show: () => {},
  hide: () => {},
  dispose: () => {},
}),
showQuickPick: (items, options) => Promise.resolve(items[0]),
```

- [ ] **Step 2: Verify tests pass**

Run: `npm test`
Expected: All 22 tests pass

- [ ] **Step 3: Commit**

```bash
git add test/vscode-mock-setup.js
git commit -m "test(mock): add StatusBarItem and showQuickPick mocks"
```

---

## Task 3: Update SettingsManager.generateSignature() to accept optional params

**Files:**
- Modify: `src/metersphere/settingsManager.ts`
- Test: Run `npm test` to verify existing tests still pass

- [ ] **Step 1: Update generateSignature to accept optional accessKey and secretKey**

Replace the existing `generateSignature()` method with:

```typescript
static generateSignature(accessKey?: string, secretKey?: string): string {
  const ak = accessKey ?? SettingsManager.getAccessKey()
  const sk = secretKey ?? SettingsManager.getSecretKey()
  if (!ak || !sk) {
    return ''
  }
  const uuid = crypto.randomUUID()
  const timestamp = Date.now()
  const plaintext = `${ak}|${uuid}|${timestamp}`
  const key = Buffer.from(sk, 'utf8')
  const iv = Buffer.from(ak, 'utf8')
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let sig = cipher.update(plaintext, 'utf8', 'base64')
  sig += cipher.final('base64')
  return sig
}
```

- [ ] **Step 2: Verify compile and tests**

Run: `npm run compile && npm test`
Expected: All 22 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/metersphere/settingsManager.ts
git commit -m "refactor(auth): generateSignature accepts optional accessKey/secretKey params"
```

---

## Task 4: Create ConnectionManager module

**Files:**
- Create: `src/metersphere/connectionManager.ts`
- Test: `test/connectionManager.test.ts` (new file)

- [ ] **Step 1: Write the failing test for ConnectionManager**

Create `test/connectionManager.test.ts`:

```typescript
import { ConnectionManager, ConnectionState } from '../src/metersphere/connectionManager'
import * as vscode from 'vscode'

jest.mock('vscode')

describe('ConnectionManager', () => {
  let cm: ConnectionManager
  let mockContext: vscode.ExtensionContext

  beforeEach(() => {
    mockContext = {
      subscriptions: [],
    } as any
    cm = new ConnectionManager(mockContext)
  })

  describe('update()', () => {
    it('shows status bar with Unconfigured state', () => {
      cm.update(ConnectionState.Unconfigured)
      expect(cm.getState()).toBe(ConnectionState.Unconfigured)
    })

    it('shows status bar with Connected state', () => {
      cm.update(ConnectionState.Connected, 'ms.example.com')
      expect(cm.getState()).toBe(ConnectionState.Connected)
    })

    it('shows status bar with Connecting state', () => {
      cm.update(ConnectionState.Connecting)
      expect(cm.getState()).toBe(ConnectionState.Connecting)
    })

    it('shows status bar with Disconnected state', () => {
      cm.update(ConnectionState.Disconnected, 'timeout')
      expect(cm.getState()).toBe(ConnectionState.Disconnected)
    })
  })

  describe('testConnection()', () => {
    it('returns success when /currentUser returns 200', async () => {
      // Mock httpRequest to return 200
    })

    it('returns error when /currentUser returns 401', async () => {
      // Mock httpRequest to return 401
    })
  })

  describe('getStatusBarText()', () => {
    it('returns hostname when connected', () => {
      cm.update(ConnectionState.Connected, 'http://ms.example.com/api')
      expect(cm.getStatusBarText()).toBe('ms.example.com')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=connectionManager`
Expected: FAIL with "Cannot find module" or similar

- [ ] **Step 3: Write the minimal ConnectionManager implementation**

Create `src/metersphere/connectionManager.ts`:

```typescript
import * as vscode from 'vscode'
import { httpRequest } from './httpClient'

export enum ConnectionState {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Unconfigured = 'unconfigured',
}

export class ConnectionManager {
  private statusBarItem: vscode.StatusBarItem
  private state: ConnectionState = ConnectionState.Unconfigured
  private lastError?: string
  private currentUrl?: string

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    )
    context.subscriptions.push(this)
    this.statusBarItem.show()
    this.update(ConnectionState.Unconfigured)
  }

  update(state: ConnectionState, message?: string): void {
    this.state = state
    switch (state) {
      case ConnectionState.Unconfigured:
        this.statusBarItem.text = '$(circle-slash) MeterSphere: Not configured'
        this.statusBarItem.command = undefined
        break
      case ConnectionState.Connecting:
        this.statusBarItem.text = '$(sync~spin) MeterSphere: Connecting...'
        this.statusBarItem.command = undefined
        break
      case ConnectionState.Connected:
        this.statusBarItem.text = '$(*) ' + this.extractHostname(message ?? '')
        this.statusBarItem.command = 'metersphere.statusBarMenu'
        break
      case ConnectionState.Disconnected:
        this.statusBarItem.text = '$(error) MeterSphere: Connection failed'
        this.statusBarItem.command = 'metersphere.statusBarMenu'
        break
    }
  }

  async testConnection(
    url?: string,
    accessKey?: string,
    secretKey?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    const msUrl = url ?? SettingsManager.getMsUrl()
    const ak = accessKey ?? SettingsManager.getAccessKey()
    const sk = secretKey ?? SettingsManager.getSecretKey()

    if (!msUrl || !ak || !sk) {
      return { success: false, error: 'Not configured' }
    }

    const signature = SettingsManager.generateSignature(ak, sk)
    const headers: Record<string, string> = {
      accessKey: ak,
      signature: signature,
    }

    try {
      const resp = await httpRequest('GET', `${msUrl}/currentUser`, headers)
      if (resp.status === 200) {
        this.currentUrl = msUrl
        this.update(ConnectionState.Connected, msUrl)
        return { success: true, url: msUrl }
      } else {
        this.update(ConnectionState.Disconnected)
        return { success: false, error: `HTTP ${resp.status}` }
      }
    } catch (error) {
      this.update(ConnectionState.Disconnected)
      return { success: false, error: String(error) }
    }
  }

  getState(): ConnectionState {
    return this.state
  }

  dispose(): void {
    this.statusBarItem.dispose()
  }

  private extractHostname(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }
}
```

Add import for SettingsManager at the top:
```typescript
import { SettingsManager } from './settingsManager'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=connectionManager`
Expected: Tests pass

- [ ] **Step 5: Verify compile**

Run: `npm run compile`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/metersphere/connectionManager.ts test/connectionManager.test.ts
git commit -m "feat(status): add ConnectionManager with status bar and testConnection"
```

---

## Task 5: Wire ConnectionManager into extension.ts

**Files:**
- Modify: `src/metersphere/extension.ts`
- Modify: `src/metersphere/navigatorTreeProvider.ts` (add ConnectionManager param)
- Test: `npm test`

- [ ] **Step 1: Add ConnectionManager to extension.ts**

Read `src/metersphere/extension.ts`, then replace the imports at the top:

```typescript
import * as vscode from 'vscode'
import { WebViewController } from './webviewController'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { CommandRouter } from './commandRouter'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { ConnectionManager, ConnectionState } from './connectionManager'
```

In the `activate` function, after creating `navigatorProvider`:

```typescript
// Connection manager — single source of truth for connection state
const connectionManager = new ConnectionManager(context)

// Test connection on activation if configured
if (SettingsManager.isConfigured()) {
  connectionManager.update(ConnectionState.Connecting)
  connectionManager.testConnection().then(result => {
    if (!result.success) {
      console.warn('MeterSphere: connection test failed on activation:', result.error)
    }
  })
  NavigatorEngine.clearCache()
  NavigatorEngine.discoverWorkspaces(httpRequest).then(roots => {
    navigatorProvider.setRoots(roots)
  }).catch(() => {
    connectionManager.update(ConnectionState.Disconnected)
  })
}
```

Also add `connectionManager` to the deps passed to `CommandRouter.registerAll`.

- [ ] **Step 2: Update NavigatorTreeDataProvider to accept ConnectionManager**

Read `src/metersphere/navigatorTreeProvider.ts`. Add a constructor parameter:

```typescript
constructor(private connectionManager?: ConnectionManager) {}
```

In `setFetchFn` or after fetch calls, if the fetch fails, call:
```typescript
this.connectionManager?.update(ConnectionState.Disconnected)
```

- [ ] **Step 3: Update extension.ts to pass connectionManager to navigatorProvider**

After creating `connectionManager`, pass it:
```typescript
const navigatorProvider = new NavigatorTreeDataProvider(connectionManager)
```

- [ ] **Step 4: Update NavigatorEngine to propagate ConnectionManager reference**

In `navigatorTreeProvider.ts`, when `discoverWorkspaces` or `discoverProjects` throws, call `connectionManager.update(ConnectionState.Disconnected)`.

Or alternatively: have `NavigatorEngine` call back with errors. For simplicity, handle errors in `navigatorTreeProvider.ts` — catch the promises from `discoverWorkspaces`/`discoverProjects` and update status bar on failure.

- [ ] **Step 5: Verify compile and tests**

Run: `npm run compile && npm test`
Expected: All 22 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/metersphere/extension.ts src/metersphere/navigatorTreeProvider.ts
git commit -m "feat(status): wire ConnectionManager into extension activation"
```

---

## Task 6: Update commandRouter.ts — configure inline validation + testConnection command + status bar menu

**Files:**
- Modify: `src/metersphere/commandRouter.ts`
- Modify: `package.json`
- Test: `npm test`

- [ ] **Step 1: Update package.json to add testConnection command and statusBarMenu command**

Read `package.json`. In the `commands` array, add:

```json
{
  "command": "metersphere.testConnection",
  "title": "MeterSphere: Test Connection"
},
{
  "command": "metersphere.statusBarMenu",
  "title": "MeterSphere: Status Bar Menu"
}
```

- [ ] **Step 2: Update commandRouter.ts imports**

Add:
```typescript
import { ConnectionManager, ConnectionState } from './connectionManager'
```

Update the `Deps` interface to include `connectionManager`:
```typescript
deps: {
  navigatorProvider: NavigatorTreeDataProvider
  httpRequest: unknown
  getActiveWebviewPanel: () => vscode.WebviewPanel | undefined
  connectionManager: ConnectionManager
}
```

- [ ] **Step 3: Replace the metersphere.configure handler with inline validation**

Replace the current configure handler with:

```typescript
vscode.commands.registerCommand('metersphere.configure', async () => {
  // Step 1: Prompt for MeterSphere URL
  const url = await vscode.window.showInputBox({
    title: 'MeterSphere Server URL',
    placeholder: 'http://localhost:8080',
    prompt: 'Enter your MeterSphere server URL',
  })

  if (url === undefined || url.trim() === '') {
    vscode.window.showInformationMessage('Configuration cancelled')
    return
  }

  // Step 2: Prompt for Access Key
  const accessKey = await vscode.window.showInputBox({
    title: 'MeterSphere Access Key',
    password: true,
    prompt: 'Enter your MeterSphere Access Key',
  })

  if (accessKey === undefined) {
    vscode.window.showInformationMessage('Configuration cancelled')
    return
  }

  // Step 3: Prompt for Secret Key
  const secretKey = await vscode.window.showInputBox({
    title: 'MeterSphere Secret Key',
    password: true,
    prompt: 'Enter your MeterSphere Secret Key',
  })

  if (secretKey === undefined) {
    vscode.window.showInformationMessage('Configuration cancelled')
    return
  }

  // Step 4: Show Connecting status while validating
  deps.connectionManager.update(ConnectionState.Connecting)

  // Step 5: Test connection BEFORE saving
  const result = await deps.connectionManager.testConnection(
    url.trim(),
    accessKey.trim(),
    secretKey.trim()
  )

  if (!result.success) {
    deps.connectionManager.update(ConnectionState.Unconfigured)
    vscode.window.showErrorMessage(
      'Connection failed: ' + (result.error ?? 'Unknown error')
    )
    return
  }

  // Step 6: Only save on success
  SettingsManager.setMsUrl(url.trim())
  SettingsManager.setAccessKey(accessKey.trim())
  SettingsManager.setSecretKey(secretKey.trim())

  // Step 7: Update status and refresh
  deps.connectionManager.update(ConnectionState.Connected, result.url)
  NavigatorEngine.clearCache()
  const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
  deps.navigatorProvider.setRoots(roots)
  vscode.window.showInformationMessage('MeterSphere configured successfully!')
})
```

- [ ] **Step 4: Add metersphere.testConnection handler**

After the configure handler, add:

```typescript
vscode.commands.registerCommand('metersphere.testConnection', async () => {
  await vscode.window.showInformationMessage('Testing connection...')
  const result = await deps.connectionManager.testConnection()
  if (result.success) {
    const url = result.url ?? ''
    let hostname = url
    try { hostname = new URL(url).hostname } catch { /* use as-is */ }
    vscode.window.showInformationMessage('Connected to ' + hostname)
  } else {
    vscode.window.showErrorMessage('Connection failed: ' + (result.error ?? 'Unknown error'))
  }
})
```

Note: The `extractHostname` helper in ConnectionManager should be made accessible or the hostname extracted inline.

- [ ] **Step 5: Add metersphere.statusBarMenu handler**

Add a new handler that shows the quick-pick menu:

```typescript
vscode.commands.registerCommand('metersphere.statusBarMenu', async () => {
  const choice = await vscode.window.showQuickPick(
    [
      'Test Connection',
      'Configure...',
      'Refresh Navigator',
      'Open Navigator',
    ],
    { placeHolder: 'MeterSphere', title: 'MeterSphere' }
  )

  if (!choice) return

  switch (choice) {
    case 'Test Connection':
      vscode.commands.executeCommand('metersphere.testConnection')
      break
    case 'Configure...':
      vscode.commands.executeCommand('metersphere.configure')
      break
    case 'Refresh Navigator':
      vscode.commands.executeCommand('metersphere.refreshNavigator')
      break
    case 'Open Navigator':
      vscode.commands.executeCommand('metersphere.openNavigator')
      break
  }
})
```

- [ ] **Step 6: Update refresh handler to use connectionManager**

The refresh handler should update status bar on failure too:

```typescript
vscode.commands.registerCommand('metersphere.refreshNavigator', async () => {
  deps.connectionManager.update(ConnectionState.Connecting)
  NavigatorEngine.clearCache()
  try {
    const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
    deps.navigatorProvider.setRoots(roots)
    deps.connectionManager.update(ConnectionState.Connected, SettingsManager.getMsUrl())
  } catch (error) {
    deps.connectionManager.update(ConnectionState.Disconnected, String(error))
  }
})
```

- [ ] **Step 7: Verify compile and tests**

Run: `npm run compile && npm test`
Expected: All 22 tests pass

- [ ] **Step 8: Commit**

```bash
git add src/metersphere/commandRouter.ts package.json
git commit -m "feat(status): add testConnection command, inline validation, status bar menu"
```

---

## Task 7: Notify ConnectionManager on NavigatorEngine API failure

**Files:**
- Modify: `src/metersphere/navigatorTreeProvider.ts`
- Modify: `src/metersphere/navigatorEngine.ts` (optional — add error callback)
- Test: `npm test`

- [ ] **Step 1: Update NavigatorTreeDataProvider to handle API failures**

Read `src/metersphere/navigatorTreeProvider.ts`. Update `getChildren()` to catch errors from `discoverProjects` and `discoverModules`:

```typescript
async getChildren(element?: NavigatorNode): Promise<NavigatorNode[]> {
  if (!element) {
    return this.roots
  }
  if (element.type === NodeType.WORKSPACE && this.fetchFn) {
    try {
      return await NavigatorEngine.discoverProjects(element.id, this.fetchFn)
    } catch {
      this.connectionManager?.update(ConnectionState.Disconnected)
      return []
    }
  }
  if (element.type === NodeType.PROJECT && this.fetchFn) {
    try {
      return await NavigatorEngine.discoverModules(element.id, this.fetchFn)
    } catch {
      this.connectionManager?.update(ConnectionState.Disconnected)
      return []
    }
  }
  return []
}
```

Note: `getChildren` should return `Promise<NavigatorNode[]>` not the sync return type.

- [ ] **Step 2: Verify compile and tests**

Run: `npm run compile && npm test`
Expected: All 22 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/metersphere/navigatorTreeProvider.ts
git commit -m "feat(status): notify ConnectionManager on API failures in getChildren"
```

---

## Task 8: Final verification and .vsix rebuild

**Files:**
- All source files
- Test: `npm test && npm run compile`
- Package: `vsce package`

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All 22 tests pass (some may need updating if they reference old configure flow)

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: No TypeScript errors

- [ ] **Step 3: Update existing tests that may break**

Check if any test for `commandRouter.test.ts` tests the configure flow — if it expects the old save-without-test behavior, update it to test the new validation behavior.

Check if any test for `navigatorEngine.test.ts` uses the old `/workspace/list` endpoint — it should now use `/workspace/list/userworkspace`.

- [ ] **Step 4: Package the .vsix**

Run: `PATH="/tmp/vsce/node_modules/.bin:$PATH" vsce package --allow-missing-repository`
Expected: `metersphere-vscode-extension-0.1.0.vsix` generated successfully

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A && git commit -m "feat(status): complete connection status and test connection implementation"
```

---

## Verification Checklist

After all tasks complete, verify in VSCode:

- [ ] Extension loads without errors
- [ ] Status bar shows "MeterSphere: Not configured" initially (when not configured)
- [ ] `MeterSphere: Configure` → enter credentials → test runs → if valid, saves + shows hostname; if invalid, shows error
- [ ] `MeterSphere: Test Connection` shows connected/disconnected result
- [ ] Status bar click shows quick-pick: Test Connection, Configure..., Refresh Navigator, Open Navigator
- [ ] `MeterSphere: Open Navigator` → expand workspace → see projects loaded
- [ ] All 22 tests pass
- [ ] .vsix packages successfully
