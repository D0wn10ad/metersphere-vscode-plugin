import * as vscode from 'vscode';
import { ConfigService } from '../services/config';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance('configure');

export function registerConfigureCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('metersphere.configure', async () => {
    const config = ConfigService.getInstance();
    const wsConfig = config.getWsConfig();
    
    // Open settings
    await vscode.commands.executeCommand('workbench.action.openSettings', 'metersphere');
    
    vscode.window.showInformationMessage('Configure MeterSphere settings in the settings panel.');
    logger.info('Configure command executed');
  });
  
  context.subscriptions.push(command);
}
