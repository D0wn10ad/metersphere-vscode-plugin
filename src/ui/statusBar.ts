import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;

export function createStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  
  statusBarItem.text = '$(plug) MeterSphere: Disconnected';
  statusBarItem.command = 'metersphere.connect';
  statusBarItem.tooltip = 'Click to connect to MeterSphere';
  statusBarItem.show();
  
  context.subscriptions.push(statusBarItem);
}

export async function updateStatusBar(connected: boolean): Promise<void> {
  if (!statusBarItem) return;
  
  if (connected) {
    statusBarItem.text = '$(plug) MeterSphere: Connected';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.successBackground');
  } else {
    statusBarItem.text = '$(plug) MeterSphere: Disconnected';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }
}
