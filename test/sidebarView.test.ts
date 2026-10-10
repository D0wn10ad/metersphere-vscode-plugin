/**
 * Tests for the SidebarView degraded-mode notices (the FIRST test for this module).
 *
 * Asserts on the exported HTML builders (getControlPanelHtml / getSyncHtml — both
 * public static) rather than a live webview, under the existing vscode-mock-setup.js
 * mock. The single `javaExtMissing` message is replaced by two distinct notices:
 * javaExtMissingJavadoc (parsing still works) and javaExtMissingSchema (schemas will
 * be stubs) — never shown at once.
 */

import { SidebarView } from '../src/metersphere/views/sidebarView';
import { DebugLogger } from '../src/metersphere/debugLogger';
import { fetchWithTimeout, FetchTimeoutError } from '../src/metersphere/timeoutFetch';

jest.mock('../src/metersphere/timeoutFetch', () => {
  const actual = jest.requireActual('../src/metersphere/timeoutFetch');
  return { ...actual, fetchWithTimeout: jest.fn() };
});

const vscode = require('vscode');

function setSetting(key: string, value: string): void {
  vscode.workspace.getConfiguration().update(key, value);
}

describe('sidebarView', () => {
  describe('degraded-mode notices', () => {
    it('control panel HTML contains both new notice strings', () => {
      const html = SidebarView.getControlPanelHtml();
      expect(html).toContain('Javadoc enrichment is unavailable');
      expect(html).toContain('DTO field expansion is unavailable');
    });

    it('sync HTML contains both new notice strings', () => {
      const html = SidebarView.getSyncHtml();
      expect(html).toContain('Javadoc enrichment is unavailable');
      expect(html).toContain('DTO field expansion is unavailable');
    });

    it('click handlers still post openExtension for redhat.java (contract preserved)', () => {
      const html = SidebarView.getControlPanelHtml();
      expect(html).toContain("command: 'openExtension', data: 'redhat.java'");
      const syncHtml = SidebarView.getSyncHtml();
      expect(syncHtml).toContain("command: 'openExtension', data: 'redhat.java'");
    });

    it('message handlers dispatch on the two new commands, never the old one', () => {
      const html = SidebarView.getControlPanelHtml();
      expect(html).toContain("msg.command === 'javaExtMissingJavadoc'");
      expect(html).toContain("msg.command === 'javaExtMissingSchema'");
      expect(html).not.toContain("msg.command === 'javaExtMissing'");

      const syncHtml = SidebarView.getSyncHtml();
      expect(syncHtml).toContain("data.command === 'javaExtMissingJavadoc'");
      expect(syncHtml).toContain("data.command === 'javaExtMissingSchema'");
      expect(syncHtml).not.toContain("data.command === 'javaExtMissing'");
    });

    it('each notice banner has its own install link wired to openExtension', () => {
      const html = SidebarView.getControlPanelHtml();
      expect(html).toContain('id="javaExtLink"');
      expect(html).toContain('id="schemaExtLink"');
      const syncHtml = SidebarView.getSyncHtml();
      expect(syncHtml).toContain('id="syncJavaExtLink"');
      expect(syncHtml).toContain('id="syncSchemaExtLink"');
    });
  });

  describe('loadProjectModules (bounded fetches)', () => {
    let postSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      postSpy = jest.spyOn(SidebarView, 'postMessage').mockImplementation(() => {});
      logSpy = jest.spyOn(DebugLogger, 'log');
      errorSpy = jest.spyOn(DebugLogger, 'error');
      setSetting('metersphere.msUrl', 'http://localhost:8081');
      setSetting('metersphere.accessKey', 'ak-test-12345678');
      setSetting('metersphere.secretKey', 'sk-test-12345678');
      setSetting('metersphere.workspaceId', 'ws-1');
      setSetting('metersphere.projectId', '');
    });

    afterEach(() => {
      postSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
      jest.clearAllMocks();
    });

    it('happy: bounded fetches resolve -> posts projectLoaded with modules and logs success', async () => {
      (fetchWithTimeout as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: [{ id: 'p1', name: 'Proj One' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ id: 'm1', name: 'Module A' }] }),
        });

      await SidebarView.loadProjectModules();

      expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
      expect(fetchWithTimeout).toHaveBeenNthCalledWith(
        1,
        'http://localhost:8081/api/project/list/related',
        expect.objectContaining({ method: 'POST' }),
        12_000
      );
      expect(fetchWithTimeout).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8081/api/api/module/list/p1/HTTP',
        expect.objectContaining({}),
        12_000
      );
      expect(postSpy).toHaveBeenCalledWith({
        command: 'projectLoaded',
        name: 'Proj One',
        data: { modules: [{ id: 'p1:m1', name: 'Module A' }] },
      });
      expect(logSpy).toHaveBeenCalledWith('Sync', 'Starting module load', expect.anything());
    });

    it('failure: FetchTimeoutError -> posts loadProjectError, logs the timeout, and the promise settles (never hangs)', async () => {
      (fetchWithTimeout as jest.Mock).mockRejectedValueOnce(
        new FetchTimeoutError('http://localhost:8081/api/project/list/related', 12_000)
      );

      await expect(SidebarView.loadProjectModules()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Sync', 'Module load timed out', expect.any(FetchTimeoutError));
      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'Fetch timed out after 12000ms: http://localhost:8081/api/project/list/related' },
      });
    });
  });
});
