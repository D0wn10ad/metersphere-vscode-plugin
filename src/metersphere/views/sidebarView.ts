import * as vscode from 'vscode'
import { SettingsManager } from '../settingsManager'
import { JavaParser } from '../javaParser'
import { SyncService } from '../syncService'
import FormData from 'form-data'
import { DebugLogger } from '../debugLogger'

export class SidebarView {
  private static panel: vscode.WebviewPanel | undefined = undefined

  static showEnvironment(): void {
    SidebarView.show('environment', 'MeterSphere - Environment', SidebarView.getEnvironmentHtml())
  }

  static showHistory(): void {
    SidebarView.show('history', 'MeterSphere - History', SidebarView.getHistoryHtml())
  }

  static showSettings(): void {
    SidebarView.show('settings', 'MeterSphere - Settings', SidebarView.getSettingsHtml())
  }

  static async showSync(): Promise<void> {
    SidebarView.show('sync', 'MeterSphere - Sync', SidebarView.getSyncHtml())
    
    const msUrl = SettingsManager.getMsUrl()
    const accessKey = SettingsManager.getAccessKey()
    const secretKey = SettingsManager.getSecretKey()
    if (!msUrl || !accessKey || !secretKey) {
      return
    }
    try {
      const headers = SettingsManager.buildAuthHeaders('application/json')
      const workspaceId = SettingsManager.getWorkspaceId()
      const projectId = SettingsManager.getProjectId()
      
      DebugLogger.log('Sync', 'Starting module load', {
        workspaceId: workspaceId ?? 'none',
        projectId: projectId ?? 'none'
      })

      const projectsResp = await fetch(`${msUrl}/api/project/list/related`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceIds: [workspaceId] })
      })
      const rawJson = await projectsResp.json()
      const projects = rawJson.success && rawJson.data ? rawJson.data : []

      if (projects.length > 0) {
        const savedProjectId = SettingsManager.getProjectId()
        let targetProject = projects[0]
        if (savedProjectId) {
          const found = projects.find((p: any) => p.id === savedProjectId)
          if (found) targetProject = found
        }

        const modulesResp = await fetch(`${msUrl}/api/api/module/list/${targetProject.id}/HTTP`, { headers })
        const modulesData = await modulesResp.json()
        const modules = modulesData.data || []
        const fullModules = modules.map((m: any) => ({
          id: `${targetProject.id}:${m.id}`,
          name: m.name,
        }))

        SidebarView.panel?.webview.postMessage({
          command: 'projectLoaded',
          name: targetProject.name,
          data: { modules: fullModules }
        })
      }
    } catch (error) {
      DebugLogger.error('Sync', 'Failed to load modules', error)
    }
  }

  static sendFilesToSync(filePaths: string[]): void {
    if (SidebarView.panel) {
      SidebarView.panel.webview.postMessage({
        command: 'javaFilesSelected',
        files: filePaths,
      })
    }
  }

  static postMessage(command: string, data?: Record<string, unknown>): void {
    if (SidebarView.panel) {
      SidebarView.panel.webview.postMessage({ command, data })
    }
  }

  private static show(viewId: string, title: string, html: string): void {
    if (SidebarView.panel && SidebarView.panel.viewType !== `metersphere.${viewId}`) {
      SidebarView.panel.dispose()
      SidebarView.panel = undefined
    }

    if (SidebarView.panel) {
      SidebarView.panel.reveal(vscode.ViewColumn.One)
      SidebarView.panel.webview.html = html
    } else {
      SidebarView.panel = vscode.window.createWebviewPanel(`metersphere.${viewId}`, title, vscode.ViewColumn.One, { enableScripts: true })
      SidebarView.panel.webview.html = html
      SidebarView.panel.onDidDispose(() => {
        SidebarView.panel = undefined
      })
    }

    SidebarView.panel.webview.onDidReceiveMessage(async (message) => {
      await SidebarView.handleMessage(message as any)
    })
  }

  private static async handleMessage(message: { command: string; data?: any }): Promise<void> {
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
          SidebarView.panel?.webview.postMessage({
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
    }
  }

  private static async handleUpload(uploadData: any): Promise<void> {
    SidebarView.panel?.webview.postMessage({ command: 'uploadProgress', data: { message: 'Parsing Java files...' } })
    
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
        SidebarView.panel?.webview.postMessage({ command: 'uploadError', data: { message: 'No @RestController or @Controller classes found in selected files' } })
        return
      }

      const javaExts = ['redhat.java', 'georgewfraser.vscode-javac']
      const hasJavaExt = vscode.extensions.all.some((ext: any) => javaExts.includes(ext.id))
      
      if (!hasJavaExt) {
        SidebarView.panel?.webview.postMessage({ command: 'javaExtMissing' })
      } else {
        try {
          allApis = await JavaParser.enhanceWithJavadoc(allApis, uploadData.files[0])
        } catch {
          // Javadoc enhancement failed, continue without it
        }
      }

      SidebarView.panel?.webview.postMessage({ command: 'uploadProgress', data: { message: 'Converting to Postman format...' } })

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
        SidebarView.panel?.webview.postMessage({ command: 'uploadError', data: { message: 'MeterSphere credentials not configured. Please check Settings.' } })
        return
      }

      SidebarView.panel?.webview.postMessage({ command: 'uploadProgress', data: { message: 'Uploading to MeterSphere...' } })

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
        SidebarView.panel?.webview.postMessage({ command: 'uploadSuccess', data: { count: allApis.apis.length } })
      } else {
        SidebarView.panel?.webview.postMessage({ command: 'uploadError', data: { message: `Upload failed: ${response.status} ${responseText}` } })
      }
    } catch (error) {
      DebugLogger.error('Sync', 'Upload failed', error)
      SidebarView.panel?.webview.postMessage({ command: 'uploadError', data: { message: `Error: ${error instanceof Error ? error.message : String(error)}` } })
    }
  }

  static getEnvironmentHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; margin: 0; }
    h3 { margin: 0 0 16px 0; }
    .empty { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h3>Environment</h3>
  <p class="empty">No environments configured yet.</p>
</body>
</html>`
  }

  static getHistoryHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; margin: 0; }
    h3 { margin: 0 0 16px 0; }
    .empty { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h3>Request History</h3>
  <p class="empty">No requests yet.</p>
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
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; margin: 0; }
    h3 { margin: 0 0 16px 0; }
    .form-group { margin-bottom: 16px; }
    label { display: block; margin-bottom: 4px; font-weight: 500; }
    input[type="text"], input[type="password"] { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
    button { padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; font-weight: 500; }
    .btn-primary { background: #007acc; color: white; margin-right: 8px; }
    .btn-secondary { background: #6c757d; color: white; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .checkbox-label input { width: auto; margin: 0; }
  </style>
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
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; margin: 0; }
    h3 { margin: 0 0 16px 0; }
    label { display: block; margin-bottom: 4px; font-weight: 500; }
    select, input[type="text"] { width: 100%; padding: 8px; margin-bottom: 12px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
    .info { background: rgba(0,122,204,0.1); border: 1px solid #007acc; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
    .warning { background: rgba(204,122,0,0.1); border: 1px solid #cc7a00; border-radius: 6px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
    .warning a { color: #007acc; text-decoration: none; }
    button { padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; font-weight: 500; font-size: 13px; }
    .btn-primary { background: #007acc; color: white; }
    .btn-secondary { background: #6c757d; color: white; margin-right: 8px; }
    .form-group { margin-bottom: 16px; }
    .file-list { margin-bottom: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
    .file-list-item { padding: 4px 8px; margin: 4px 0; background: white; border-radius: 2px; font-size: 12px; }
    .status { padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
    .status.success { background: #d4edda; color: #155724; }
    .status.error { background: #f8d7da; color: #721c24; }
    .status.loading { background: #fff3cd; color: #856404; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .checkbox-label input { width: auto; margin: 0; }
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
    <div class="file-list" id="fileList"><div style="color:#666;font-style:italic">No files selected</div></div>
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
  <button class="btn-primary" id="uploadBtn" onclick="upload()">Upload to MeterSphere</button>
  <script>
    const vscode = acquireVsCodeApi();
    let selectedFiles = [];
    let isScanning = false;
    let uploadEnabled = false;

    function setUploadEnabled(enabled) {
      uploadEnabled = enabled;
      const btn = document.getElementById('uploadBtn');
      if (enabled) {
        btn.disabled = false;
        btn.textContent = 'Upload to MeterSphere';
        btn.className = 'btn-primary';
      } else {
        btn.disabled = true;
        btn.textContent = isScanning ? 'Scanning...' : 'Upload to MeterSphere';
        btn.className = 'btn-primary';
        btn.style.opacity = '0.6';
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
          ? '<div style="color:#666;font-style:italic">No files selected</div>'
          : selectedFiles.map(f => '<div class="file-list-item">' + f.split('/').pop() + '</div>').join('');
        if (selectedFiles.length > 0) uploadEnabled = true;
        setUploadEnabled(uploadEnabled);
      } else if (data.command === 'scanningStarted') {
        isScanning = true;
        selectedFiles = [];
        uploadEnabled = false;
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<div style="color:#666;font-style:italic">Scanning...</div>';
        showStatus(data.data?.message || 'Scanning...', 'loading');
        setUploadEnabled(false);
      } else if (data.command === 'scanComplete') {
        isScanning = false;
        if (data.data?.error) {
          showStatus('Error: ' + (data.data?.error || 'Unknown'), 'error');
          selectedFiles = [];
          uploadEnabled = false;
          const fileList = document.getElementById('fileList');
          fileList.innerHTML = '<div style="color:#666;font-style:italic">No files selected</div>';
        } else {
          selectedFiles = data.data?.files || [];
          showStatus('Found ' + selectedFiles.length + ' Java files', 'success');
          const fileList = document.getElementById('fileList');
          fileList.innerHTML = selectedFiles.length === 0 
            ? '<div style="color:#666;font-style:italic">No files selected</div>'
            : selectedFiles.map(f => '<div class="file-list-item">' + f.split('/').pop() + '</div>').join('');
          uploadEnabled = selectedFiles.length > 0;
        }
        setUploadEnabled(uploadEnabled);
      } else if (data.command === 'projectLoaded') {
        document.getElementById('currentProject').textContent = data.name;
        const select = document.getElementById('moduleSelect');
        select.innerHTML = '<option value="">Select module...</option>' +
          (data.data?.modules || []).map(m => '<option value="' + m.id + '">' + m.name + '</option>').join('');
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