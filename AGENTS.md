# AGENTS.md - MeterSphere VSCode Extension

This AGENTS.md provides coding conventions and collaboration guidelines for the MeterSphere VSCode plugin repository. It is intended for agentic coding tasks and onboarding new contributors. It documents build/test commands, code style guidelines, and repository rules (cursor rules, Copilot instructions) if present.

1) Scope and intent
- A TypeScript-based VSCode extension that exports Java REST controllers to MeterSphere.
- Code lives under src/, with packaging via npm and vsce. Tests under test/ if present.
- This document is meant for agentic work where automation and multi-step tasks are common.

2) Build, test, and run commands
- Install dependencies: npm ci
- Compile: npm run compile
- Watch: npm run watch
- Test: npm test
- Package: npm run package
- Clean: add a script for cleaning the dist/output if needed (e.g., rm -rf out/ dist/).

3) Running a single test
- The repository uses the VSCode extension test harness. To run a single test, you can:
  - Create a small wrapper test file under test/ that imports the specific test and invokes it, then run npm test. Example: create test/single/myTest.ts that runs only TestName.
  - Alternatively, create a separate npm script that compiles and runs a focused test file via node ./out/test/runTest.js with a path filter (if the harness supports it).
- If the existing test runner supports a --grep option, use that to filter by test name. If not, prefer creating a tiny dedicated wrapper that executes just one test file.

4) Code style guidelines
- Imports
  - External libraries first, then local modules.
  - Use absolute import paths when possible; avoid deep relative paths.
  - Group imports with a blank line between groups and sort alphabetically within groups when helpful.
- Formatting
  - 2-space indentation; semicolons preferred; trailing newline at EOF.
  - Prefer single quotes for strings unless template literals are needed.
  - Enable consistent line endings (LF).
- Types and interfaces
  - Strict mode; avoid any; prefer unknown where uncertain.
  - Explicit return types for exported functions and methods.
  - Use interface/type separation; prefer small, composable types.
- Naming conventions
  - Functions/variables: camelCase
  - Classes/Types: PascalCase
  - Constants: UPPER_SNAKE_CASE
- Error handling
  - Do not swallow errors; provide meaningful messages or rethrow.
  - Add domain-specific error types where appropriate.
- Testing
  - Tests should be deterministic and isolated; avoid relying on external systems in unit tests.
  - Use mocks/stubs for IO and network calls.
  - Name tests clearly to describe behavior.
- API design and constants
  - Centralize API endpoints in a constants module; avoid duplicating strings.
- Documentation and comments
  - JSDoc/TSDoc for public APIs; keep comments concise and purposeful.
- Dependency management
  - Regularly audit dependencies; avoid unnecessary bloat.
- Accessibility and internationalization
  - If UI text exists, consider localization hooks.
- Versioning and releases
  - Use conventional commits; prefix with feat, fix, docs, chore, test, revert.

5) Cursor rules and Copilot rules
- Cursor rules (if present) should be honored. Place them under .cursor/rules or .cursorrules and reference in AGENTS.md.
- Copilot instructions (if present) in .github/copilot-instructions.md should be followed verbatim when writing code.
- If such files exist, keep this document synchronized with their guidance.

6) Project structure expectations
- metersphere-vscode-plugin/src
  - extension.ts: entry point
  - commands/: command implementations (configure, connect, export)
  - services/: configuration, authentication, API client, parser, exporter
  - ui/: status bar and UI related components
  - types/: public interfaces and UUID declarations
  - utils/: logger and helpers
- metersphere-vscode-plugin/test/: tests (if present)
- meterSphere server side or integration components live outside this repo; tests may mock those interactions.

7) Contribution and review workflow
- Use atomic commits; describe why in commit messages (What and Why).
- Prefer Test-Driven Development: write tests before implementing features.
- Run full test suite and TypeScript compile locally before requesting reviews.
- Use feature branches; keep PRs focused on a single feature/bugfix.
- Code reviews: expect discussions on edge cases, naming, and test coverage.

8) Validation and verification steps
- npm ci
- npm run compile
- npm test
- If lint is configured, npm run lint
- For packaging: npm run package; verify the generated .vsix if applicable.

9) Documentation of changes
- Update this AGENTS.md whenever repository conventions evolve or new rules are introduced.
- If you encounter Cursor or Copilot rules, reflect them here with clear references.

10) Quick-start example for agents
- Clone repo, install, build, test, and package as a practical workflow.
- Example commands:
  - npm ci
  - npm run compile
  - npm test
  - npm run package

End of AGENTS.md

11) Local development environment specifics
- Node.js: v18+ recommended; npm v9+ as package manager.
- TypeScript: TS 5.x compatible with the repo's tsconfig.json.
- Tools: npm ci, npm run compile, npm test, npm run package.
- VSCode: recommended for extension debugging; ensure VSCode is updated to a recent stable release.

12) Debugging the extension
- Open the project in VSCode and start the Extension Development Host via F5.
- Use the Command Palette to run: MeterSphere: Configure, MeterSphere: Connect, MeterSphere: Export.
- Inspect console output in the Extension Host devtools for runtime errors.

13) Running tests locally
- npm ci to install dependencies.
- npm test to run the full test suite.
- To focus on a single test when Mocha test files exist, create a small wrapper or use grep when supported by the test runner.
- If using a custom test script, ensure it targets only the intended suite to keep tests fast.

14) Code quality and verification workflow
- After making changes, run: npm run compile and npm test.
- If ESLint/TSLint exists, run lint as part of your verification loop.
- Ensure type safety: avoid any casts; prefer explicit types and interfaces.
- Validate API interactions with mocks in tests to avoid network calls in unit tests.

15) Commit hygiene and PR process
- Use atomic commits with descriptive messages that explain why, not just what.
- Example: feat(export): export Java files to MeterSphere with updated parser integration.
- Run tests locally before pushing; include test coverage notes in PR description.
- Follow project PR conventions if they exist (link to contributing guide if present).

16) Cursor and Copilot rules (if present)
- Cursor rules under .cursor/rules or .cursorrules should be respected and documented here.
- Copilot instructions under .github/copilot-instructions.md should be followed verbatim when present.

17) Release and versioning guidance
- Bump version in package.json with conventional commits.
- Update CHANGELOG.md if present; provide a short summary of changes and impact.
- When publishing, follow vsce packaging steps and verify the .vsix integrity.

18) How to extend AGENTS.md
- If you introduce new conventions or rules, append a clearly labeled section with rationale and examples.
- Keep the document readable and target ~150 lines for ease of maintenance.

19) Quick reference mapping
- Build: npm run compile
- Test: npm test
- Package: npm run package
- Lint: (if configured) npm run lint
- Start debug: open in VSCode and press F5
