import * as vscode from 'vscode'
import * as path from 'path'
import { NavigatorTreeDataProvider } from './navigatorTreeProvider'
import { NavigatorEngine } from './navigatorEngine'
import { NavigatorNode, NodeType } from './models/navigatorNode'
import { SettingsManager } from './settingsManager'
import { ConnectionManager, ConnectionState } from './connectionManager'
import { DebugLogger } from './debugLogger'
import { SidebarView } from './views/sidebarView'
import { WebViewController } from './webviewController'
import { JavaFileScanner } from './javaFileScanner'

export class CommandRouter {
  static registerAll(
    context: vscode.ExtensionContext,
    deps: {
      navigatorProvider: NavigatorTreeDataProvider
      httpRequest: unknown
      getActiveWebviewPanel: () => vscode.WebviewPanel | undefined
      connectionManager: ConnectionManager
    }
  ): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.refreshNavigator', async () => {
        deps.connectionManager.update(ConnectionState.Connecting)
        NavigatorEngine.clearCache()
        try {
          const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
          deps.navigatorProvider.setRoots(roots)
          deps.connectionManager.update(ConnectionState.Connected, SettingsManager.getMsUrl())
        } catch (error) {
          deps.connectionManager.update(ConnectionState.Disconnected, String(error))
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.openNavigator', () => {
        vscode.commands.executeCommand('metersphere.navigator.view.focus')
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.prefillFromNode', (node: NavigatorNode) => {
        const panel = deps.getActiveWebviewPanel()
        if (panel) {
          panel.webview.postMessage({
            command: 'prefill',
            name: node.name,
            method: 'GET',
            url: node.tooltip ?? '',
          })
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.configure', async () => {
        const url = await vscode.window.showInputBox({
          title: 'MeterSphere Server URL',
          placeholder: 'http://localhost:8080',
          prompt: 'Enter your MeterSphere server URL',
        })

        if (url === undefined || url.trim() === '') {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        const accessKey = await vscode.window.showInputBox({
          title: 'MeterSphere Access Key',
          prompt: 'Enter your MeterSphere Access Key',
        })

        if (accessKey === undefined) {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        const secretKey = await vscode.window.showInputBox({
          title: 'MeterSphere Secret Key',
          prompt: 'Enter your MeterSphere Secret Key',
        })

        if (secretKey === undefined) {
          vscode.window.showInformationMessage('Configuration cancelled')
          return
        }

        deps.connectionManager.update(ConnectionState.Connecting)

        const result = await deps.connectionManager.testConnection(
          url.trim(),
          accessKey.trim(),
          secretKey.trim()
        )

        if (!result.success) {
          deps.connectionManager.update(ConnectionState.Disconnected)
          try {
            vscode.window.showErrorMessage(
              'Connection failed: ' + (result.error ?? 'Unknown error')
            )
          } catch {
            // notification can throw if VSCode is shutting down
          }
          return
        }

        SettingsManager.setMsUrl(url.trim())
        SettingsManager.setAccessKey(accessKey.trim())
        SettingsManager.setSecretKey(secretKey.trim())

        deps.connectionManager.update(ConnectionState.Connected, result.url)
        NavigatorEngine.clearCache()
        const roots = await NavigatorEngine.discoverWorkspaces(deps.httpRequest as any)
        deps.navigatorProvider.setRoots(roots)
        vscode.window.showInformationMessage('MeterSphere configured successfully!')
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.testConnection', async () => {
        deps.connectionManager.update(ConnectionState.Connecting)
        const result = await deps.connectionManager.testConnection()
        if (result.success) {
          const url = result.url ?? ''
          let hostname = url
          try { hostname = new URL(url).hostname } catch { /* use as-is */ }
          vscode.window.showInformationMessage('Connected to ' + hostname)
        } else {
          vscode.window.showErrorMessage('Connection failed: ' + (result.error ?? 'Unknown error'))
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.statusBarMenu', async () => {
        const choice = await vscode.window.showQuickPick(
          [
            'Test Connection',
            'Configure...',
            'Refresh Navigator',
            'Open Navigator',
          ],
          { placeHolder: 'MeterSphere', title: 'MeterSphere' }
        )

        if (!choice) return

        switch (choice) {
          case 'Test Connection':
            vscode.commands.executeCommand('metersphere.testConnection')
            break
          case 'Configure...':
            vscode.commands.executeCommand('metersphere.configure')
            break
          case 'Refresh Navigator':
            vscode.commands.executeCommand('metersphere.refreshNavigator')
            break
          case 'Open Navigator':
            vscode.commands.executeCommand('metersphere.openNavigator')
            break
        }
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.toggleDebug', async () => {
        const config = vscode.workspace.getConfiguration('metersphere')
        const current = config.get<boolean>('debugEnabled') ?? false
        await config.update('debugEnabled', !current)
        const newState = !current ? 'ON' : 'OFF'
        DebugLogger.log('Command', `Debug mode toggled: ${newState}`, { enabled: !current })
        vscode.window.showInformationMessage(`Debug mode: ${newState}`)
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.showEnvironment', () => {
        SidebarView.showEnvironment()
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.showHistory', () => {
        SidebarView.showHistory()
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.showDebugger', () => {
        new WebViewController(context).open()
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.showSettings', () => {
        SidebarView.showSettings()
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.showSync', async () => {
        await SidebarView.showSync()
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.uploadFromEditor', async () => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showInformationMessage('No active editor file')
          return
        }
        const filePath = editor.document.uri.fsPath
        if (!filePath.endsWith('.java')) {
          vscode.window.showInformationMessage('Please select a Java file')
          return
        }
        await SidebarView.showSync()
        SidebarView.sendFilesToSync([filePath])
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.uploadFromFileExplorer', async (...args: unknown[]) => {
        let uris: vscode.Uri[] = []
        
        if (args.length > 0 && args[0] instanceof vscode.Uri) {
          uris = args as vscode.Uri[]
        } else if (args.length > 0 && Array.isArray(args[0])) {
          const firstArg = args[0]
          if (firstArg.length > 0 && firstArg[0] instanceof vscode.Uri) {
            uris = firstArg as vscode.Uri[]
          }
        }
        
        await SidebarView.showSync()
        
        if (uris.length === 0) {
          SidebarView.postMessage('scanComplete', { files: [], error: 'No files selected' })
          return
        }

        SidebarView.postMessage('scanningStarted', { message: 'Scanning...' })

        const filePaths = uris.map(u => (u as any).fsPath || u.path)
        const isFile = filePaths[0].endsWith('.java')
        let filesToUpload: string[] = []

        if (isFile && filePaths.length > 1) {
          filesToUpload = filePaths
        } else if (isFile) {
          const projectRoot = await JavaFileScanner.findProjectRoot(filePaths[0])
          if (projectRoot) {
            const searchPaths = JavaFileScanner.getCommonProjectPaths(projectRoot)
            for (const searchPath of searchPaths) {
              const found = await JavaFileScanner.findJavaFilesInProject(searchPath, (msg: string, count: number) => {
                SidebarView.postMessage('uploadProgress', { message: `${msg} (${count})` })
              })
              filesToUpload.push(...found)
            }
            filesToUpload = [...new Set(filesToUpload)]
          }
        } else {
          const scanPath = filePaths[0]
          const projectRoot = await JavaFileScanner.findProjectRoot(scanPath)
          if (!projectRoot) {
            SidebarView.postMessage('scanComplete', { files: [], error: 'Could not find project root' })
            return
          }
          const searchPaths = JavaFileScanner.getCommonProjectPaths(projectRoot)
          for (const searchPath of searchPaths) {
            const found = await JavaFileScanner.findJavaFilesInProject(searchPath, (msg: string, count: number) => {
              SidebarView.postMessage('uploadProgress', { message: `${msg} (${count})` })
            })
            filesToUpload.push(...found)
          }
          filesToUpload = [...new Set(filesToUpload)]
        }

        if (filesToUpload.length === 0) {
          SidebarView.postMessage('scanComplete', { files: [], error: 'No @RestController found' })
          return
        }

        SidebarView.postMessage('scanComplete', { files: filesToUpload })
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.uploadFromNavigator', async (node: NavigatorNode) => {
        if (!node.uri) {
          return
        }

        await SidebarView.showSync()
        SidebarView.postMessage('scanningStarted', { message: `Scanning: ${node.name}...` })

        const projectPath = node.uri.fsPath
        let filesToUpload: string[] = []

        if (node.type === NodeType.PROJECT) {
          const projectRoot = await JavaFileScanner.findProjectRoot(projectPath)
          if (!projectRoot) {
            SidebarView.postMessage('scanComplete', { files: [], error: 'Could not find project root (no pom.xml or build.gradle found)' })
            return
          }

          const searchPaths = JavaFileScanner.getCommonProjectPaths(projectRoot)
          for (const searchPath of searchPaths) {
            const foundFiles = await JavaFileScanner.findJavaFilesInProject(searchPath, (msg: string, count: number) => {
              SidebarView.postMessage('uploadProgress', { message: `${msg} (${count} files)` })
            })
            filesToUpload.push(...foundFiles)
          }

          filesToUpload = [...new Set(filesToUpload)]
        } else {
          filesToUpload = [projectPath]
        }

        if (filesToUpload.length === 0) {
          SidebarView.postMessage('scanComplete', { files: [], error: 'No @RestController or @Controller classes found' })
          return
        }

        SidebarView.postMessage('scanComplete', { files: filesToUpload })
      })
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('metersphere.syncFolder', async (uri: vscode.Uri) => {
        await SidebarView.showSync()
        SidebarView.postMessage('scanningStarted', { message: 'Ready. Choose scan scope...' })

        const filePath = (uri as any).fsPath || uri.path
        const isFile = filePath.endsWith('.java')
        let filesToUpload: string[] = []
        let scanPath = filePath

        if (isFile) {
          const selected = await vscode.window.showQuickPick(
            [
              { label: 'This file', description: 'Sync only this Java file', value: 'file' },
              { label: 'Parent folder', description: 'Scan parent folder recursively', value: 'folder' },
            ],
            { placeHolder: 'Choose scan scope' }
          )

          if (!selected) {
            SidebarView.postMessage('scanComplete', { files: [], error: 'Scan cancelled' })
            return
          }

          if (selected.value === 'file') {
            filesToUpload = [filePath]
          } else {
            scanPath = path.dirname(filePath)
          }
        }

        if (filesToUpload.length === 0) {
          const projectRoot = await JavaFileScanner.findProjectRoot(scanPath)
          if (!projectRoot) {
            SidebarView.postMessage('scanComplete', { files: [], error: 'Could not find project root' })
            return
          }

          const searchPaths = JavaFileScanner.getCommonProjectPaths(projectRoot)
          for (const searchPath of searchPaths) {
            const foundFiles = await JavaFileScanner.findJavaFilesInProject(searchPath, (msg: string, count: number) => {
              SidebarView.postMessage('uploadProgress', { message: `${msg} (${count} files)` })
            })
            filesToUpload.push(...foundFiles)
          }

          filesToUpload = [...new Set(filesToUpload)]
        }

        if (filesToUpload.length === 0) {
          SidebarView.postMessage('scanComplete', { files: [], error: 'No @RestController found' })
          return
        }

        SidebarView.postMessage('scanComplete', { files: filesToUpload })
      })
    )
  }

  static prefillFromNode(node: NavigatorNode, webview: vscode.Webview): Promise<boolean> {
    return webview.postMessage({
      command: 'prefill',
      name: node.name,
      method: 'GET',
      url: node.tooltip ?? '',
    })
  }
}
