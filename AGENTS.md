I'm using the writing-plans skill to create the implementation plan.

Overview
- This repository hosts a VSCode extension scaffold for MeterSphere (v2.x baseline) and planning artifacts for Phase 1 through Phase 3.
- Agents who touch this codebase should follow the guidance in this document to ensure consistent builds, tests, and code quality.

1) Build, lint, and test commands
- Build (TypeScript):
  - npm install
  - npm run compile
- Watch for changes (dev):
  - npm run watch
- Lint (if configured):
  - npx eslint "src/**/*.{ts,tsx}"
- Type-check only (no emit):
  - npx tsc -p tsconfig.json --noEmit
- Run all tests (example, if a test framework is added):
  - npm test
- Run a single test (example with Jest, when Jest is added):
  - npx jest src/metersphere/tokenManager.test.ts -t "token" --runInBand
- If no test framework is wired yet, use TypeScript type checks as a lightweight check:
  - npm run compile

Notes:
- Tests are optional in early plan phases but recommended; when adding tests, prefer a single spec per unit feature.
- The design favors on-demand tests via targeted commands to enable fast feedback loops.

2) Code style guidelines
- Language: TypeScript with strict mode enabled; no implicit any.
- Imports:
  - Use absolute imports for internal modules: import { TokenManager } from './metersphere/tokenManager'
  - Group imports: stdlib, third-party, local.
  - No unused imports; remove dead code paths.
- Formatting:
  - 2 spaces per indentation; semicolons optional if project ESLint config allows; be consistent with existing codebase.
  - Use Prettier formatting if configured; otherwise align with existing TS style in this repo.
- Types and interfaces:
  - Prefer explicit interfaces for public shapes: interface ApiRequest { ... }
  - Prefer type aliases for simple unions and discriminated unions where appropriate.
- Naming conventions:
  - Variables and functions: camelCase
  - Types and classes: PascalCase
  - Constants: UPPER_SNAKE_CASE
- Error handling:
  - Do not swallow errors; throw meaningful, typed errors
  - Centralize HTTP errors in a shared error type when possible
- API design:
  - Favor small, focused modules with single responsibilities
  - Expose stable interfaces between modules; avoid leaking implementation details
- Testing philosophy (TDD):
  - Write a failing test first, then implement minimal code to satisfy it, then expand tests as features grow
- Documentation:
  - JSDoc/TSDoc on public APIs; explain non-obvious decisions
- Security:
  - Do not log tokens; ensure token is only used in Authorization headers and not leaked in UI logs
- Accessibility and UX:
  - Ensure UI strings are i18n-friendly and simple to translate when needed

3) Cursor rules and Copilot rules
- Cursor rules: Not present in this repository yet. If you add Cursor rules, include them under a dedicated .cursor or .cursorrules directory and reference them here.
- Copilot rules: Not present in this repository yet. If you add a Copilot policy (e.g., .github/copilot-instructions.md), document it here and ensure agents follow it.

4) File structure and task decomposition strategy
- The repo is organized around a TypeScript-based extension scaffold (src/), with design/plans/docs under docs/ and AGENTS.md as a living policy.
- When adding features, decompose into small, self-contained tasks:
  - Task: Add a new engine module (EnvironmentEngine) and its tests
  - Task: Wire engine into the WebView flow
  - Task: Add unit tests and integration tests for this module

5) Commit and PR hygiene
- Use conventional commits: feat:, fix:, refactor:, docs:, test:
- Each task should result in a focused commit with a descriptive message
- PRs should include a short Summary of changes and any breaking changes or migration guidance

6) Local development notes
- This plan assumes a dedicated worktree for Phase 3 work (as per brainstorming guidance).
- Ensure you run npm install in the worktree before building
- Use TypeScript compile checks to verify types during development

7) Execution handoff
- After design and planning, you can choose either
  - 1) Subagent-Driven (recommended): spawn a new agent per task with review steps
  - 2) Inline Execution: run tasks in a single session with checkpoints

8) Contact points
- 9) Branching and PR workflow
- Create a feature branch for Phase 3 work; follow conventional commits; PRs include a design reference and migration notes.
- Ensure tests pass and document releases.
