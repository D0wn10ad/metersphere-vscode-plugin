import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigService } from '../services/config';
import { MsApiClient } from '../services/api';
import { Exporter } from '../services/exporter';
import { Logger } from '../utils/logger';

const logger = Logger.getInstance('export');

export function registerExportCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('metersphere.export', async (uri?: vscode.Uri) => {
    try {
      const config = ConfigService.getInstance();
      const settings = config.getConfig();
      const wsConfig = config.getWsConfig();
      
      if (!settings.url || !settings.accessKey || !settings.secretKey) {
        vscode.window.showErrorMessage('Please configure and connect to MeterSphere first.');
        await vscode.commands.executeCommand('metersphere.connect');
        return;
      }
      
      // Get file to export
      let fileUri = uri;
      if (!fileUri) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          fileUri = editor.document.uri;
        }
      }
      
      if (!fileUri) {
        vscode.window.showWarningMessage('No Java file selected.');
        return;
      }
      
      // Read file content
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const code = doc.getText();
      
      // Parse and generate collection
      const exporter = new Exporter();
      const projectName = path.basename(fileUri.fsPath, '.java');
      const collection = await exporter.parseAndExport(code, projectName);
      
      // Check if module is configured
      const moduleId = wsConfig.get<string>('moduleId');
      const projectId = wsConfig.get<string>('projectId');
      
      if (!moduleId || !projectId) {
        vscode.window.showWarningMessage('Please run "MeterSphere: Connect" first to select project and module.');
        await vscode.commands.executeCommand('metersphere.connect');
        return;
      }
      
      // Upload to MeterSphere
      const client = new MsApiClient(settings.url, settings.accessKey, settings.secretKey);
      
      const collectionJson = JSON.stringify(collection, null, 2);
      const buffer = Buffer.from(collectionJson, 'utf-8');
      
      const params = {
        moduleId,
        projectId,
        mode: settings.exportMode === 'fullCoverage' ? 'fullCoverage' : 'incrementalMerge',
        platform: 'Postman',
        model: 'definition',
        protocol: 'HTTP',
        origin: 'vscode'
      };
      
      const success = await client.uploadDefinition(buffer, params);
      
      if (success) {
        vscode.window.showInformationMessage(`Successfully exported ${projectName} to MeterSphere!`);
        logger.info(`Exported ${projectName} to module ${moduleId}`);
      } else {
        vscode.window.showErrorMessage('Failed to export to MeterSphere.');
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Export failed: ${message}`);
      logger.error('Export error:', error);
    }
  });
  
  context.subscriptions.push(command);
}
