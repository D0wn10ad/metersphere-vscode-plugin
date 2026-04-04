# AGENTS.md — MeterSphere VSCode Plugin

## Overview

This repository hosts a VSCode extension scaffold for MeterSphere (v2.x baseline) and planning artifacts for Phase 1 through Phase 3.

Agents who touch this codebase should follow the guidance in this document to ensure consistent builds, tests, and code quality.

---

## 1) Build, lint, and test commands

### Setup

```bash
npm install
```

**Important:** `ts-jest` must be `^29.0.0` (v28 is incompatible with Jest 29). If you see ERESOLVE peer dependency errors, update `ts-jest` to v29 in `package.json`.

### Build and type-check

```bash
npm run compile      # TypeScript compile (out/ directory)
npm run watch        # Watch mode for development
npx tsc -p tsconfig.json --noEmit   # Type-check only (no emit)
```

### Lint

```bash
npx eslint "src/**/*.{ts,tsx}"   # Run ESLint if configured
```

### Tests (Jest + ts-jest)

```bash
npm test                        # Run all Jest tests
npx jest --verbose              # Run all with verbose output
npx jest test/tokenManager.test.ts --verbose   # Run specific test file
npx jest --no-cache            # Clear cache and re-run
```

**Node-based tests** (standalone `.js` files with `process.exit()`) are excluded from Jest to avoid worker crashes. Run them directly:

```bash
node test/httpClient.test.js        # Legacy node-only tests
```

### VSCode mock

Tests run without the VSCode runtime using a mock stack:
- `src/vscode.d.ts` — TypeScript type declarations for the VSCode API
- `node_modules/vscode/index.js` — CommonJS mock with in-memory settings storage
- `test/vscode-mock-setup.js` — Jest setup that mocks the `vscode` module globally

Do not modify these mock files without a corresponding update to tests.

---

## 2) Code style guidelines

- **Language:** TypeScript with strict mode enabled; no implicit `any`.
- **Imports:**
  - Use absolute imports for internal modules: `import { TokenManager } from './metersphere/tokenManager'`
  - Group imports: stdlib, third-party, local.
  - No unused imports; remove dead code paths.
- **Formatting:**
  - 2 spaces per indentation; semicolons optional if project ESLint config allows; be consistent with existing codebase.
  - Use Prettier formatting if configured; otherwise align with existing TS style in this repo.
- **Types and interfaces:**
  - Prefer explicit interfaces for public shapes: `interface ApiRequest { ... }`
  - Prefer type aliases for simple unions and discriminated unions where appropriate.
- **Naming conventions:**
  - Variables and functions: `camelCase`
  - Types and classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
- **Error handling:**
  - Do not swallow errors; throw meaningful, typed errors.
  - Centralize HTTP errors in a shared error type when possible.
- **API design:**
  - Favor small, focused modules with single responsibilities.
  - Expose stable interfaces between modules; avoid leaking implementation details.
- **Testing philosophy (TDD):**
  - Write a failing test first (RED), then implement minimal code to satisfy it (GREEN), then refactor (REFACTOR).
  - Tests live in `test/` alongside their subject module. One test file per unit feature.
  - TS tests (`.test.ts`) run via Jest + ts-jest. CommonJS tests (`.js`) run directly with Node.
- **Documentation:**
  - JSDoc/TSDoc on public APIs; explain non-obvious decisions.
- **Security:**
  - Do not log tokens; ensure token is only used in Authorization headers and not leaked in UI logs.
- **Accessibility and UX:**
  - Ensure UI strings are i18n-friendly and simple to translate when needed.

---

## 3) Cursor rules and Copilot rules

- Cursor rules: Not present in this repository yet. If you add Cursor rules, include them under a dedicated `.cursor` or `.cursorrules` directory and reference them here.
- Copilot rules: Not present in this repository yet. If you add a Copilot policy (e.g., `.github/copilot-instructions.md`), document it here and ensure agents follow it.

---

## 4) File structure and task decomposition strategy

```
src/
  extension.ts               # Top-level extension entry point
  vscode.d.ts                # VSCode API type declarations (mock-friendly)
  metersphere/
    extension.ts             # Inner extension bootstrap
    tokenManager.ts          # Token persistence via VSCode settings
    tokenManager.js          # CommonJS token manager (for Node tests)
    settingsManager.ts       # Workspace/project ID persistence
    httpClient.ts            # HTTP client with token injection
    httpClient.js            # CommonJS HTTP client (for Node tests)
    webviewController.ts     # WebView-based API debugger
    authHeader.js            # Simple auth header helper
    retry.js                 # Retry utility
    math.js                  # Utility module
test/
  tokenManager.test.ts       # TokenManager Jest tests
  httpClient.test.ts         # HttpClient Jest tests
  vscode-mock-setup.js       # Global vscode mock for Jest
node_modules/vscode/index.js # VSCode API CommonJS mock
docs/superpowers/
  specs/                     # Design specifications per phase
  plans/                     # Implementation plans per phase
```

When adding features, decompose into small, self-contained tasks. Each task should produce a self-contained, testable change.

---

## 5) Commit and PR hygiene

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Each task should result in a focused commit with a descriptive message.
- All work is committed directly to `main` (no PRs required for this project).
- Keep the working tree clean before committing.

---

## 6) Local development notes

- Ensure `npm install` runs successfully before building.
- Use TypeScript compile checks (`npx tsc -p tsconfig.json --noEmit`) to verify types during development.
- Run `npm test` to confirm all Jest tests pass before committing.
- If TypeScript errors appear related to `vscode` module, verify `src/vscode.d.ts` and `node_modules/vscode/index.js` exist.

---

## 7) Execution handoff

After design and planning, choose one:

- **1) Subagent-Driven (recommended):** Spawn a fresh subagent per task with review steps between tasks.
- **2) Inline Execution:** Execute tasks in a single session with checkpoints.

---

## 8) Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 MVP1 | ✅ Complete | TokenManager, HttpClient, SettingsManager, WebView scaffold, Jest wired |
| Phase 2 | 🔴 Not started | Navigator, TreeView, on-demand sync |
| Phase 3A | 🔴 Not started | Environment, History |
| Phase 3B | 🔴 Not started | Mocks, Test Data |
| Phase 3C | 🔴 Not started | Telemetry, Security |

**SecretStorage** is explicitly out of scope for Phases 1–3. Per-workspace persistence is the default stance.
