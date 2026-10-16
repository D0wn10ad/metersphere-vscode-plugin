# Spec: OpenAPI Export Full-Spec Coverage

Date: 2026-10-15
Status: Implemented (see commit series `feat(java-ast-parser-parity)` — T1–T14 of `.omo/plans/openapi-spec-coverage.md`)

## Problem

The OpenAPI export captured only a fraction of what the CST parser already reads: responses were a
hardcoded `{'200': {description: 'OK'}}`, parameters carried no description/default/validation, DTO
fields lost their bean-validation annotations, enums/records/interfaces were not modeled, auth
annotations were ignored, and DTOs declared outside the uploaded files were never expanded.

## Design

Everything is derived from the Java source via the CST parser (`java-parser` 3.0.1); no new user
settings were added and the upload label stays `Swagger2` (MeterSphere v2.x has no Swagger3 parser —
AGENTS.md §15.1).

### Parser layer (`cstJavaParser.ts` / `cstParamParser.ts` / `javadocIndex.ts` / `projectSymbolIndex.ts`)

- `ParsedApi` gains: `returnType`, `responseStatus` (frozen `HttpStatus` name→code table),
  `responseHeaders` (`@ResponseHeader`), `extraResponses` (`@ApiResponse`), `secured`/`permitAll`
  (`@PreAuthorize`/`@Secured`/`@RolesAllowed`/`@PermitAll`), `securityScheme`/`securityRequirement`
  (springdoc override), `methodName`, `className`.
- `ParsedParameter` gains: `description` (`@ApiParam`/`@Parameter` > javadoc `@param` — new
  `JavadocIndex.paramForAdjacent`), `defaultValue`, `validation` (positional annotation values
  captured: `@Min(1)`, `@Size({1,10})`), `part` (`@RequestPart`), `in: 'cookie'` (`@CookieValue`).
- `projectSymbolIndex` registers enums (`{kind:'enum', values}`), records (components → fields) and
  interfaces (methods + `constantDeclaration` constants → best-effort fields), and reads field-level
  annotations (`validation`, `@Schema` description). java-parser wraps enum/record declarations
  inside a `classDeclaration` node — the dispatch checks `normalClassDeclaration` before falling
  through to the enum/record branches.

### Schema layer (`typeResolver.ts` / `validationSchema.ts` / `openApiBuilder.ts`)

- Balanced-bracket generic parsing (`Map<String,List<User>>` → head `Map`, args `[String, List<User>]`).
- `formatFor` emits ONLY `date-time` (`LocalDateTime`/`Date`) and `uuid` (`UUID`) at the emission
  layer (`primitiveSchemaWithFormat`); integer/number schemas stay bare — pinned exact-equality
  export tests (`test/openApiBuilder.test.ts:140,153-154`, `test/typeResolver.test.ts:27,31,50`)
  depend on it and were not modified.
- `Map<K,V>` → `{type:'object', additionalProperties: <V schema>}`.
- `applyValidation` maps constraints to JSON Schema keywords and never emits a type-invalid keyword
  (non-numeric schema + `@Min`/`@Max` → skipped entirely).
- Responses: success code = `@ResponseStatus` else 200; wrapper types unwrap fully to the payload
  (`Response<Page<T>>` → `T`, no synthetic `Page_T`); `void` → code only; `@ResponseHeader` →
  `headers`; `@ApiResponse` → extra codes.
- Security: any Spring Security annotation → `components.securitySchemes.bearerAuth` (bearer JWT) +
  document `security`; `@PermitAll` → per-op `security: []`; springdoc schemes override.
- Operations: `operationId` (collision-suffixed `_2`, `_3`, …) + `tags: [<ClassName>]`.
- Multipart: any `@RequestPart` part → `multipart/form-data` with per-part schemas
  (`MultipartFile` → `{type:'string', format:'binary'}`); parts win over a mixed-in `@RequestBody`
  (invalid Spring — logged, JSON dropped).

### Upload path (`uploadParsing.ts`)

`parseUploadedFiles(files, readText, isOpenApi)` runs an async DTO pre-pass ONLY for the OpenAPI
format: it clears the symbol-index resolved cache (stale entries from a prior upload cannot leak),
collects referenced type names (generics stripped, primitives skipped, capped at 64), and resolves
each through the LSP symbol provider → bounded disk scan. Best-effort: never throws, one debug line
on partial resolution; unresolvable types export as generic objects.

## Verified live

Imported into MeterSphere v2.10.26-lts (`platform=Swagger2`): 3 definitions + 4 generated cases,
`@ResponseStatus(CREATED)` → statusCode 201 server-side, `Response<Page<TaskDto>>` fully
dereferenced to the payload fields, no NPE. Two server-side normalization quirks recorded as
follow-ups (nested enum `$ref` flattened to object; Map `additionalProperties` → type null) —
neither rejects the import.
