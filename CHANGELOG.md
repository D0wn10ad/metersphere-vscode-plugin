# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2026-10-29

### Fixed

- **Packaging** — `.sisyphus` plan artifacts are now excluded from the VSIX package via `.vscodeignore` (they were accidentally shipped in the v0.3.2 CI build).

## [0.3.2] - 2026-10-28

### Security

- **SSRF hardening** — a new `validateMsUrl` utility blocks requests to private, link-local, loopback, and cloud-metadata IP ranges (10/8, 127/8, 169.254/16, 172.16-31/12, 192.168/16, and IPv6 `::1` / `fc00::/7` / `fe80::/10`) and non-http(s) schemes. URL validation is enforced in the HTTP client, sync engine, and navigator engine; a configurable allowlist can override blocked ranges. `localhost` remains allowed as the documented default server config.
- **TLS warning** — when certificate verification is disabled (`rejectUnauthorized=false`), a strong warning is logged to the Output panel and shown in the Settings UI near the checkbox.

## [0.3.1] - 2026-10-22

### Fixed

- **Regex fallback engine slash normalization** — the regex engine now joins class-level and method-level paths with the same normalization as the CST engine (`joinFullPath`): a trailing-slash base (`@RequestMapping("/api/")`) or a base without a leading slash (`@RequestMapping("api")`) no longer produces malformed paths like `/api//x` or `api/x`. Covered by new dual-engine parity tests.

### Added

- Test coverage: parser dedupe block (composed + plain mapping collisions), dual-engine slash-normalization parity rows, and the `handleUpload` context-path wiring (end-to-end through `handleMessage` with mocked transport).

## [0.3.0] - 2026-10-17

### Added

- **Branch routing (eapi / iapi / both)** — every synced API is routed into an `eapi` or `iapi` branch, expressed in the **URL shape only** (the module stays the one picked in the Sync panel — no module-tree manipulation). Resolution order, first match wins: manual Branch selector → customization rule JSON → Javadoc `@category` (preferred marker) → annotation tags → `metersphere.defaultBranch`.
- **Customization rule JSON** — runtime rules file, location configured by `metersphere.rulesPath` (default `.metersphere/rules.json`, workspace-relative). Schema: `{ "placement": { "enabled": bool, "managedPrefix": "/managed" }, "rules": [ { "matchOn": "methodAndPathPrefix|pathRegex|className|javadocCategory|annotationTag|catchAll", "pattern": "...", "branch": "eapi|iapi|both" } ] }`. First match wins; `catchAll` is evaluated last; malformed files warn and degrade to empty (never throw).
- **Dual upload for `both`** — two documents per API: the iapi copy's paths prefixed with `placement.managedPrefix` (default `/managed`), the eapi copy plain — e.g. `/managed/<service-root-path>/<path>` and `/<service-root-path>/<path>`. The differing URLs satisfy MeterSphere's method+path dedup without URL_REPEATABLE (verified live on v2.10.26-lts).
- **Context path in both export formats** — shared prefixing for swagger2 and postman; the manual Context Path field stays authoritative. Optional auto-detection from `application.yml` / `application.properties` (webflux-first `spring.application.webflux.base-path`, else `server.servlet.context-path`; profile-aware, multi-document, `${ENV_VAR}` placeholders are never silently expanded).
- **Server version probe** — `metersphere.serverVersion` (`auto` | `v2` | `v3`, default `auto`): probes `GET /system/version/current` (200 = v3, 404 = v2); on failure falls back to the cached value or `v2` with a warning, never blocks. **v3 remains experimental/untested** — actual post-import outcomes are reported instead of assumed.
- **Post-import verification** — after upload the plugin lists definitions and reports landed modules, 未规划接口 fallbacks (informational, not errors), and whether dual-upload rows materialized.
- **CST-first parser with deterministic regex fallback** — `javaParserDispatch` runs the java-ast CST engine (vendored `vendor/java-parser.cjs`) and falls back to the regex engine only when CST throws or finds zero APIs in a file that has a controller annotation; every fallback is logged to the Output panel.
- **Dual-engine parser gate** — a shared expectation table runs every parser test row on BOTH engines (`cst` and `regex`), including annotation-order rows proving order-independent `@Operation` / `@ApiOperation` / `@Description` lookup (above or below the mapping annotation, nearest-wins, paren-depth-aware, string-literal/comment masking).

### Changed

- Export format default is now `swagger3` (a legacy `swagger2` setting maps to `swagger3`); MeterSphere v2 servers still receive `platform: "Swagger2"` — the server auto-detects OpenAPI 3.0 documents.
- AES request signature uses padded 16-byte key/IV (`toAes128Bytes`) — fixes "Invalid initialization vector" errors with short access/secret keys.
- Documentation: branch-resolution flow chart embedded in README (Branch Routing section); parser architecture documented (README "Parser" section, AGENTS.md §16).

### Fixed

- Regex parser annotation lookup is order-independent — the IntelliJ layout with `@GetMapping` above `@Operation` now resolves the summary correctly.
- Phantom APIs from `@GetMapping`-like text inside string literals or comments are suppressed; summaries containing parentheses (`@Operation(summary="get user (by id)")`) parse correctly.

## [0.2.0] and earlier

See the [GitHub releases page](https://github.com/D0wn10ad/metersphere-vscode-plugin/releases) for earlier versions.
