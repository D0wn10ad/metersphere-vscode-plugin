/**
 * Upload platform derivation.
 *
 * The platform is derived from the content actually being sent — NEVER from the
 * server version (the defect being fixed: a v3 user uploading Postman bytes got
 * them labelled 'Swagger3'). We never produce genuine Swagger 2.0 bytes, so the
 * legacy Swagger 2 platform label is unreachable from any code path.
 */

export type UploadFormat = 'postman' | 'swagger3';

/** Postman content → 'Postman'; OpenAPI 3.0.3 content → 'Swagger3'. */
export function resolveUploadPlatform(format: UploadFormat): 'Postman' | 'Swagger3' {
  return format === 'swagger3' ? 'Swagger3' : 'Postman';
}
