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
import { annotationsFromFieldDeclaration, annotationsFromModifiers, methodReturnType } from './cstJavaParser';
import { readAnnotation } from './annotationReader';
import { ValidationConstraint } from '../javaParser';
import { applyValidation } from '../validationSchema';

export interface ResolvedField {
  name: string;
  javaType: string;
  validation?: ValidationConstraint[];
  nullable?: boolean;
  description?: string;
  kind?: 'class' | 'enum' | 'record' | 'interface';
  values?: string[];
}

export interface ResolvedDto {
  name: string;
  fields: ResolvedField[];
  kind?: 'class' | 'enum' | 'record' | 'interface';
  values?: string[];
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
      // java-parser wraps enum/record declarations inside a classDeclaration node
      // (typeDeclaration → classDeclaration → enumDeclaration|recordDeclaration), so the
      // class path only applies when a normalClassDeclaration is actually present.
      const cd = findFirst(td, 'classDeclaration');
      const ncd = cd ? findFirst(cd, 'normalClassDeclaration') : undefined;
      if (cd && ncd) {
        const nameTok = findFirst(ncd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined;
        if (nameTok) {
          const dto = this.extractFields(ncd, source, nameTok.image);
          if (dto) {
            this.localTypes.set(nameTok.image, dto);
          }
        }
        continue;
      }
      const ed = findFirst(td, 'enumDeclaration');
      if (ed) {
        const nameTok = findFirst(ed, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined;
        if (nameTok) {
          const dto = this.extractEnum(ed, source, nameTok.image);
          if (dto) {
            this.localTypes.set(nameTok.image, dto);
          }
        }
        continue;
      }
      const rd = findFirst(td, 'recordDeclaration');
      if (rd) {
        const nameTok = findFirst(rd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined;
        if (nameTok) {
          const dto = this.extractRecord(rd, source, nameTok.image);
          if (dto) {
            this.localTypes.set(nameTok.image, dto);
          }
        }
        continue;
      }
      const idec = findFirst(td, 'interfaceDeclaration');
      if (idec) {
        const nid = findFirst(idec, 'normalInterfaceDeclaration');
        const nameTok = nid
          ? (findFirst(nid, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined)
          : undefined;
        if (nameTok && nid) {
          const dto = this.extractInterface(nid, source, nameTok.image);
          if (dto) {
            this.localTypes.set(nameTok.image, dto);
          }
        }
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
      // Same wrapper quirk as register(): enum/record live inside classDeclaration.
      const cd = findFirst(td, 'classDeclaration');
      const ncd = cd ? findFirst(cd, 'normalClassDeclaration') : undefined;
      if (cd && ncd) {
        const nameTok = findFirst(ncd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined;
        if (nameTok?.image === typeName) {
          return this.extractFields(ncd, source, typeName);
        }
        continue;
      }
      const ed = findFirst(td, 'enumDeclaration');
      if (ed) {
        const nameTok = findFirst(ed, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined;
        if (nameTok?.image === typeName) {
          return this.extractEnum(ed, source, typeName);
        }
        continue;
      }
      const rd = findFirst(td, 'recordDeclaration');
      if (rd) {
        const nameTok = findFirst(rd, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined;
        if (nameTok?.image === typeName) {
          return this.extractRecord(rd, source, typeName);
        }
        continue;
      }
      const idec = findFirst(td, 'interfaceDeclaration');
      if (idec) {
        const nid = findFirst(idec, 'normalInterfaceDeclaration');
        const nameTok = nid
          ? (findFirst(nid, 'typeIdentifier')?.children['Identifier']?.[0] as CstToken | undefined)
          : undefined;
        if (nameTok?.image === typeName && nid) {
          return this.extractInterface(nid, source, typeName);
        }
      }
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
        const annReads = annotationsFromFieldDeclaration(fd, source);
        const validation: ValidationConstraint[] = [];
        let description: string | undefined;
        for (const ar of annReads) {
          const name = ar.read.name;
          if (name === 'Schema') {
            const desc = ar.read.values['description'] ?? ar.read.positional[0];
            if (desc && desc.kind === 'string') {
              description = desc.value;
            }
            continue;
          }
          if (name === 'NotNull' || name === 'NotBlank' || name === 'NotEmpty' || name === 'Size' || name === 'Min' || name === 'Max' || name === 'Pattern' || name === 'Email') {
            const val = ar.read.values['value'] ?? ar.read.positional[0];
            let v: string | number | undefined;
            if (val) {
              if (val.kind === 'string') v = val.value;
              else if (val.kind === 'number') v = val.value;
            }
            validation.push({ type: name, value: v });
          }
        }
        for (const d of declarators) {
          const idTok = findFirst(d, 'variableDeclaratorId')?.children['Identifier']?.[0] as
            | CstToken
            | undefined;
          if (idTok) {
            const field: ResolvedField = { name: idTok.image, javaType };
            if (validation.length > 0) field.validation = validation;
            if (description) field.description = description;
            fields.push(field);
          }
        }
      }
    }
    return { name: typeName, fields };
  }

  private extractEnum(ed: CstNode, source: string, typeName: string): ResolvedDto {
    const values: string[] = [];
    const enumBody = findFirst(ed, 'enumBody');
    if (enumBody) {
      const constants = findAll(enumBody, 'enumConstant');
      for (const ec of constants) {
        const idTok = ec.children['Identifier']?.[0] as CstToken | undefined;
        if (idTok) {
          values.push(idTok.image);
        }
      }
    }
    return { name: typeName, fields: [], kind: 'enum', values };
  }

  private extractRecord(rd: CstNode, source: string, typeName: string): ResolvedDto {
    const fields: ResolvedField[] = [];
    const rh = findFirst(rd, 'recordHeader');
    if (rh) {
      const rcl = findFirst(rh, 'recordComponentList');
      if (rcl) {
        const comps = (rcl.children['recordComponent'] || []) as CstNode[];
        for (const c of comps) {
          const ut = findFirst(c, 'unannType');
          const javaType = ut ? text(ut, source).trim() : '';
          const idTok = c.children['Identifier']?.[0] as CstToken | undefined;
          if (idTok) {
            fields.push({ name: idTok.image, javaType });
          }
        }
      }
    }
    return { name: typeName, fields, kind: 'record' };
  }

  private extractInterface(nid: CstNode, source: string, typeName: string): ResolvedDto {
    const fields: ResolvedField[] = [];
    const ib = findFirst(nid, 'interfaceBody');
    if (ib) {
      const members = (ib.children['interfaceMemberDeclaration'] || []) as CstNode[];
      for (const m of members) {
        const imd = findFirst(m, 'interfaceMethodDeclaration');
        if (imd) {
          const mh = findFirst(imd, 'methodHeader');
          if (mh) {
            const javaType = methodReturnType(mh, source) ?? '';
            const declarator = findFirst(mh, 'methodDeclarator');
            const idTok = declarator?.children['Identifier']?.[0] as CstToken | undefined;
            if (idTok) {
              fields.push({ name: idTok.image, javaType });
            }
          }
        }
        const cd = findFirst(m, 'constantDeclaration');
        if (cd) {
          const ut = findFirst(cd, 'unannType');
          const javaType = ut ? text(ut, source).trim() : '';
          const vdl = findFirst(cd, 'variableDeclaratorList');
          if (vdl) {
            const vd = (vdl.children['variableDeclarator'] || [])[0] as CstNode | undefined;
            const vdi = vd ? findFirst(vd, 'variableDeclaratorId') : undefined;
            const idTok = vdi?.children['Identifier']?.[0] as CstToken | undefined;
            if (idTok) {
              fields.push({ name: idTok.image, javaType });
            }
          }
        }
      }
    }
    return { name: typeName, fields, kind: 'interface' };
  }
}
