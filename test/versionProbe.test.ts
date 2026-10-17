import { resolveServerVersion } from '../src/metersphere/versionProbe';
import { SettingsManager } from '../src/metersphere/settingsManager';
import * as vscode from 'vscode';

const SERVER_VERSION_KEY = 'metersphere.serverVersion';

function setSetting(value: string | undefined): void {
  vscode.workspace.getConfiguration().update(SERVER_VERSION_KEY, value);
}

function fetchOk(): typeof fetch {
  return (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
}

function fetchStatus(status: number): typeof fetch {
  return (async () => new Response('{}', { status })) as unknown as typeof fetch;
}

function fetchThrows(): typeof fetch {
  return (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
}

describe('resolveServerVersion', () => {
  beforeEach(() => {
    SettingsManager.resetServerVersionCache();
    setSetting(undefined);
  });

  it('configured v3 forces v3 without probing', async () => {
    setSetting('v3');
    const result = await resolveServerVersion('http://x', {}, fetchThrows());
    expect(result.version).toBe('v3');
    expect(result.cached).toBe(false);
  });

  it('configured v2 forces v2 without probing', async () => {
    setSetting('v2');
    const result = await resolveServerVersion('http://x', {}, fetchThrows());
    expect(result.version).toBe('v2');
  });

  it('auto + HTTP 200 probes v3 and caches', async () => {
    const result = await resolveServerVersion('http://x', {}, fetchOk());
    expect(result.version).toBe('v3');
    expect(result.cached).toBe(false);
    expect(SettingsManager.getCachedServerVersion()).toBe('v3');
  });

  it('auto + HTTP 404 probes v2 and caches', async () => {
    const result = await resolveServerVersion('http://x', {}, fetchStatus(404));
    expect(result.version).toBe('v2');
    expect(SettingsManager.getCachedServerVersion()).toBe('v2');
  });

  it('auto + unexpected status falls back to v2 with a warning', async () => {
    const result = await resolveServerVersion('http://x', {}, fetchStatus(500));
    expect(result.version).toBe('v2');
    expect(result.warning).toContain('500');
  });

  it('auto + network failure falls back to v2 with a warning and never throws', async () => {
    const result = await resolveServerVersion('http://x', {}, fetchThrows());
    expect(result.version).toBe('v2');
    expect(result.warning).toContain('network down');
  });

  it('reuses the session cache on a later failed probe', async () => {
    await resolveServerVersion('http://x', {}, fetchOk());
    const second = await resolveServerVersion('http://x', {}, fetchStatus(500));
    expect(second.version).toBe('v3');
    expect(second.cached).toBe(true);
    expect(second.warning).toContain('using v3');
  });
});
