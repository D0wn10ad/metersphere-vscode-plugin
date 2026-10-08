/**
 * Tests for the contextPath helper.
 *
 * Both upload branches (Postman url.path segments and OpenAPI paths keys) share one
 * implementation: prependContextPath for a single path, applyContextPathToPaths for a
 * paths-key map. Empty/undefined contextPath leaves every path untouched; an
 * already-prefixed path is never double-prefixed; servers[].url is never touched.
 */

import { prependContextPath, applyContextPathToPaths } from '../src/metersphere/contextPath';

describe('contextPath', () => {
  describe('prependContextPath', () => {
    it('prefixes a leading-slash path (OpenAPI paths-key shape)', () => {
      expect(prependContextPath('/cart', '/api')).toBe('/api/cart');
      expect(prependContextPath('/cart/configuration/{id}', '/api')).toBe('/api/cart/configuration/{id}');
    });

    it('prefixes a joined segment path (Postman url.path shape)', () => {
      expect(prependContextPath('/cart/configuration', '/api')).toBe('/api/cart/configuration');
    });

    it('leaves paths untouched when contextPath is empty or undefined', () => {
      expect(prependContextPath('/cart', '')).toBe('/cart');
      expect(prependContextPath('/cart', undefined)).toBe('/cart');
    });

    it('never double-prefixes an already-prefixed path', () => {
      expect(prependContextPath('/api/cart', '/api')).toBe('/api/cart');
      expect(prependContextPath('/api/cart/configuration', '/api')).toBe('/api/cart/configuration');
    });

    it('does not false-positive on paths that merely share a prefix', () => {
      expect(prependContextPath('/api-docs', '/api')).toBe('/api/api-docs');
    });

    it('treats a bare "/" contextPath as empty', () => {
      expect(prependContextPath('/cart', '/')).toBe('/cart');
    });
  });

  describe('applyContextPathToPaths', () => {
    it('prefixes every OpenAPI paths key', () => {
      const paths = { '/cart': { get: {} }, '/cart/configuration': { post: {} } };
      const out = applyContextPathToPaths(paths, '/api');
      expect(Object.keys(out)).toEqual(['/api/cart', '/api/cart/configuration']);
      expect(out['/api/cart']).toEqual({ get: {} });
    });

    it('leaves every key untouched when contextPath is empty or undefined', () => {
      const paths = { '/cart': { get: {} } };
      expect(applyContextPathToPaths(paths, '')).toEqual({ '/cart': { get: {} } });
      expect(applyContextPathToPaths(paths, undefined)).toEqual({ '/cart': { get: {} } });
    });

    it('does not mutate the input map', () => {
      const paths = { '/cart': { get: {} } };
      applyContextPathToPaths(paths, '/api');
      expect(Object.keys(paths)).toEqual(['/cart']);
    });
  });
});
