import * as vscode from 'vscode';
import { MeterSphereConfig } from '../types';

const CONFIG_PREFIX = 'metersphere';

export class ConfigService {
  private static instance: ConfigService;
  
  private constructor() {}
  
  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }
  
  getConfig(): MeterSphereConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    return {
      url: config.get<string>('url', 'http://localhost:8080'),
      accessKey: config.get<string>('accessKey', ''),
      secretKey: config.get<string>('secretKey', ''),
      contextPath: config.get<string>('contextPath', ''),
      exportMode: config.get<'fullCoverage' | 'incrementalMerge'>('exportMode', 'incrementalMerge'),
      useJavadoc: config.get<boolean>('useJavadoc', true),
      nestingDepth: config.get<number>('nestingDepth', 3)
    };
  }
  
  async updateConfig(key: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
  
  getWsConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_PREFIX);
  }
}
