import * as vscode from 'vscode'
import { activate as metersphereActivate, deactivate as metersphereDeactivate } from './metersphere/extension'

export function activate(context: vscode.ExtensionContext) {
  return metersphereActivate(context)
}

export function deactivate() {
  return metersphereDeactivate()
}
