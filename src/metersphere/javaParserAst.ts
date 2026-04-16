import { parse } from 'java-ast';
import * as vscode from 'vscode';
import { ParsedApi, ParsedParameter, ParsedClass, ParseResult } from './javaParser';

export class JavaParserAst {
  static parseSource(code: string, uri: string): ParseResult {
    const { JavaParser } = require('./javaParser');
    return JavaParser.parseSource(code, uri);
  }
  
  static async extractJavadoc(uri: vscode.Uri, position: vscode.Position): Promise<string | null> {
    const { commands, extensions } = require('vscode');
    
    const javaExts = ['redhat.java', 'georgewfraser.vscode-javac'];
    const hasJavaExt = extensions.all.some((ext: vscode.Extension<unknown>) => javaExts.includes(ext.id));
    
    if (!hasJavaExt) {
      return null;
    }
    
    try {
      const hovers = await commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        position
      ) as vscode.Hover[];
      
      if (hovers && hovers[0]?.contents) {
        const contents = hovers[0].contents;
        const md = Array.isArray(contents) ? contents[0] : contents;
        const lines = md.value.split('\n');
        return lines[0] || null;
      }
    } catch {
      // Hover failed
    }
    
    return null;
  }
  
  static async enhanceWithJavadoc(
    parseResult: ParseResult,
    uri: string
  ): Promise<ParseResult> {
    const { Uri, Position } = require('vscode');
    const docUri = Uri.parse(uri);
    
    for (const api of parseResult.apis) {
      if (api.summary && api.position) {
        const javadoc = await JavaParserAst.extractJavadoc(docUri, new Position(api.position.line, api.position.column));
        if (javadoc) {
          api.summary = javadoc;
        }
      }
    }
    
    return parseResult;
  }
}