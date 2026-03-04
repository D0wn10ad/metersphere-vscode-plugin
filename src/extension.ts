import * as vscode from 'vscode';
import { registerConfigureCommand } from './commands/configure';
import { registerConnectCommand } from './commands/connect';
import { registerExportCommand } from './commands/export';
import { createStatusBar } from './ui/statusBar';
import { Logger } from './utils/logger';

const logger = Logger.getInstance('extension');

export function activate(context: vscode.ExtensionContext): void {
  logger.info('MeterSphere extension activating...');
  
  // Register commands
  registerConfigureCommand(context);
  registerConnectCommand(context);
  registerExportCommand(context);
  
  // Create status bar
  createStatusBar(context);
  
  logger.info('MeterSphere extension activated');
}

export function deactivate(): void {
  logger.info('MeterSphere extension deactivated');
}
