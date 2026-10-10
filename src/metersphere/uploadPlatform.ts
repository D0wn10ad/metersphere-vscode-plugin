/**
 * Upload platform derivation.
 *
 * The platform is derived from the content actually being sent — NEVER from the
 * server version (the defect being fixed: a v3 user uploading Postman bytes got
 * them labelled 'Swagger3'). MeterSphere v2.x servers register NO 'Swagger3'
 * parser (ApiDefinitionImportParserFactory returns null -> NPE -> HTTP 500);
 * their Swagger2Parser auto-detects OpenAPI 3.0 documents and delegates to an
 * internal Swagger3Parser, so OpenAPI content is labelled 'Swagger2'.
 */

export type UploadFormat = 'postman' | 'swagger3';

/** Postman content → 'Postman'; OpenAPI 3.0.3 content → 'Swagger2'. */
export function resolveUploadPlatform(format: UploadFormat): 'Postman' | 'Swagger2' {
  return format === 'swagger3' ? 'Swagger2' : 'Postman';
}
