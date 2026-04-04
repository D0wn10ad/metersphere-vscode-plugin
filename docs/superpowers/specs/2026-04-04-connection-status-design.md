# Connection Status + Test Connection Design

**Date**: 2026-04-04
**Status**: Draft
**Author**: Agent

## Overview

Add two features to the MeterSphere VSCode plugin:

1. **Test Connection command** — validates AccessKey/SecretKey credentials before saving, and on-demand
2. **Status bar** — shows real-time connection state in VSCode's status bar

## Background

The current implementation has no validation of credentials. The configure flow saves AK/SK blindly, and the Navigator just fails silently if credentials are wrong. The IntelliJ v2 plugin validates credentials via `GET /currentUser` before saving.

## User Experience

### Configure Flow (inline validation)

```
1. User runs "MeterSphere: Configure"
2. Prompt: Server URL → Access Key → Secret Key (3 steps, unchanged UI)
3. Status bar shows "MeterSphere: Connecting..."
4. Test connection with entered credentials
   - FAIL: showErrorMessage("Connection failed: <reason>"), return (don't save)
   - PASS: save all 3 values to VSCode Settings
5. Status bar updates to Connected
6. Navigator refreshes with workspaces
```

### Test Connection Command

```
1. User runs "MeterSphere: Test Connection"
2. ShowInformationMessage("Testing connection...")
3. Call testConnection()
   - FAIL: showErrorMessage("Connection failed: <reason>"), status bar → Disconnected
   - PASS: showInformationMessage("Connected to <hostname>"), status bar → Connected
4. Status bar updates regardless of result
```

### Status Bar

**Location**: VSCode status bar (bottom of window)
**Click action**: Opens quick-pick menu

| State | Icon | Text |
|-------|------|------|
| `Unconfigured` | `$(circle-slash)` | `MeterSphere: Not configured` |
| `Connecting` | `$(sync~spin)` | `MeterSphere: Connecting...` |
| `Connected` | `$(check)` | `<hostname>` (e.g. `ms.example.com`) |
| `Disconnected` | `$(error)` | `MeterSphere: Connection failed` |

**Quick-pick menu on click**:
```
MeterSphere
  ├─ Test Connection
  ├─ Configure...
  ├─ Refresh Navigator
  └─ Open Navigator
```

### Status Bar Update Triggers

- Extension activation → test connection if configured
- `metersphere.configure` (pass) → Connected
- `metersphere.configure` (fail) → Unconfigured
- `metersphere.testConnection` (pass) → Connected
- `metersphere.testConnection` (fail) → Disconnected with error message
- Any NavigatorEngine API failure → Disconnected

## Architecture

### New Module: `ConnectionManager`

Single source of truth for connection state and status bar.

```typescript
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

  constructor(context: vscode.ExtensionContext)
  update(state: ConnectionState, message?: string): void
  testConnection(url?: string, accessKey?: string, secretKey?: string): Promise<{
    success: boolean
    url?: string
    error?: string
  }>
  getState(): ConnectionState
  dispose(): void
}
```

`testConnection()` accepts optional overrides for URL, AK, SK — used during configure flow before saving to Settings.

### Validation Endpoint

`GET /currentUser` — same endpoint used by IntelliJ v2 plugin. Returns 200 on success, non-200 on failure.

### Dependencies

- `ConnectionManager` depends on `httpClient` (for API calls)
- `extension.ts` creates and owns `ConnectionManager` instance
- `commandRouter.ts` calls `ConnectionManager.testConnection()`
- `vscode.d.ts` needs `StatusBarItem` and `StatusBarAlignment` added
- `vscode-mock-setup.js` needs status bar mock

## File Changes

| File | Change |
|------|--------|
| `src/metersphere/connectionManager.ts` | **New** — ConnectionManager class |
| `src/metersphere/extension.ts` | Instantiate ConnectionManager, wire status bar |
| `src/metersphere/commandRouter.ts` | Add `metersphere.testConnection`, inline validation in configure |
| `src/metersphere/navigatorEngine.ts` | On API failure, notify ConnectionManager |
| `src/vscode.d.ts` | Add `StatusBarItem`, `StatusBarAlignment` types |
| `test/vscode-mock-setup.js` | Add status bar mock |
| `package.json` | Add `metersphere.testConnection` command |
| `docs/superpowers/specs/2026-04-04-connection-status-design.md` | **This file** |

## Future Considerations (Out of Scope)

- User name displayed in status bar (Option C from design discussion) — requires storing user info from `/currentUser` response
- Polling for connection status — not needed; event-based updates are sufficient
- Connection timeout configuration — use sensible default (10s)

## Test Strategy

1. Unit tests for `ConnectionManager.testConnection()` — mock httpRequest, verify URL/headers/calls
2. Unit tests for `ConnectionManager.update()` — verify status bar text/icon per state
3. Unit tests for configure flow validation — verify save only on success
4. Integration: load extension, verify status bar appears, verify click shows quick-pick
