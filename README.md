# MeterSphere VSCode Extension

A VSCode extension for MeterSphere that allows you to export Java REST controllers as API definitions directly from VSCode.

## Features

- **API Export**: Export Java REST controllers to MeterSphere as API definitions
- **Connection Management**: Test connection and select workspace/project/module via QuickPick
- **Status Bar**: Visual connection status indicator
- **Context Menu**: Right-click on Java files to export

## Requirements

- VSCode 1.74+
- Node.js 18+
- A running MeterSphere server (optional, for testing export)

## Installation

### From VSIX
```bash
code --install-extension metersphere-vscode-1.0.0.vsix
```

### From Source
```bash
npm install
npm run compile
# Press F5 to debug
```

## Usage

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `MeterSphere: Configure` to set:
   - URL (e.g., `http://localhost:8080`)
   - Access Key
   - Secret Key

3. Run `MeterSphere: Connect` to select:
   - Workspace
   - Project
   - Module

4. Right-click any `.java` file and select `Export to MeterSphere`

## Supported Annotations

- `@Controller`, `@RestController`
- `@RequestMapping`, `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping`
- `@PathVariable`, `@RequestBody`, `@RequestParam`

## Commands

| Command | Description |
|---------|-------------|
| `metersphere.configure` | Open settings configuration |
| `metersphere.connect` | Test connection & select workspace/project/module |
| `metersphere.export` | Export selected Java files to MeterSphere |

## License

GPL-3.0 - see LICENSE file for details.
