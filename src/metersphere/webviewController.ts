import * as vscode from 'vscode'
import { httpRequest } from './httpClient'
import { SettingsManager } from './settingsManager'
import { DebugLogger } from './debugLogger'

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
    
    // Message bridge
    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!this.panel) return
      const { command, payload } = message
      
      if (command === 'sendRequest') {
        try {
          const accessKey = SettingsManager.getAccessKey() || ''
          const secretKey = SettingsManager.getSecretKey() || ''
          
          if (!accessKey || !secretKey) {
            this.panel.webview.postMessage({ 
              command: 'response', 
              payload: { 
                status: 0, 
                statusText: 'Not configured', 
                error: 'Please configure Access Key and Secret Key in Settings' 
              } 
            })
            return
          }
          
          const reqPayload = payload as { 
            url: string; 
            method: string; 
            headers?: Record<string, string>; 
            body?: string 
          }
          
          const headers: Record<string, string> = reqPayload.headers || {}
          headers['accessKey'] = accessKey
          headers['signature'] = SettingsManager.generateSignature(accessKey, secretKey)
          
          DebugLogger.log('Debugger', 'Sending request', { 
            url: reqPayload.url, 
            method: reqPayload.method,
            headers: Object.keys(headers)
          })
          
          let body: any = undefined
          if (reqPayload.body) {
            try {
              body = JSON.parse(reqPayload.body)
            } catch {
              body = reqPayload.body
            }
          }
          
          const resp = await httpRequest(reqPayload.method, reqPayload.url, headers, body)
          
          DebugLogger.log('Debugger', 'Response received', { 
            status: resp.status,
            hasBody: !!resp.body
          })
          
          this.panel.webview.postMessage({ command: 'response', payload: resp })
          
          // Save to history
          this.saveToHistory(reqPayload, resp)
          
        } catch (error) {
          this.panel.webview.postMessage({ 
            command: 'response', 
            payload: { 
              status: 0, 
              statusText: 'Error', 
              error: error instanceof Error ? error.message : String(error)
            } 
          })
        }
      } else if (command === 'setAccessKey') {
        SettingsManager.setAccessKey(payload as string)
      } else if (command === 'setSecretKey') {
        SettingsManager.setSecretKey(payload as string)
      }
    })
    
    this.panel.onDidDispose(() => {
      this.panel = undefined
    })
  }

  private async saveToHistory(request: any, response: any): Promise<void> {
    const history = this.context.workspaceState.get<HistoryItem[]>('debuggerHistory') || []
    const item: HistoryItem = {
      timestamp: Date.now(),
      url: request.url,
      method: request.method,
      status: response.status,
      success: response.ok || false
    }
    history.unshift(item)
    // Keep only last 50 requests
    if (history.length > 50) {
      history.length = 50
    }
    await this.context.workspaceState.update('debuggerHistory', history)
  }

  private getHtml(): string {
    const msUrl = SettingsManager.getMsUrl() || ''
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MeterSphere API Debugger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      padding: 16px; 
      margin: 0; 
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    h3 { margin: 0 0 16px 0; font-weight: 600; font-size: 14px; }
    .container { display: flex; gap: 16px; flex: 1; overflow: hidden; }
    .left-panel { flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
    .right-panel { flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    label { font-weight: 500; font-size: 13px; }
    input[type="text"], select, textarea { 
      width: 100%; 
      padding: 8px; 
      border: 1px solid var(--vscode-input-border, transparent); 
      border-radius: 4px; 
      font-size: 13px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    textarea { min-height: 120px; resize: vertical; font-family: 'Monaco', 'Menlo', monospace; }
    .header-row { display: flex; gap: 8px; }
    .header-row select { width: 120px; }
    .header-row input { flex: 1; }
    button { 
      padding: 8px 16px; 
      cursor: pointer; 
      border: none; 
      border-radius: 4px; 
      font-weight: 500; 
      font-size: 13px;
      font-family: inherit;
    }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
    .btn-danger { background: transparent; color: var(--vscode-errorForeground, #e06c75); border: 1px solid var(--vscode-errorForeground, #e06c75); }
    .btn-danger:hover { opacity: 0.8; }
    .response-box { 
      background: var(--vscode-input-background); 
      border: 1px solid var(--vscode-input-border, transparent); 
      border-radius: 4px; 
      padding: 12px; 
      flex: 1; 
      overflow: auto;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      color: var(--vscode-editor-foreground);
    }
    .status-badge { 
      display: inline-block; 
      padding: 2px 8px; 
      border-radius: 3px; 
      font-size: 12px; 
      font-weight: 500;
      color: #fff;
    }
    .status-2xx { background: var(--vscode-testing-iconPassedForeground, #4ec9b0); }
    .status-4xx { background: var(--vscode-testing-iconFailedForeground, #f14c4c); }
    .status-5xx { background: var(--vscode-editorWarning-foreground, #cc7a00); }
    .status-error { background: var(--vscode-testing-iconFailedForeground, #f14c4c); }
    .history-item { 
      padding: 8px 12px; 
      border-bottom: 1px solid var(--vscode-widget-border, transparent); 
      cursor: pointer;
      font-size: 12px;
    }
    .history-item:hover { background: var(--vscode-list-hoverBackground); }
    .history-method { font-weight: 500; margin-right: 8px; }
    .history-url { color: var(--vscode-descriptionForeground); }
    .section-title { 
      font-size: 14px; 
      font-weight: 600; 
      margin: 0 0 8px 0; 
    }
    .headers-editor { display: flex; flex-direction: column; gap: 8px; }
    .header-row-item { display: flex; gap: 8px; align-items: center; }
    .header-row-item input { flex: 1; }
    .header-row-item button { 
      background: transparent; 
      color: var(--vscode-errorForeground, #e06c75); 
      border: 1px solid var(--vscode-errorForeground, #e06c75); 
      border-radius: 3px; 
      padding: 4px 8px; 
      cursor: pointer;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h3>MeterSphere API Debugger</h3>
  
  <div class="container">
    <!-- Left Panel: Request -->
    <div class="left-panel">
      <div class="section-title">Request</div>
      
      <div class="form-group">
        <div class="header-row">
          <select id="methodSelect">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
          </select>
          <input type="text" id="urlInput" value="${msUrl}/api/" placeholder="Enter URL...">
        </div>
      </div>
      
      <div class="form-group">
        <label>Headers</label>
        <div class="headers-editor" id="headersEditor">
          <div class="header-row-item">
            <input type="text" placeholder="Header name" value="Content-Type">
            <input type="text" placeholder="Value" value="application/json">
            <button class="remove-header-btn">×</button>
          </div>
        </div>
        <button class="btn-secondary" id="addHeaderBtn" style="margin-top: 4px;">+ Add Header</button>
      </div>
      
      <div class="form-group">
        <label for="bodyInput">Request Body (JSON)</label>
        <textarea id="bodyInput" placeholder='{"key": "value"}'></textarea>
      </div>
      
      <div>
        <button class="btn-primary" id="sendRequestBtn">Send Request</button>
      </div>
      
    </div>
    
    <!-- Right Panel: Response -->
    <div class="right-panel">
      <div class="section-title">Response</div>
      <div id="statusBadge" style="margin-bottom: 8px;"></div>
      <div class="form-group">
        <label>Response Body</label>
        <pre class="response-box" id="responseBody">No response yet.</pre>
      </div>
      <div class="form-group">
        <label>Response Headers</label>
        <pre class="response-box" id="responseHeaders">No response yet.</pre>
      </div>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    (function() {
      document.getElementById('addHeaderBtn').addEventListener('click', addHeader);
      document.getElementById('sendRequestBtn').addEventListener('click', sendRequest);
      document.getElementById('headersEditor').addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-header-btn')) {
          e.target.parentElement.remove();
        }
      });
    })();
    
    function addHeader() {
      const editor = document.getElementById('headersEditor');
      const div = document.createElement('div');
      div.className = 'header-row-item';
      div.innerHTML = '<input type="text" placeholder="Header name"><input type="text" placeholder="Value"><button class="remove-header-btn">×</button>';
      editor.appendChild(div);
    }
    
    function getHeaders() {
      const editor = document.getElementById('headersEditor');
      const headers = {};
      const items = editor.querySelectorAll('.header-row-item');
      items.forEach(function(item) {
        const inputs = item.querySelectorAll('input');
        if (inputs[0].value) {
          headers[inputs[0].value] = inputs[1].value;
        }
      });
      return headers;
    }
    
    function sendRequest() {
      const method = document.getElementById('methodSelect').value;
      const url = document.getElementById('urlInput').value;
      const body = document.getElementById('bodyInput').value;
      const headers = getHeaders();
      
      if (!url) {
        alert('Please enter a URL');
        return;
      }
      
      document.getElementById('responseBody').textContent = 'Loading...';
      document.getElementById('responseHeaders').textContent = 'Loading...';
      document.getElementById('statusBadge').innerHTML = '';
      
      vscode.postMessage({
        command: 'sendRequest',
        payload: { method: method, url: url, headers: headers, body: body }
      });
    }
    
    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (msg.command === 'response') {
        const resp = msg.payload;
        document.getElementById('responseBody').textContent = typeof resp.body === 'string' ? 
          resp.body : JSON.stringify(resp.body, null, 2);
        document.getElementById('responseHeaders').textContent = JSON.stringify(resp.headers || {}, null, 2);
        
        const statusDiv = document.getElementById('statusBadge');
        if (resp.error) {
          statusDiv.innerHTML = '<span class="status-badge status-error">Error: ' + resp.error + '</span>';
        } else {
          const statusClass = resp.status >= 200 && resp.status < 300 ? 'status-2xx' : 
                            resp.status >= 400 && resp.status < 500 ? 'status-4xx' : 
                            resp.status >= 500 ? 'status-5xx' : 'status-error';
          statusDiv.innerHTML = '<span class="status-badge ' + statusClass + '">' + resp.status + ' ' + (resp.statusText || '') + '</span>';
        }
      }
    });
  </script>
</body>
</html>`
  }
}

interface HistoryItem {
  timestamp: number
  url: string
  method: string
  status: number
  success: boolean
}
