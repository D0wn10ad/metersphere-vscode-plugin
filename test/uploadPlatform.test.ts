/**
 * Tests for the upload platform derivation.
 *
 * The platform is derived from the content actually being sent — NEVER from the
 * server version (the defect: a v3 user uploading Postman bytes got them labelled
 * 'Swagger3'). MeterSphere v2.x servers register NO 'Swagger3' parser: their
 * Swagger2Parser auto-detects OpenAPI 3.0 documents and delegates internally, so
 * OpenAPI content MUST be labelled 'Swagger2' (server-side NPE otherwise).
 */

import { resolveUploadPlatform } from '../src/metersphere/uploadPlatform';

describe('uploadPlatform', () => {
  it('maps postman content to Postman', () => {
    expect(resolveUploadPlatform('postman')).toBe('Postman');
  });

  it('maps OpenAPI 3 content to Swagger2 (the only parser name v2.x servers register)', () => {
    expect(resolveUploadPlatform('swagger3')).toBe('Swagger2');
  });

  it('never emits a platform the v2.x parser factory cannot resolve', () => {
    const KNOWN_SERVER_PLATFORMS = ['Metersphere', 'Postman', 'Swagger2', 'Har', 'Jmeter'];
    for (const format of ['postman', 'swagger3'] as const) {
      expect(KNOWN_SERVER_PLATFORMS).toContain(resolveUploadPlatform(format));
    }
  });

  it('QA: an unknown legacy format value falls back to Postman, never a server-rejected platform', () => {
    expect(resolveUploadPlatform('unknown-legacy' as never)).toBe('Postman');
  });
});
