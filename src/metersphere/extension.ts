import * as vscode from 'vscode'
import { WebViewController } from './webviewController'

export function activate(context: vscode.ExtensionContext) {
  const wvc = new WebViewController(context)
  context.subscriptions.push(vscode.commands.registerCommand('metersphere.openDebugger', () => wvc.open()))
}

export function deactivate() {}
