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
import { SettingsManager } from '../src/metersphere/settingsManager';

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
