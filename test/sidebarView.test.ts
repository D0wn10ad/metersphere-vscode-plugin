/**
 * Tests for the SidebarView degraded-mode notices and the loadProjectModules
 * transport.
 *
 * loadProjectModules is routed through httpRequest (httpClient) so the WHOLE
 * request — including the response body read — is bounded by Promise.race
 * (10s). The mock replaces httpRequest only; the rest of the module stays
 * actual. No real network is ever performed.
 */

import { SidebarView } from '../src/metersphere/views/sidebarView';
import { DebugLogger } from '../src/metersphere/debugLogger';
import { httpRequest } from '../src/metersphere/httpClient';

jest.mock('../src/metersphere/httpClient', () => {
  const actual = jest.requireActual('../src/metersphere/httpClient');
  return { ...actual, httpRequest: jest.fn() };
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

  describe('loadProjectModules (httpRequest transport, bounded incl. body)', () => {
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

    it('happy: bounded httpRequest resolves -> posts projectLoaded with modules', async () => {
      (httpRequest as jest.Mock)
        .mockResolvedValueOnce({
          status: 200,
          body: { success: true, data: [{ id: 'p1', name: 'Proj One' }] },
        })
        .mockResolvedValueOnce({
          status: 200,
          body: { data: [{ id: 'm1', name: 'Module A' }] },
        });

      await SidebarView.loadProjectModules();

      expect(httpRequest).toHaveBeenCalledTimes(2);
      expect(httpRequest).toHaveBeenNthCalledWith(
        1,
        'POST',
        'http://localhost:8081/api/project/list/related',
        expect.any(Object),
        { workspaceIds: ['ws-1'] }
      );
      expect(httpRequest).toHaveBeenNthCalledWith(
        2,
        'GET',
        'http://localhost:8081/api/api/module/list/p1/HTTP',
        expect.any(Object)
      );
      expect(postSpy).toHaveBeenCalledWith({
        command: 'projectLoaded',
        name: 'Proj One',
        data: { modules: [{ id: 'p1:m1', name: 'Module A' }] },
      });
      expect(logSpy).toHaveBeenCalledWith('Sync', 'Starting module load', expect.anything());
    });

    it('failure: timeout rejection -> posts loadProjectError, logs, and settles (never hangs)', async () => {
      (httpRequest as jest.Mock).mockRejectedValueOnce(new Error('Request timed out after 10s'));

      await expect(SidebarView.loadProjectModules()).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith('Sync', 'Failed to load modules', expect.any(Error));
      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'Request timed out after 10s' },
      });
    });

    it('failure: HTTP 500 on projects -> posts loadProjectError', async () => {
      (httpRequest as jest.Mock).mockResolvedValueOnce({ status: 500, body: {} });

      await SidebarView.loadProjectModules();

      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'Failed to load projects: HTTP 500' },
      });
    });

    it('failure: success=false -> posts loadProjectError with the server message', async () => {
      (httpRequest as jest.Mock).mockResolvedValueOnce({
        status: 200,
        body: { success: false, message: 'nope' },
      });

      await SidebarView.loadProjectModules();

      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'nope' },
      });
    });

    it('failure: empty projects -> posts loadProjectError', async () => {
      (httpRequest as jest.Mock).mockResolvedValueOnce({
        status: 200,
        body: { success: true, data: [] },
      });

      await SidebarView.loadProjectModules();

      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'No projects found in this workspace.' },
      });
    });

    it('empty modules -> posts projectLoaded with an empty module list', async () => {
      (httpRequest as jest.Mock)
        .mockResolvedValueOnce({
          status: 200,
          body: { success: true, data: [{ id: 'p1', name: 'Proj One' }] },
        })
        .mockResolvedValueOnce({ status: 200, body: { data: [] } });

      await SidebarView.loadProjectModules();

      expect(postSpy).toHaveBeenCalledWith({
        command: 'projectLoaded',
        name: 'Proj One',
        data: { modules: [] },
      });
    });
  });
});
