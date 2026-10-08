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
});
