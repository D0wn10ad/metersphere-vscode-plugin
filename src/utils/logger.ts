import * as vscode from 'vscode';

export class Logger {
  private static outputChannel: vscode.OutputChannel;
  private name: string;
  
  private constructor(name: string) {
    this.name = name;
    if (!Logger.outputChannel) {
      Logger.outputChannel = vscode.window.createOutputChannel('MeterSphere');
    }
  }
  
  static getInstance(name: string): Logger {
    return new Logger(name);
  }
  
  info(message: string, ...args: any[]): void {
    this.log('INFO', message, args);
  }
  
  warn(message: string, ...args: any[]): void {
    this.log('WARN', message, args);
  }
  
  error(message: string, ...args: any[]): void {
    this.log('ERROR', message, args);
  }
  
  private log(level: string, message: string, args: any[]): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level}] [${this.name}] ${message} ${args.length ? JSON.stringify(args) : ''}`;
    console.log(formatted);
    Logger.outputChannel.appendLine(formatted);
  }
  
  static show(): void {
    Logger.outputChannel.show();
  }
}
