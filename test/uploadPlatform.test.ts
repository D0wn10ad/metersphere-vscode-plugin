/**
 * Tests for the upload platform derivation.
 *
 * The platform is derived from the content actually being sent — NEVER from the
 * server version (the defect: a v3 user uploading Postman bytes got them labelled
 * 'Swagger3'). We never produce genuine Swagger 2.0 bytes, so 'Swagger2' is
 * unreachable from any code path.
 */

import { resolveUploadPlatform } from '../src/metersphere/uploadPlatform';

describe('uploadPlatform', () => {
  it('maps postman content to Postman', () => {
    expect(resolveUploadPlatform('postman')).toBe('Postman');
  });

  it('maps swagger3 content to Swagger3', () => {
    expect(resolveUploadPlatform('swagger3')).toBe('Swagger3');
  });

  it('QA: an unknown legacy format value falls back to Postman, never a server-rejected platform', () => {
    expect(resolveUploadPlatform('unknown-legacy' as never)).toBe('Postman');
  });
});
