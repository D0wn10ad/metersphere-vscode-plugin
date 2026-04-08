import * as vscode from 'vscode'

export class DebugLogger {
  private static outputChannel: vscode.OutputChannel | undefined

  private static getChannel(): vscode.OutputChannel {
    if (!DebugLogger.outputChannel) {
      DebugLogger.outputChannel = vscode.window.createOutputChannel('MeterSphere Debug')
    }
    return DebugLogger.outputChannel
  }

  static isEnabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>('metersphere.debugEnabled') ?? false
  }

  static log(category: string, message: string, data?: unknown): void {
    if (!DebugLogger.isEnabled()) return

    const channel = DebugLogger.getChannel()
    const timestamp = new Date().toISOString()
    channel.appendLine(`[${timestamp}] [${category}] ${message}`)
    if (data !== undefined) {
      channel.appendLine(`  Data: ${JSON.stringify(data, null, 2)}`)
    }
  }

  static error(category: string, message: string, error?: unknown): void {
    if (!DebugLogger.isEnabled()) return

    const channel = DebugLogger.getChannel()
    const timestamp = new Date().toISOString()
    channel.appendLine(`[${timestamp}] [${category}] ERROR: ${message}`)
    if (error !== undefined) {
      channel.appendLine(`  Error: ${String(error)}`)
      if (error instanceof Error && error.stack) {
        channel.appendLine(`  Stack: ${error.stack}`)
      }
    }
    channel.show()
  }

  static show(): void {
    if (!DebugLogger.isEnabled()) return
    DebugLogger.getChannel().show()
  }
}