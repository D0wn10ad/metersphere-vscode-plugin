# AGENTS.md - MeterSphere VSCode Extension

## Project Overview

This is a VSCode extension for MeterSphere (open-source API testing platform). The extension provides integration with MeterSphere for exporting Java REST controllers as API definitions directly from VSCode.

## Features

- **API Export**: Export Java REST controllers to MeterSphere as API definitions
- **Connection Management**: Test connection and select workspace/project/module via QuickPick
- **Status Bar**: Visual connection status indicator
- **Context Menu**: Right-click on Java files to export

## Quick Start

### Prerequisites

- Node.js v18+ 
- VSCode v1.74+
- A running MeterSphere server (optional, for testing export)

### Installation & Setup

```bash
# Install dependencies
npm install

# Compile TypeScript to JavaScript
npm run compile
```

### Loading into VSCode for Testing

**Option 1: Debug Mode (Recommended)**

1. Open the project in VSCode:
   ```bash
   code metersphere-vscode/
   ```

2. Press **F5** or go to **Debug → Start Debugging**

3. This launches a new VSCode window with the extension loaded

4. In the new window:
   - Open Command Palette (Ctrl+Shift+P)
   - Run "MeterSphere: Configure" to set URL, accessKey, secretKey
   - Run "MeterSphere: Connect" to select workspace/project/module
   - Right-click any .java file → "Export to MeterSphere"

**Option 2: Package and Install**

```bash
# Create .vsix package
npm run package

# Install the .vsix file
# In VSCode: Extensions → ⋯ → Install from VSIX
```

## Development Commands

### Compilation
```bash
npm run compile      # Compile TypeScript to JavaScript
npm run watch        # Watch mode - auto-recompile on changes
```

### Testing
```bash
npm test             # Run all tests
```

### Package & Publish
```bash
npm run package      # Create .vsix package
```

## Configuration

The extension adds the following settings to VSCode:

| Setting | Description | Default |
|---------|-------------|---------|
| metersphere.url | MeterSphere server URL | http://localhost:8080 |
| metersphere.accessKey | API Access Key | "" |
| metersphere.secretKey | API Secret Key | "" |
| metersphere.contextPath | API context path | /api |
| metersphere.exportMode | Export mode | incrementalMerge |
| metersphere.useJavadoc | Use Javadoc as API names | true |
| metersphere.nestingDepth | Nested object parsing depth | 3 |

## Commands

| Command | Description |
|---------|-------------|
| metersphere.configure | Open settings configuration |
| metersphere.connect | Test connection & select workspace/project/module |
| metersphere.export | Export selected Java files to MeterSphere |

## Supported Annotations

The Java parser supports these Spring annotations:

- @Controller, @RestController
- @RequestMapping, @GetMapping, @PostMapping, @PutMapping, @DeleteMapping, @PatchMapping
- @PathVariable, @RequestBody, @RequestParam

## File Structure

```
metersphere-vscode/
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript config
├── .vscode/
│   └── launch.json          # Debug configuration
├── src/
│   ├── extension.ts         # Entry point (activate/deactivate)
│   ├── commands/
│   │   ├── configure.ts     # Configure command
│   │   ├── connect.ts       # Connect with QuickPick
│   │   └── export.ts        # Export Java files
│   ├── services/
│   │   ├── config.ts        # Configuration management
│   │   ├── auth.ts          # AKSK signature generation
│   │   ├── api.ts           # MeterSphere API client
│   │   ├── javaParser.ts    # Java REST parser
│   │   └── exporter.ts      # Postman collection generator
│   ├── ui/
│   │   └── statusBar.ts     # Status bar indicator
│   ├── types/
│   │   ├── index.ts         # TypeScript interfaces
│   │   └── uuid.d.ts        # UUID type declaration
│   └── utils/
│       └── logger.ts        # Logger utility
└── node_modules/
```

## Common Issues & Solutions

### Extension Doesn't Activate
- Check package.json activation events
- Verify extension is installed (not just opened as folder)
- Check Developer Tools console for errors

### Export Fails
- Verify MeterSphere server is running
- Check API URL in settings
- Ensure accessKey and secretKey are correct
- Run "MeterSphere: Connect" first to select project/module

## Architecture

```
VSCode Extension
├── Commands: configure, connect, export
├── UI: Status bar, QuickPick selectors
└── Services: Config, Auth, API, JavaParser, Exporter
        │
        ▼
MeterSphere Server
- API Definition Import: POST /api/definition/import
- Project/Module selection via REST APIs
```

## References

- [VSCode Extension API](https://code.visualstudio.com/api)
- [MeterSphere IDEA Plugin](https://github.com/metersphere/metersphere-idea-plugin)
- [Postman Collection Format](https://schema.getpostman.com/)
