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
      expect(logSpy).toHaveBeenCalledWith('Sync', 'Modules loaded', expect.objectContaining({ moduleCount: 1 }));
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
      expect(errorSpy).toHaveBeenCalledWith('Sync', 'Failed to load projects', expect.objectContaining({ status: 500 }));
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
      expect(errorSpy).toHaveBeenCalledWith('Sync', 'Project list success=false', expect.objectContaining({ message: 'nope' }));
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
      expect(errorSpy).toHaveBeenCalledWith('Sync', 'No projects found in workspace', expect.objectContaining({ workspaceId: 'ws-1' }));
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
      expect(logSpy).toHaveBeenCalledWith('Sync', 'Modules loaded', expect.objectContaining({ moduleCount: 0 }));
    });

    it('failure: not configured -> logs and posts loadProjectError without any request', async () => {
      setSetting('metersphere.msUrl', '');

      await SidebarView.loadProjectModules();

      expect(errorSpy).toHaveBeenCalledWith('Sync', 'MeterSphere not configured', {});
      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'MeterSphere not configured. Go to Settings to set up your connection.' },
      });
      expect(httpRequest).not.toHaveBeenCalled();
    });

    it('failure: no workspace selected -> logs and posts loadProjectError without any request', async () => {
      setSetting('metersphere.workspaceId', '');

      await SidebarView.loadProjectModules();

      expect(errorSpy).toHaveBeenCalledWith('Sync', 'No workspace selected', {});
      expect(postSpy).toHaveBeenCalledWith({
        command: 'loadProjectError',
        data: { message: 'No workspace selected. Use Navigator to select a workspace.' },
      });
      expect(httpRequest).not.toHaveBeenCalled();
    });
  });

  describe('webviewReady handshake (state replay + delivery logging)', () => {
    function makeCapturingView(sink: Record<string, unknown>[]): any {
      return { webview: { postMessage: (m: Record<string, unknown>) => { sink.push(m); return Promise.resolve(true); } } };
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('buffers state-bearing messages and replays them to a freshly loaded webview on webviewReady', () => {
      const gotA: Record<string, unknown>[] = [];
      SidebarView.registerView('controlPanel', makeCapturingView(gotA));
      SidebarView.postMessage({ command: 'scanningStarted', data: { message: 'Scanning...' } });
      SidebarView.postMessage({ command: 'scanComplete', data: { files: ['A.java', 'B.java'] } });
      SidebarView.postMessage({ command: 'projectLoaded', name: 'Proj', data: { modules: [{ id: 'm', name: 'M' }] } });

      const gotAfterReload: Record<string, unknown>[] = [];
      SidebarView.registerView('controlPanel', makeCapturingView(gotAfterReload));
      SidebarView.handleMessage({ command: 'webviewReady' }, 'controlPanel');

      const cmds = gotAfterReload.map(m => m.command);
      expect(cmds).toContain('scanComplete');
      expect(cmds).toContain('projectLoaded');
      expect(cmds).not.toContain('scanningStarted');
    });

    it('logs the delivery result of every postMessage', async () => {
      const logSpy = jest.spyOn(DebugLogger, 'log');
      const got: Record<string, unknown>[] = [];
      SidebarView.registerView('controlPanel', makeCapturingView(got));
      SidebarView.postMessage({ command: 'scanComplete', data: { files: [] } });
      await Promise.resolve();
      await Promise.resolve();
      expect(logSpy).toHaveBeenCalledWith('Sync', 'postMessage delivered', expect.objectContaining({ command: 'scanComplete', delivered: true }));
    });

    it('control panel HTML announces webviewReady and reports window errors', () => {
      const html = SidebarView.getControlPanelHtml();
      expect(html).toContain("command: 'webviewReady'");
      expect(html).toContain("window.addEventListener('error'");
      expect(html).toContain('unhandledrejection');
    });

    it('webviewError is logged as a flat JSON string, never [object Object]', () => {
      const errorSpy = jest.spyOn(DebugLogger, 'error');
      SidebarView.handleMessage({ command: 'webviewError', data: { message: 'boom', lineno: 42 } }, 'controlPanel');
      expect(errorSpy).toHaveBeenCalledWith('Sync', expect.stringContaining('"message":"boom"'));
    });
  });
});
