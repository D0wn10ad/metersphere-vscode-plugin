/**
 * Tests for SettingsManager export-format and server-version handling.
 *
 * getExportFormat defaults to 'swagger3' (the fallback decides — the jest mock
 * returns undefined for an unset key), maps the legacy stored 'swagger2' to
 * 'swagger3' (it always produced OpenAPI 3.0.3 anyway), and preserves a stored
 * 'postman' choice (no forced migration). getServerVersion reads the configured
 * value, defaulting to 'v3'.
 */

import * as vscode from 'vscode';
import { SettingsManager, toAes128Bytes } from '../src/metersphere/settingsManager';

function setSetting(key: string, value: string | undefined): void {
  vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
}

describe('settingsManager', () => {
  afterEach(() => {
    setSetting(SettingsManager.EXPORT_FORMAT_KEY, undefined);
    setSetting(SettingsManager.SERVER_VERSION_KEY, undefined);
  });

  it('returns swagger3 by default (the fallback decides)', () => {
    expect(SettingsManager.getExportFormat()).toBe('swagger3');
  });

  it('maps the legacy stored swagger2 to swagger3', () => {
    setSetting(SettingsManager.EXPORT_FORMAT_KEY, 'swagger2');
    expect(SettingsManager.getExportFormat()).toBe('swagger3');
  });

  it('preserves a stored postman choice (no forced migration)', () => {
    setSetting(SettingsManager.EXPORT_FORMAT_KEY, 'postman');
    expect(SettingsManager.getExportFormat()).toBe('postman');
  });

  it('returns v3 by default for serverVersion', () => {
    expect(SettingsManager.getServerVersion()).toBe('v3');
  });

  it('returns the configured serverVersion (v2)', () => {
    setSetting(SettingsManager.SERVER_VERSION_KEY, 'v2');
    expect(SettingsManager.getServerVersion()).toBe('v2');
  });
});

describe('settingsManager.generateSignature (AES-128 key/IV derivation)', () => {
  it('derives raw UTF-8 bytes for a 16-char credential (live-server compat rule)', () => {
    const derived = toAes128Bytes('0123456789abcdef');
    expect(derived.length).toBe(16);
    expect(derived.equals(Buffer.from('0123456789abcdef', 'utf8'))).toBe(true);
  });

  it('zero-pads a short credential to 16 bytes', () => {
    const derived = toAes128Bytes('short');
    expect(derived.length).toBe(16);
    expect(derived.equals(Buffer.concat([Buffer.from('short', 'utf8'), Buffer.alloc(11)]))).toBe(true);
  });

  it('truncates a long credential to the first 16 bytes', () => {
    const credential = 'a'.repeat(40);
    const derived = toAes128Bytes(credential);
    expect(derived.length).toBe(16);
    expect(derived.equals(Buffer.from(credential, 'utf8').subarray(0, 16))).toBe(true);
  });

  it('succeeds with 16-char ak/sk (baseline live-compatible path)', () => {
    const sig = SettingsManager.generateSignature('0123456789abcdef', 'fedcba9876543210');
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('does not throw with 8-char ak/sk (returns a string)', () => {
    expect(() => SettingsManager.generateSignature('shortak1', 'shortsk1')).not.toThrow();
    const sig = SettingsManager.generateSignature('shortak1', 'shortsk1');
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('does not throw with a 40-char sk (returns a string)', () => {
    const longSk = 's'.repeat(40);
    expect(() => SettingsManager.generateSignature('0123456789abcdef', longSk)).not.toThrow();
    const sig = SettingsManager.generateSignature('0123456789abcdef', longSk);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });

  it('returns empty string for empty/undefined credentials (unchanged)', () => {
    expect(SettingsManager.generateSignature('', '')).toBe('');
    expect(SettingsManager.generateSignature(undefined, undefined)).toBe('');
    expect(SettingsManager.generateSignature('0123456789abcdef', undefined)).toBe('');
  });
});
