import * as vscode from 'vscode';
import { ConfigService } from '../services/config';
import { MsApiClient } from '../services/api';
import { Logger } from '../utils/logger';
import { MSWorkSpace, MSProject, MSModule } from '../types';

const logger = Logger.getInstance('connect');

export function registerConnectCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('metersphere.connect', async () => {
    try {
      const config = ConfigService.getInstance();
      const settings = config.getConfig();
      
      if (!settings.url || !settings.accessKey || !settings.secretKey) {
        vscode.window.showErrorMessage('Please configure MeterSphere URL, accessKey, and secretKey first.');
        await vscode.commands.executeCommand('metersphere.configure');
        return;
      }
      
      // Create API client
      const client = new MsApiClient(settings.url, settings.accessKey, settings.secretKey);
      
      // Test connection
      const connected = await client.testConnection();
      
      if (!connected) {
        vscode.window.showErrorMessage('Failed to connect to MeterSphere. Check your credentials.');
        return;
      }
      
      // Fetch workspaces
      const workspaces = await client.getWorkSpaces();
      
      if (workspaces.length === 0) {
        vscode.window.showWarningMessage('No workspaces found.');
        return;
      }
      
      // Show workspace picker
      const workspace = await vscode.window.showQuickPick(
        workspaces.map(ws => ({ label: ws.name, value: ws })),
        { placeHolder: 'Select Workspace' }
      );
      
      if (!workspace) return;
      
      // Fetch projects
      const projects = await client.getProjects(workspace.value.id);
      
      const project = await vscode.window.showQuickPick(
        projects.map(p => ({ label: p.name, value: p })),
        { placeHolder: 'Select Project' }
      );
      
      if (!project) return;
      
      // Fetch modules
      const modules = await client.getModules(project.value.id);
      
      const module = await vscode.window.showQuickPick(
        modules.map(m => ({ label: m.name, value: m })),
        { placeHolder: 'Select Module' }
      );
      
      if (!module) return;
      
      // Save selections to config
      await config.updateConfig('workspaceId', workspace.value.id);
      await config.updateConfig('projectId', project.value.id);
      await config.updateConfig('moduleId', module.value.id);
      
      vscode.window.showInformationMessage(`Connected to ${workspace.value.name} > ${project.value.name} > ${module.value.name}`);
      logger.info(`Connected to workspace: ${workspace.value.id}, project: ${project.value.id}, module: ${module.value.id}`);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Connection failed: ${message}`);
      logger.error('Connection error:', error);
    }
  });
  
  context.subscriptions.push(command);
}
