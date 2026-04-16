# Phase 4 Enhancement — Editor & File Explorer Context Menu

## Objective
Add right-click context menus in Editor and File Explorer to trigger upload to MeterSphere, matching IDEA v2/v3 plugin behavior.

## Background

Phase 4 completed: Export Name Setting + Navigator Context Menu for Upload

**Missing (not yet implemented):**
- Right-click in Editor → "Upload to MeterSphere" (IDEA: `EditorLangPopupMenu`)
- Right-click in File Explorer → "Upload to MeterSphere" (IDEA: `ProjectViewPopupMenu`)

## Milestones
- M1: Add context menu entries to package.json
- M2: Register command handlers in commandRouter.ts  
- M3: Pre-select files when triggering from context menu

## Tasks

### T1: Add Editor and File Explorer Context Menus
- **File:** `src/package.json`
- Add `editor/context` menu entry
- Add `filesExplorer/context` menu entry
- Both trigger command `metersphere.uploadFromEditor` / `metersphere.uploadFromFileExplorer`

### T2: Register Command Handlers
- **File:** `src/metersphere/commandRouter.ts`
- Add `metersphere.uploadFromEditor` handler
- Add `metersphere.uploadFromFileExplorer` handler
- Both open Sync view with pre-selected file paths

### T3: Pre-select Files in Sync WebView
- **File:** `src/metersphere/views/sidebarView.ts`
- Modify `javaFilesSelected` message to accept pre-selected files
- Auto-populate file list in Sync view

## Menu Mapping (IDEA → VSCode)

| IDEA Menu Group | IDEA Menu ID | VSCode Menu |
|-----------------|--------------|------------|
| Editor Lang Popup Menu | `EditorLangPopupMenu` | `editor/context` |
| Project View Popup Menu | `ProjectViewPopupMenu` | `filesExplorer/context` |

## Implementation Status

| Task | Status |
|------|--------|
| Navigator TreeView context menu | ✅ Implemented (Phase 4) |
| Editor context menu | 🔴 Pending |
| File Explorer context menu | 🔴 Pending |

## Related Files

- `src/package.json` - Menu configuration
- `src/metersphere/commandRouter.ts` - Command registration
- `src/metersphere/views/sidebarView.ts` - Sync webview

## IDEA Reference

From IDEA v2 plugin.xml:
```xml
<group id="MeterSphereEditorLangPopupMenu" text="MeterSphere">
    <add-to-group group-id="EditorLangPopupMenu" anchor="last"/>
</group>
<group id="MeterSphereProjectViewPopupMenu" text="MeterSphere">
    <add-to-group group-id="ProjectViewPopupMenu" anchor="last"/>
</group>
```

From IDEA v3 plugin.xml:
```xml
<action id="MSAction" 
        class="io.metersphere.action.UploadAction"
        text="Upload to MeterSphere">
    <add-to-group group-id="MeterSphereEditorLangPopupMenu" anchor="last"/>
    <add-to-group group-id="MeterSphereProjectViewPopupMenu" anchor="last"/>
</action>
```