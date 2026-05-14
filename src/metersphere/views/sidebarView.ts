import * as vscode from 'vscode'
import { SettingsManager } from '../settingsManager'
import { JavaParser } from '../javaParser'
import { SyncService } from '../syncService'
import FormData from 'form-data'
import { DebugLogger } from '../debugLogger'
import { ContextHolder } from '../contextHolder'

export class SidebarView {
  private static views: Record<string, vscode.WebviewView> = {}

  static registerView(id: string, view: vscode.WebviewView): void {
    SidebarView.views[id] = view
  }

  static unregisterView(id: string): void {
    delete SidebarView.views[id]
  }

  static showEnvironment(): void {
    vscode.commands.executeCommand('metersphere.environment.focus')
  }

  static showHistory(): void {
    vscode.commands.executeCommand('metersphere.history.focus')
  }

  static showSettings(): void {
    vscode.commands.executeCommand('metersphere.settings.focus')
  }

  static async showSync(): Promise<void> {
    await vscode.commands.executeCommand('metersphere.sync.focus')
    await SidebarView.loadProjectModules()
  }

  static async loadProjectModules(): Promise<void> {
    const msUrl = SettingsManager.getMsUrl()
    const accessKey = SettingsManager.getAccessKey()
    const secretKey = SettingsManager.getSecretKey()
    if (!msUrl || !accessKey || !secretKey) {
      SidebarView.postMessage({ command: 'loadProjectError', data: { message: 'MeterSphere not configured. Go to Settings to set up your connection.' } })
      return
    }

    try {
      const headers = SettingsManager.buildAuthHeaders('application/json')
      const workspaceId = SettingsManager.getWorkspaceId()
      const projectId = SettingsManager.getProjectId()

      if (!workspaceId) {
        SidebarView.postMessage({ command: 'loadProjectError', data: { message: 'No workspace selected. Use Navigator to select a workspace.' } })
        return
      }

      DebugLogger.log('Sync', 'Starting module load', {
        workspaceId,
        projectId: projectId ?? 'none'
      })

      const projectsResp = await fetch(`${msUrl}/api/project/list/related`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceIds: [workspaceId] })
      })
      if (!projectsResp.ok) {
        SidebarView.postMessage({ command: 'loadProjectError', data: { message: `Failed to load projects: HTTP ${projectsResp.status}` } })
        return
      }
      const rawJson = await projectsResp.json()
      if (!rawJson.success) {
        SidebarView.postMessage({ command: 'loadProjectError', data: { message: rawJson.message || 'Failed to load projects from server' } })
        return
      }
      const projects = rawJson.data || []
      if (projects.length === 0) {
        SidebarView.postMessage({ command: 'loadProjectError', data: { message: 'No projects found in this workspace.' } })
        return
      }

      const savedProjectId = SettingsManager.getProjectId()
      let targetProject = projects[0]
      if (savedProjectId) {
        const found = projects.find((p: any) => p.id === savedProjectId)
        if (found) targetProject = found
      }

      const modulesResp = await fetch(`${msUrl}/api/api/module/list/${targetProject.id}/HTTP`, { headers })
      if (!modulesResp.ok) {
        SidebarView.postMessage({ command: 'loadProjectError', data: { message: `Failed to load modules: HTTP ${modulesResp.status}` } })
        return
      }
      const modulesData = await modulesResp.json()
      const modules = modulesData.data || []
      const fullModules = modules.map((m: any) => ({
        id: `${targetProject.id}:${m.id}`,
        name: m.name,
      }))

      SidebarView.postMessage({
        command: 'projectLoaded',
        name: targetProject.name,
        data: { modules: fullModules }
      })
    } catch (error) {
      DebugLogger.error('Sync', 'Failed to load modules', error)
      SidebarView.postMessage({ command: 'loadProjectError', data: { message: error instanceof Error ? error.message : String(error) } })
    }
  }

  static sendFilesToSync(filePaths: string[]): void {
    const syncView = SidebarView.views['sync']
    if (syncView) {
      syncView.webview.postMessage({
        command: 'javaFilesSelected',
        files: filePaths,
      })
    }
  }

  static postMessage(msg: Record<string, unknown>, viewId?: string): void {
    const targetId = viewId || 'sync'
    const view = SidebarView.views[targetId]
    if (view) {
      view.webview.postMessage(msg).catch(() => {})
    }
  }

  static async handleMessage(message: { command: string; data?: any }, viewId?: string): Promise<void> {
    switch (message.command) {
      case 'saveSettings':
        SettingsManager.setMsUrl(message.data.msUrl)
        SettingsManager.setAccessKey(message.data.accessKey)
        SettingsManager.setSecretKey(message.data.secretKey)
        SettingsManager.setDebugEnabled(message.data.debugEnabled ?? false)
        vscode.window.showInformationMessage('Settings saved!')
        break

      case 'selectJavaFiles':
        const fileUris = await vscode.window.showOpenDialog({
          canSelectMany: true,
          filters: { Java: ['java'] },
          title: 'Select Java Controller Files',
        })
        if (fileUris && fileUris.length > 0) {
          SidebarView.postMessage({
            command: 'javaFilesSelected',
            files: fileUris.map((u: any) => u.fsPath),
          })
        }
        break

      case 'uploadToMeterSphere':
        await SidebarView.handleUpload(message.data)
        break

      case 'openExtension':
        await vscode.commands.executeCommand('extension.open', message.data)
        break

      case 'testConnection':
        vscode.commands.executeCommand('metersphere.testConnection')
        break

      case 'loadEnvironments':
        await SidebarView.loadEnvironments(viewId || 'environment')
        break

      case 'loadHistory':
        SidebarView.loadHistory(viewId || 'history')
        break

      case 'clearHistory':
        SidebarView.clearHistory(viewId || 'history')
        break

      case 'openInDebugger':
        vscode.commands.executeCommand('metersphere.showDebugger')
        break

      case 'loadProjectData':
        await SidebarView.loadProjectModules()
        break
    }
  }

  private static async handleUpload(uploadData: any): Promise<void> {
    SidebarView.postMessage({ command: 'uploadProgress', data: { message: 'Parsing Java files...' } })
    
    try {
      let allApis = { classes: [] as any[], apis: [] as any[] }
      
      for (const filePath of uploadData.files) {
        const doc = await vscode.workspace.openTextDocument(filePath)
        const code = doc.getText()
        const parsed = JavaParser.parseSource(code, filePath)
        allApis.classes.push(...parsed.classes)
        allApis.apis.push(...parsed.apis)
      }

      if (allApis.apis.length === 0) {
        SidebarView.postMessage({ command: 'uploadError', data: { message: 'No @RestController or @Controller classes found in selected files' } })
        return
      }

      const javaExts = ['redhat.java', 'georgewfraser.vscode-javac']
      const hasJavaExt = vscode.extensions.all.some((ext: any) => javaExts.includes(ext.id))
      
      if (!hasJavaExt) {
        SidebarView.postMessage({ command: 'javaExtMissing' })
      } else {
        try {
          allApis = await JavaParser.enhanceWithJavadoc(allApis, uploadData.files[0])
        } catch {
          // Javadoc enhancement failed, continue without it
        }
      }

      SidebarView.postMessage({ command: 'uploadProgress', data: { message: 'Converting to Postman format...' } })

      const collectionName = uploadData.files.length === 1
        ? uploadData.files[0].split(/[/\\]/).pop()?.replace('.java', '') || 'Java API'
        : 'Java APIs'

      const postmanCollection = SyncService.toPostmanCollection(allApis, collectionName)

      if (uploadData.contextPath) {
        for (const item of postmanCollection.item) {
          const path = '/' + uploadData.contextPath.replace(/^\//, '') + '/' + item.request.url.path.join('/')
          item.request.url.raw = path
          item.request.url.path = path.split('/').filter(Boolean)
        }
      }

      const jsonContent = JSON.stringify(postmanCollection, null, 2)

      const moduleParts = uploadData.moduleId.split(':')
      const projectId = moduleParts[0]
      const moduleId = moduleParts[1] || moduleParts[0]

      const msUrl = SettingsManager.getMsUrl()
      const accessKey = SettingsManager.getAccessKey()
      const secretKey = SettingsManager.getSecretKey()

      if (!msUrl || !accessKey || !secretKey) {
        SidebarView.postMessage({ command: 'uploadError', data: { message: 'MeterSphere credentials not configured. Please check Settings.' } })
        return
      }

      SidebarView.postMessage({ command: 'uploadProgress', data: { message: 'Uploading to MeterSphere...' } })

      const isFullCoverage = uploadData.mode === 'fullCoverage'
      const urlCoverModule = isFullCoverage ? 'true' : 'false'

      // Create FormData with proper multipart format
      const formData = new FormData()
      formData.append('file', jsonContent, {
        filename: `${collectionName}.json`,
        contentType: 'application/json',
      })

      // Build request JSON first
      const bodyModeId = uploadData.mode === 'fullCoverage' ? 'fullCoverage' : 'incrementalMerge'
      const requestJson = JSON.stringify({
        name: collectionName,
        id: '',
        resourceId: '',
        userId: '',
        versionId: '',
        updateVersionId: '',
        defaultVersion: '',
        modulePath: '',
        environmentId: '',
        useEnvironment: false,
        swaggerUrl: '',
        openCustomNum: true,
        headers: [],
        arguments: [],
        platform: 'Postman',
        fileName: `${collectionName}.json`,
        moduleId: moduleId,
        projectId: projectId,
        modeId: bodyModeId,
        syncCase: uploadData.syncCase ?? true,
        model: 'definition',
        protocol: 'HTTP',
        origin: 'vscode',
        coverModule: isFullCoverage,
        authManager: {
          type: 'AuthManager',
          clazzName: 'io.metersphere.api.dto.definition.request.auth.MsAuthManager',
          id: '',
          resourceId: null,
          name: '',
          label: null,
          referenced: null,
          active: false,
          index: null,
          enable: true,
          refType: null,
          hashTree: null,
          projectId: null,
          isMockEnvironment: false,
          environmentId: null,
          pluginId: null,
          stepName: null,
          parent: null,
          username: '',
          password: '',
          url: null,
          realm: null,
          verification: '',
          mechanism: '',
          encrypt: 'false',
          domain: null,
          environment: null,
          mockEnvironment: false,
        },
      })

      // FIXED: Append 'request' AFTER requestJson is created
      formData.append('request', requestJson, { 
        contentType: 'application/json',
        filename: 'request.json',
      })

      // FIXED: Get Content-Type with boundary from formData.getHeaders()
      // NOTE: form-data library returns lowercase 'content-type' key!
      const formDataHeaders = formData.getHeaders() as Record<string, string>
      
      // FIXED: Get the full buffer AFTER both parts are added
      const bodyBuffer = formData.getBuffer()
      const bodyLength = formData.getLengthSync()
      
      const msHeaders = SettingsManager.buildAuthHeaders(undefined) as Record<string, string>
      
      // FIXED: Set Content-Length to prevent EOF
      const uploadHeaders = {
        ...msHeaders,
        'accept': 'application/json, text/plain, */*',
        'Content-Type': formDataHeaders['content-type'], // lowercase key!
        'Content-Length': String(bodyLength),
      }
      
      DebugLogger.log('Sync', 'FormData debug', {
        boundary: formData.getBoundary(),
        contentType: formDataHeaders['content-type'],
        headerKeys: Object.keys(formDataHeaders),
        bodyLength: bodyLength,
        bufferLength: bodyBuffer?.length,
        bodyPreview: bodyBuffer?.toString('utf8').substring(0, 100),
      })

      const params = new URLSearchParams({
        modeId: uploadData.mode,
        projectId,
        moduleId,
        platform: 'Postman',
        model: 'definition',
        protocol: 'HTTP',
        origin: 'vscode',
        coverModule: urlCoverModule,
      })

      // Debug log for request JSON content
      DebugLogger.log('Sync', 'Request JSON content', {
        requestJson: requestJson.substring(0, 500),
        requestJsonLength: requestJson.length,
      })

      DebugLogger.log('Sync', 'Upload request', {
        url: `${msUrl}/api/api/definition/import?${params.toString()}`,
        headerKeys: Object.keys(uploadHeaders),
        hasAccessKey: !!(uploadHeaders as any).accessKey,
        hasSignature: !!(uploadHeaders as any).signature,
        contentType: (uploadHeaders as any)['Content-Type'],
      })

      const response = await fetch(`${msUrl}/api/api/definition/import?${params.toString()}`, {
        method: 'POST',
        headers: uploadHeaders,
        body: bodyBuffer,  // Use the pre-computed buffer instead of streaming formData
      })

      const responseText = await response.text()

      // Debug log full response for error diagnosis
      DebugLogger.log('Sync', 'Upload response', {
        status: response.status,
        ok: response.ok,
        responseText: responseText.substring(0, 1000),  // Full error message
        responseTextLength: responseText.length,
      })

      if (response.ok) {
        SidebarView.postMessage({ command: 'uploadSuccess', data: { count: allApis.apis.length } })
      } else {
        SidebarView.postMessage({ command: 'uploadError', data: { message: `Upload failed: ${response.status} ${responseText}` } })
      }
    } catch (error) {
      DebugLogger.error('Sync', 'Upload failed', error)
      SidebarView.postMessage({ command: 'uploadError', data: { message: `Error: ${error instanceof Error ? error.message : String(error)}` } })
    }
  }

  private static async loadEnvironments(viewId: string): Promise<void> {
    const msUrl = SettingsManager.getMsUrl()
    const accessKey = SettingsManager.getAccessKey()
    const secretKey = SettingsManager.getSecretKey()
    if (!msUrl || !accessKey || !secretKey) {
      SidebarView.postMessage({ command: 'environmentsError', data: { message: 'MeterSphere not configured' } }, viewId)
      return
    }
    try {
      const projectId = SettingsManager.getProjectId()
      if (!projectId) {
        SidebarView.postMessage({ command: 'environmentsError', data: { message: 'No project selected. Use Navigator to select a project.' } }, viewId)
        return
      }
      const headers = SettingsManager.buildAuthHeaders('application/json')
      const resp = await fetch(`${msUrl}/api/environment/list/${projectId}`, { headers })
      const json = await resp.json()
      const environments = json.success && json.data ? json.data : []
      SidebarView.postMessage({ command: 'environmentsLoaded', data: { environments, projectId } }, viewId)
    } catch (error) {
      DebugLogger.error('Environment', 'Failed to load environments', error)
      SidebarView.postMessage({ command: 'environmentsError', data: { message: error instanceof Error ? error.message : String(error) } }, viewId)
    }
  }

  private static loadHistory(viewId: string): void {
    try {
      const context = ContextHolder.getContext()
      const history = context.workspaceState.get<any[]>('debuggerHistory', [])
      SidebarView.postMessage({ command: 'historyLoaded', data: { history } }, viewId)
    } catch (error) {
      DebugLogger.error('History', 'Failed to load history', error)
      SidebarView.postMessage({ command: 'historyError', data: { message: String(error) } }, viewId)
    }
  }

  private static async clearHistory(viewId: string): Promise<void> {
    try {
      const context = ContextHolder.getContext()
      await context.workspaceState.update('debuggerHistory', [])
      SidebarView.postMessage({ command: 'historyLoaded', data: { history: [] } }, viewId)
    } catch (error) {
      DebugLogger.error('History', 'Failed to clear history', error)
    }
  }

  private static getThemeStyles(): string {
    return `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      padding: 16px;
      margin: 0;
      color: var(--vscode-editor-foreground);
    }
    h3 { margin: 0 0 16px 0; font-weight: 600; font-size: 14px; }
    label { display: block; margin-bottom: 4px; font-weight: 500; font-size: 13px; }
    input, select, textarea {
      width: 100%;
      padding: 6px 8px;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: inherit;
      font-size: 13px;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    button {
      padding: 6px 14px;
      cursor: pointer;
      border: none;
      border-radius: 4px;
      font-weight: 500;
      font-size: 13px;
      font-family: inherit;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .btn-danger {
      background: transparent;
      color: var(--vscode-errorForeground, #e06c75);
      border: 1px solid var(--vscode-errorForeground, #e06c75);
    }
    .btn-danger:hover { opacity: 0.8; }
    .form-group { margin-bottom: 14px; }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .checkbox-label input { width: auto; margin: 0; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    `;
  }

  static getEnvironmentHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${SidebarView.getThemeStyles()}
    .env-card {
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 8px;
    }
    .env-name { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .env-detail { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 2px 0; }
    .env-detail strong { color: var(--vscode-editor-foreground); }
    .toolbar { margin-bottom: 12px; }
    .btn-icon { padding: 2px 8px; font-size: 11px; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <h3 style="margin:0;">Environment</h3>
    <button class="btn-secondary btn-icon" onclick="refresh()">Refresh</button>
  </div>
  <div id="content"><p class="empty">Loading environments...</p></div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ command: 'loadEnvironments' });

    window.addEventListener('message', function(event) {
      const data = event.data;
      if (data.command === 'environmentsLoaded') {
        const envs = data.data.environments || [];
        const projectId = data.data.projectId || '';
        const container = document.getElementById('content');
        if (envs.length === 0) {
          container.innerHTML = '<p class="empty">No environments for this project.</p>';
        } else {
          container.innerHTML = envs.map(function(e) {
            var details = '';
            if (e.config) {
              var c = e.config;
              details += '<div class="env-detail"><strong>Config:</strong> ' + (c.protocol || 'HTTP') + '://' + (c.host || '-') + ':' + (c.port || '') + '</div>';
            }
            if (e.description) {
              details += '<div class="env-detail">' + e.description + '</div>';
            }
            return '<div class="env-card"><div class="env-name">' + (e.name || 'Unnamed') + '</div>' + details + '</div>';
          }).join('');
        }
      } else if (data.command === 'environmentsError') {
        document.getElementById('content').innerHTML = '<p class="empty" style="color:var(--vscode-errorForeground)">' + (data.data?.message || 'Failed to load') + '</p>';
      }
    });

    function refresh() {
      document.getElementById('content').innerHTML = '<p class="empty">Loading environments...</p>';
      vscode.postMessage({ command: 'loadEnvironments' });
    }
  </script>
</body>
</html>`
  }

  static getHistoryHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${SidebarView.getThemeStyles()}
    .history-item {
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-widget-border, transparent);
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .history-item:hover { background: var(--vscode-list-hoverBackground); }
    .history-method {
      font-weight: 600;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      min-width: 38px;
      text-align: center;
      flex-shrink: 0;
    }
    .method-GET { background: var(--vscode-testing-iconPassedForeground, #4ec9b0); color: #fff; }
    .method-POST { background: var(--vscode-testing-iconFailedForeground, #f14c4c); color: #fff; }
    .method-PUT { background: var(--vscode-editorInfo-foreground, #3794ff); color: #fff; }
    .method-DELETE { background: var(--vscode-inputValidation-errorBorder, #f14c4c); color: #fff; }
    .method-PATCH { background: var(--vscode-editorWarning-foreground, #cc7a00); color: #fff; }
    .history-url {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--vscode-editor-foreground);
    }
    .history-status {
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      flex-shrink: 0;
      font-weight: 500;
    }
    .status-success { color: var(--vscode-testing-iconPassedForeground, #4ec9b0); }
    .status-fail { color: var(--vscode-testing-iconFailedForeground, #f14c4c); }
    .history-time {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .btn-icon { padding: 2px 8px; font-size: 11px; }
    .no-history {
      padding: 20px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h3 style="margin:0;">Request History</h3>
    <button class="btn-danger btn-icon" onclick="clearHistory()">Clear</button>
  </div>
  <div id="content"><p class="empty">Loading history...</p></div>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ command: 'loadHistory' });

    function timeAgo(ts) {
      var diff = Date.now() - ts;
      var seconds = Math.floor(diff / 1000);
      if (seconds < 60) return seconds + 's ago';
      var minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + 'm ago';
      var hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + 'h ago';
      var days = Math.floor(hours / 24);
      return days + 'd ago';
    }

    function methodClass(method) {
      return 'method-' + (method || 'GET').toUpperCase();
    }

    window.addEventListener('message', function(event) {
      const data = event.data;
      if (data.command === 'historyLoaded') {
        const history = data.data?.history || [];
        const container = document.getElementById('content');
        if (history.length === 0) {
          container.innerHTML = '<div class="no-history"><p class="empty">No requests yet.</p><p style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:8px;">Send requests from the API Debugger panel to see them here.</p></div>';
        } else {
          container.innerHTML = history.map(function(item) {
            var method = (item.method || 'GET').toUpperCase();
            var statusClass = item.success ? 'status-success' : 'status-fail';
            return '<div class="history-item" onclick="openInDebugger(\'' + method + '\', \'' + (item.url || '').replace(/'/g, "\\'") + '\')">' +
              '<span class="history-method ' + methodClass(item.method) + '">' + method + '</span>' +
              '<span class="history-url" title="' + (item.url || '') + '">' + (item.url || '') + '</span>' +
              '<span class="history-status ' + statusClass + '">' + (item.status || '-') + '</span>' +
              '<span class="history-time">' + timeAgo(item.timestamp) + '</span>' +
              '</div>';
          }).join('');
        }
      } else if (data.command === 'historyError') {
        document.getElementById('content').innerHTML = '<p class="empty" style="color:var(--vscode-errorForeground)">' + (data.data?.message || 'Failed to load history') + '</p>';
      }
    });

    function clearHistory() {
      if (confirm('Clear all request history?')) {
        vscode.postMessage({ command: 'clearHistory' });
      }
    }

    function openInDebugger(method, url) {
      vscode.postMessage({ command: 'openInDebugger', data: { method: method, url: url } });
    }
  </script>
</body>
</html>`
  }

  static getSettingsHtml(): string {
    const msUrl = SettingsManager.getMsUrl() ?? ''
    const accessKey = SettingsManager.getAccessKey() ?? ''
    const secretKey = SettingsManager.getSecretKey() ?? ''
    const debugEnabled = SettingsManager.isDebugEnabled() ? 'checked' : ''

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${SidebarView.getThemeStyles()}</style>
</head>
<body>
  <h3>Settings</h3>
  <form onsubmit="save(event)">
    <div class="form-group">
      <label>Server URL</label>
      <input type="text" id="msUrl" value="${msUrl}" placeholder="http://localhost:8080">
    </div>
    <div class="form-group">
      <label>Access Key</label>
      <input type="text" id="accessKey" value="${accessKey}">
    </div>
    <div class="form-group">
      <label>Secret Key</label>
      <input type="password" id="secretKey" value="${secretKey}">
    </div>
    <div class="checkbox-label">
      <input type="checkbox" id="debugEnabled" ${debugEnabled}>
      <label style="margin: 0; font-weight: normal;">Enable Debug Logging</label>
    </div>
    <button type="button" class="btn-secondary" onclick="testConnection()">Test Connection</button>
    <button type="submit" class="btn-primary">Save Settings</button>
  </form>
  <script>
    const vscode = acquireVsCodeApi();
    function save(event) {
      event.preventDefault();
      vscode.postMessage({ command: 'saveSettings', data: {
        msUrl: document.getElementById('msUrl').value,
        accessKey: document.getElementById('accessKey').value,
        secretKey: document.getElementById('secretKey').value,
        debugEnabled: document.getElementById('debugEnabled').checked
      }});
    }
    function testConnection() {
      vscode.postMessage({ command: 'testConnection' });
    }
  </script>
</body>
</html>`
  }

  static getSyncHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${SidebarView.getThemeStyles()}
    .info {
      border: 1px solid var(--vscode-textLink-foreground, #3794ff);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .warning {
      border: 1px solid var(--vscode-list-warningForeground, #cc7a00);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .warning a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    .warning a:hover { text-decoration: underline; }
    select { margin-bottom: 12px; }
    .file-list {
      margin-bottom: 12px;
      padding: 8px;
      border: 1px solid var(--vscode-widget-border, transparent);
      border-radius: 4px;
    }
    .file-list-item {
      padding: 4px 8px;
      margin: 4px 0;
      border-radius: 2px;
      font-size: 12px;
    }
    .status {
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: 13px;
      border: 1px solid transparent;
    }
    .status.success {
      border-color: var(--vscode-testing-iconPassedForeground, #4ec9b0);
      color: var(--vscode-testing-iconPassedForeground, #4ec9b0);
    }
    .status.error {
      border-color: var(--vscode-testing-iconFailedForeground, #f14c4c);
      color: var(--vscode-testing-iconFailedForeground, #f14c4c);
    }
    .status.loading {
      border-color: var(--vscode-textLink-foreground, #3794ff);
      color: var(--vscode-textLink-foreground, #3794ff);
    }
    .uploadBtn:disabled { opacity: 0.5; cursor: default; }
  </style>
</head>
<body>
  <h3>Sync to MeterSphere</h3>
  <div class="info">
    <p><strong>Export Java Spring Controllers to MeterSphere</strong></p>
    <p>Select .java files with @RestController or @Controller annotations.</p>
    <p>Project: <strong id="currentProject">Loading...</strong></p>
  </div>
  <div class="warning" id="javaExtWarning" style="display:none">
    <p>For Javadoc support, install: <a href="#" onclick="openExt('redhat.java')">Language Support for Java</a></p>
  </div>
  <div class="form-group">
    <label>Java Files</label>
    <button class="btn-secondary" onclick="selectFiles()">Select Java Files</button>
    <div class="file-list" id="fileList"><div style="font-style:italic">No files selected</div></div>
  </div>
  <label>Module (from Navigator)</label>
  <select id="moduleSelect"><option value="">Select module...</option></select>
  <label>Import Mode</label>
  <select id="importMode">
    <option value="incrementalMerge">Add New (incrementalMerge)</option>
    <option value="fullCoverage">Overwrite (fullCoverage)</option>
  </select>
  <label>Context Path (optional)</label>
  <input type="text" id="contextPath" placeholder="/api/v1">
  <label>Export Name (optional)</label>
  <input type="text" id="exportName" placeholder="Java APIs">
  <div class="checkbox-label">
    <input type="checkbox" id="syncCases" checked>
    <label style="margin:0;font-weight:normal">Sync Test Cases</label>
  </div>
  <div id="status"></div>
  <button class="btn-primary uploadBtn" id="uploadBtn" onclick="upload()">Upload to MeterSphere</button>
  <script>
    const vscode = acquireVsCodeApi();
    let selectedFiles = [];
    let isScanning = false;
    let uploadEnabled = false;

    vscode.postMessage({ command: 'loadProjectData' });

    function setUploadEnabled(enabled) {
      uploadEnabled = enabled;
      const btn = document.getElementById('uploadBtn');
      btn.disabled = !enabled;
      if (enabled) {
        btn.textContent = 'Upload to MeterSphere';
      } else {
        btn.textContent = isScanning ? 'Scanning...' : 'Upload to MeterSphere';
      }
    }

    function selectFiles() { vscode.postMessage({ command: 'selectJavaFiles' }); }
    function openExt(extId) { vscode.postMessage({ command: 'openExtension', data: extId }); }
    window.addEventListener('message', function(event) {
      const data = event.data;
      if (data.command === 'javaFilesSelected') {
        selectedFiles = data.files || [];
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = selectedFiles.length === 0 
          ? '<div style="font-style:italic">No files selected</div>'
          : selectedFiles.map(f => '<div class="file-list-item">' + f.split('/').pop() + '</div>').join('');
        if (selectedFiles.length > 0) uploadEnabled = true;
        setUploadEnabled(uploadEnabled);
      } else if (data.command === 'scanningStarted') {
        isScanning = true;
        selectedFiles = [];
        uploadEnabled = false;
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<div style="font-style:italic">Scanning...</div>';
        showStatus(data.data?.message || 'Scanning...', 'loading');
        setUploadEnabled(false);
      } else if (data.command === 'scanComplete') {
        isScanning = false;
        if (data.data?.error) {
          showStatus('Error: ' + (data.data?.error || 'Unknown'), 'error');
          selectedFiles = [];
          uploadEnabled = false;
          const fileList = document.getElementById('fileList');
          fileList.innerHTML = '<div style="font-style:italic">No files selected</div>';
        } else {
          selectedFiles = data.data?.files || [];
          showStatus('Found ' + selectedFiles.length + ' Java files', 'success');
          const fileList = document.getElementById('fileList');
          fileList.innerHTML = selectedFiles.length === 0 
            ? '<div style="font-style:italic">No files selected</div>'
            : selectedFiles.map(f => '<div class="file-list-item">' + f.split('/').pop() + '</div>').join('');
          uploadEnabled = selectedFiles.length > 0;
        }
        setUploadEnabled(uploadEnabled);
      } else if (data.command === 'projectLoaded') {
        document.getElementById('currentProject').textContent = data.name;
        const select = document.getElementById('moduleSelect');
        select.innerHTML = '<option value="">Select module...</option>' +
          (data.data?.modules || []).map(m => '<option value="' + m.id + '">' + m.name + '</option>').join('');
      } else if (data.command === 'loadProjectError') {
        document.getElementById('currentProject').textContent = 'Error';
        showStatus(data.data?.message || 'Failed to load project data', 'error');
      } else if (data.command === 'javaExtMissing') {
        document.getElementById('javaExtWarning').style.display = 'block';
      } else if (data.command === 'uploadProgress') {
        showStatus(data.data?.message || '', 'loading');
      } else if (data.command === 'uploadSuccess') {
        showStatus('Successfully uploaded ' + (data.data?.count || 0) + ' APIs to MeterSphere!', 'success');
      } else if (data.command === 'uploadError') {
        showStatus('Error: ' + (data.data?.message || 'Unknown error'), 'error');
      }
    });
    function showStatus(message, type) {
      document.getElementById('status').innerHTML = '<div class="status ' + type + '">' + message + '</div>';
    }
    function upload() {
      if (!uploadEnabled) return;
      const moduleId = document.getElementById('moduleSelect').value;
      if (!moduleId) { showStatus('Please select a module', 'error'); return; }
      if (selectedFiles.length === 0) { showStatus('Please select at least one Java file', 'error'); return; }
      vscode.postMessage({ command: 'uploadToMeterSphere', data: {
        files: selectedFiles,
        moduleId: moduleId,
        mode: document.getElementById('importMode').value,
        contextPath: document.getElementById('contextPath').value,
        exportName: document.getElementById('exportName').value,
        syncCase: document.getElementById('syncCases').checked,
      }});
    }
  </script>
</body>
</html>`
  }
}