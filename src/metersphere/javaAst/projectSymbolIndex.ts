/**
 * Project symbol index for cross-file DTO resolution.
 *
 * Resolution order (deterministic):
 * (1) same-file registration — types registered from the file being parsed;
 * (2) the time-boxed `vscode.executeWorkspaceSymbolProvider` LSP call — take the
 *     first SymbolInformation whose kind is Class/Interface/Struct/Enum, read its
 *     `.location.uri`, and CST-parse that file's fields;
 * (3) a bounded on-disk scan of the `getCommonProjectPaths` roots (same skip list
 *     as javaFileScanner) until the class is found.
 *
 * Results cache in a Map. Every LSP call is time-boxed (never blocks the upload
 * indefinitely); a rejected/failed LSP call falls through to the scan. A
 * genuinely-missing type returns undefined — that undefined IS the
 * `javaExtMissingSchema` condition (T11/T13).
 */

import * as fs from 'fs';
import * as path from 'path';
import { JavaFileScanner } from '../javaFileScanner';
import { CstNode, CstToken, findAll, findFirst, text } from './cstWalk';
import { loadJavaParser } from './loadJavaParser';

export interface ResolvedField {
  name: string;
  javaType: string;
}

export interface ResolvedDto {
  name: string;
  fields: ResolvedField[];
}

const SYMBOL_KIND_NAMES = ['Class', 'Interface', 'Struct', 'Enum'];
// VSCode SymbolKind numeric values for the same set (mocks may use either form).
const SYMBOL_KIND_NUMBERS = [4, 10, 23, 9];

/** Directory-skip list, identical to javaFileScanner.walkDirectory. */
const SKIP_DIRS = ['node_modules', '.git', 'target', 'build'];

function isTypeKind(kind: unknown): boolean {
  if (typeof kind === 'string') {
    return SYMBOL_KIND_NAMES.includes(kind);
  }
  if (typeof kind === 'number') {
    return SYMBOL_KIND_NUMBERS.includes(kind);
  }
  return false;
}

/** Race a promise against a timeout; the timeout wins with undefined. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

export class ProjectSymbolIndex {
  private readonly cache = new Map<string, ResolvedDto>();
  private readonly localTypes = new Map<string, ResolvedDto>();
  private lastUri: string | undefined;

  /**
   * @param lspTimeoutMs - Cap for the symbol-provider call (the cold-index guard:
   * on timeout/empty the bounded scan proceeds). Defaults to 2000ms.
   */
  constructor(private readonly lspTimeoutMs = 2000) {}

  /** Register every top-level type (with its fields) declared in `source`. */
  register(source: string, uri: string): void {
    this.lastUri = uri;
    const tree = loadJavaParser().parse(source) as unknown as CstNode;
    const ocu = findFirst(tree, 'ordinaryCompilationUnit');
    if (!ocu) {
      return;
    }
    const typeDecls = (ocu.children['typeDeclaration'] || []) as CstNode[];
    for (const td of typeDecls) {
      const cd = findFirst(td, 'classDeclaration');
      if (!cd) {
        continue;
      }
      const ncd = findFirst(cd, 'normalClassDeclaration');
      const nameTok = ncd
        ? (findFirst(ncd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined)
        : undefined;
      if (!nameTok || !ncd) {
        continue;
      }
      const dto = this.extractFields(ncd, source, nameTok.image);
      if (dto) {
        this.localTypes.set(nameTok.image, dto);
      }
    }
  }

  /** Resolve a type name through registration → LSP → bounded scan, caching hits. */
  async resolve(typeName: string): Promise<ResolvedDto | undefined> {
    const cached = this.cache.get(typeName);
    if (cached) {
      return cached;
    }

    const local = this.localTypes.get(typeName);
    if (local) {
      this.cache.set(typeName, local);
      return local;
    }

    const viaLsp = await this.resolveViaLsp(typeName);
    if (viaLsp) {
      this.cache.set(typeName, viaLsp);
      return viaLsp;
    }

    const viaScan = await this.resolveViaScan(typeName);
    if (viaScan) {
      this.cache.set(typeName, viaScan);
      return viaScan;
    }

    return undefined;
  }

  /**
   * Synchronous lookup through registration + cache ONLY (no LSP, no scan) — for
   * the sync OpenApiBuilder.build path, whose signature cannot await.
   */
  resolveSync(typeName: string): ResolvedDto | undefined {
    return this.cache.get(typeName) ?? this.localTypes.get(typeName);
  }

  /** Time-boxed LSP symbol-provider resolution. A rejected call falls through. */
  private async resolveViaLsp(typeName: string): Promise<ResolvedDto | undefined> {
    try {
      const { commands } = require('vscode');
      const symbols = (await withTimeout(
        Promise.resolve(commands.executeCommand('vscode.executeWorkspaceSymbolProvider', typeName)),
        this.lspTimeoutMs,
      )) as Array<{ name: string; kind: unknown; location?: { uri?: unknown } }> | undefined;

      if (!symbols || symbols.length === 0) {
        return undefined;
      }
      const hit = symbols.find((s) => isTypeKind(s.kind));
      const uri = hit?.location?.uri;
      if (!uri) {
        return undefined;
      }
      const uriText =
        typeof uri === 'string' ? uri : ((uri as { fsPath?: string }).fsPath ?? String(uri));
      const source = await this.readUriText(uriText);
      if (source === undefined) {
        return undefined;
      }
      return this.parseDtoFromSource(source, typeName);
    } catch {
      return undefined; // LSP rejected/failed — fall through to the scan
    }
  }

  /** Bounded on-disk scan of the getCommonProjectPaths roots (same skip list). */
  private async resolveViaScan(typeName: string): Promise<ResolvedDto | undefined> {
    if (!this.lastUri) {
      return undefined;
    }
    const fsPath = this.lastUri.replace(/^file:\/\//, '');
    const root = await JavaFileScanner.findProjectRoot(fsPath);
    if (!root) {
      return undefined;
    }
    for (const rootDir of JavaFileScanner.getCommonProjectPaths(root)) {
      for (const file of this.listJavaFiles(rootDir, 0)) {
        let source: string;
        try {
          source = fs.readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        // Quick pre-filter; the CST parse below confirms the fields.
        if (!new RegExp(`(?:class|interface|enum|record)\\s+${typeName}\\b`).test(source)) {
          continue;
        }
        const dto = this.parseDtoFromSource(source, typeName);
        if (dto) {
          return dto;
        }
      }
    }
    return undefined;
  }

  /** Depth-bounded .java file listing (skip list identical to javaFileScanner). */
  private listJavaFiles(dir: string, depth: number): string[] {
    if (depth > 10) {
      return [];
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.includes(entry.name)) {
          continue;
        }
        out.push(...this.listJavaFiles(full, depth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        out.push(full);
      }
    }
    return out;
  }

  private async readUriText(uriText: string): Promise<string | undefined> {
    const { workspace } = require('vscode');
    try {
      const doc = await workspace.openTextDocument(uriText);
      return doc.getText();
    } catch {
      return undefined;
    }
  }

  /** CST-parse `source` and return the fields of the type named `typeName`. */
  private parseDtoFromSource(source: string, typeName: string): ResolvedDto | undefined {
    const tree = loadJavaParser().parse(source) as unknown as CstNode;
    const ocu = findFirst(tree, 'ordinaryCompilationUnit');
    if (!ocu) {
      return undefined;
    }
    const typeDecls = (ocu.children['typeDeclaration'] || []) as CstNode[];
    for (const td of typeDecls) {
      const cd = findFirst(td, 'classDeclaration');
      if (!cd) {
        continue;
      }
      const ncd = findFirst(cd, 'normalClassDeclaration');
      const nameTok = ncd
        ? (findFirst(ncd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined)
        : undefined;
      if (nameTok?.image !== typeName || !ncd) {
        continue;
      }
      return this.extractFields(ncd, source, typeName);
    }
    return undefined;
  }

  /** Extract the field list from a normalClassDeclaration node. */
  private extractFields(ncd: CstNode, source: string, typeName: string): ResolvedDto {
    const classBody = findFirst(ncd, 'classBody');
    const fields: ResolvedField[] = [];
    if (classBody) {
      const bodyDecls = (classBody.children['classBodyDeclaration'] || []) as CstNode[];
      for (const cbd of bodyDecls) {
        const cmd = findFirst(cbd, 'classMemberDeclaration');
        const fd = cmd ? findFirst(cmd, 'fieldDeclaration') : undefined;
        if (!fd) {
          continue;
        }
        const ut = findFirst(fd, 'unannType');
        const javaType = ut ? text(ut, source).trim() : '';
        const vdl = findFirst(fd, 'variableDeclaratorList');
        const declarators = vdl ? findAll(vdl, 'variableDeclarator') : [];
        for (const d of declarators) {
          const idTok = findFirst(d, 'variableDeclaratorId')?.children['Identifier']?.[0] as
            | CstToken
            | undefined;
          if (idTok) {
            fields.push({ name: idTok.image, javaType });
          }
        }
      }
    }
    return { name: typeName, fields };
  }
}
