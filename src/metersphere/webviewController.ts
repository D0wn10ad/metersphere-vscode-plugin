import * as vscode from 'vscode'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'

export class WebViewController {
  private panel?: vscode.WebviewPanel

  constructor(private context: vscode.ExtensionContext) {}

  public open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One)
      return
    }
    this.panel = vscode.window.createWebviewPanel('metersphereDebugger', 'MeterSphere API Debugger', vscode.ViewColumn.One, {
      enableScripts: true
    })
    this.panel.webview.html = this.getHtml()
    // Simple message bridge
    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!this.panel) return
      const { command, payload } = message
      if (command === 'sendRequest') {
        const token = SettingsManager.getToken() || ''
        const reqPayload = payload as { url: string; method: string; headers?: Record<string, string>; body?: unknown }
        const headers: Record<string, string> = reqPayload.headers || {}
        headers['Authorization'] = `Bearer ${token}`
        const resp = await httpRequest(reqPayload.method, reqPayload.url, headers, reqPayload.body)
        this.panel!.webview.postMessage({ command: 'response', payload: resp })
      } else if (command === 'setToken') {
        SettingsManager.setToken(payload as unknown as string)
      }
    })
    this.panel.onDidDispose(() => {
      this.panel = undefined
    })
  }

  private getHtml(): string {
    // Very small UI: a basic form and a response viewport
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>MeterSphere Debugger</title></head><body><h3>MeterSphere API Debugger</h3><div id="out"></div><script>
      const vscode = acquireVsCodeApi();
      // Basic UI wiring is kept minimal for MVP
      function post(cmd, payload){ vscode.postMessage({command: cmd, payload}); }
      window.addEventListener('message', event => {
        const msg = event.data; if (msg && msg.command === 'response') {
          const pre = document.createElement('pre'); pre.textContent = JSON.stringify(msg.payload, null, 2);
          document.getElementById('out').appendChild(pre);
        }
      });
    </script></body></html>`
    return html
  }
}
