import * as vscode from 'vscode'

let currentContext: vscode.ExtensionContext | null = null

export class ContextHolder {
  static setContext(context: vscode.ExtensionContext): void {
    currentContext = context
  }

  static getContext(): vscode.ExtensionContext {
    if (!currentContext) {
      throw new Error('Extension context not initialized')
    }
    return currentContext
  }
}