import * as fs from 'fs'
import * as path from 'path'

export interface ContextPathResolution {
  contextPath: string
  warnings: string[]
  mvcServletPath?: string
  source?: string
}

export interface ResolveOptions {
  activeProfile?: string
}

const CONFIG_FILE_RE = /^(application|bootstrap)(-[^./\\]+)?\.(yaml|yml|properties)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'out', 'dist', 'build', '.worktrees'])
const CONTEXT_KEY = 'server.servlet.context-path'
const MVC_KEY = 'spring.mvc.servlet.path'

interface DocSource {
  file: string
  docIndex: number
  fileProfile?: string
  docProfile?: string
  values: Map<string, string>
}

function stripQuotes(value: string): string {
  const v = value.trim()
  if (v.length >= 2) {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1)
    }
  }
  return v
}

function normalizeContextPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.includes('${')) return trimmed
  let s = trimmed.replace(/\/+$/, '')
  if (s === '') return ''
  if (!s.startsWith('/')) s = '/' + s
  return s
}

function parseProperties(content: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = stripQuotes(trimmed.slice(idx + 1))
    if (key) values.set(key, value)
  }
  return values
}

function parseYamlDoc(lines: string[]): Map<string, string> {
  const values = new Map<string, string>()
  const stack: Array<{ indent: number; key: string }> = []
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const m = /^(\s*)(?:-\s+)?([^:#]+?)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const indent = m[1].length
    const key = m[2].trim()
    let rest = m[3].trim()
    if (!key) continue
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    if (rest === '') {
      stack.push({ indent, key })
      continue
    }
    if (!rest.startsWith('"') && !rest.startsWith("'")) {
      rest = rest.replace(/\s+#.*$/, '').trim()
    }
    const fullKey = [...stack.map(s => s.key), key].join('.')
    values.set(fullKey, stripQuotes(rest))
  }
  return values
}

function splitYamlDocs(content: string): string[][] {
  const docs: string[][] = [[]]
  for (const line of content.split(/\r?\n/)) {
    if (/^---\s*(#.*)?$/.test(line)) {
      docs.push([])
    } else {
      docs[docs.length - 1].push(line)
    }
  }
  return docs
}

function profileFromFileName(fileName: string): string | undefined {
  const base = path.basename(fileName)
  const m = /^(application|bootstrap)-(.+)\.(yaml|yml|properties)$/i.exec(base)
  return m ? m[2] : undefined
}

function collectSources(files: Record<string, string>): DocSource[] {
  const sources: DocSource[] = []
  for (const fileName of Object.keys(files).sort()) {
    const content = files[fileName]
    if (typeof content !== 'string') continue
    const base = path.basename(fileName)
    if (!CONFIG_FILE_RE.test(base)) continue
    const fileProfile = profileFromFileName(fileName)
    if (/\.properties$/i.test(base)) {
      sources.push({
        file: fileName,
        docIndex: 0,
        fileProfile,
        values: parseProperties(content),
      })
      continue
    }
    splitYamlDocs(content).forEach((docLines, docIndex) => {
      sources.push({
        file: fileName,
        docIndex,
        fileProfile,
        values: parseYamlDoc(docLines),
      })
    })
  }
  for (const src of sources) {
    const profiles = stripQuotes(src.values.get('spring.profiles') ?? '')
    const onProfile = stripQuotes(src.values.get('spring.config.activate.on-profile') ?? '')
    const docProfile = onProfile || profiles || undefined
    if (docProfile && !docProfile.includes('[')) {
      src.docProfile = docProfile
    }
  }
  return sources
}

function collectFiles(dir: string, out: Record<string, string>, depth = 0): void {
  if (depth > 12) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectFiles(full, out, depth + 1)
    } else if (entry.isFile()) {
      if (CONFIG_FILE_RE.test(entry.name)) {
        try {
          out[full] = fs.readFileSync(full, 'utf8')
        } catch {
          // unreadable file: skip
        }
      }
    }
  }
}

/**
 * Detect-only: parses Spring config file contents (yaml/properties, profile
 * variants, --- multi-doc) with targeted line-based parsing. Never expands
 * ${ENV_VAR} placeholders, never guesses on conflict (empty + warning).
 */
export function resolveContextPath(
  files: Record<string, string>,
  options?: ResolveOptions
): ContextPathResolution {
  const warnings: string[] = []
  const sources = collectSources(files)

  let activeProfile = options?.activeProfile
  if (!activeProfile) {
    for (const src of sources) {
      const hint = stripQuotes(src.values.get('spring.profiles.active') ?? '')
      if (hint) {
        activeProfile = hint
        break
      }
    }
  }

  const included = sources.filter(src => {
    const profile = src.docProfile ?? src.fileProfile
    if (profile === undefined) return true
    return activeProfile !== undefined && profile === activeProfile
  })
  const activeTier = included.filter(src => {
    const profile = src.docProfile ?? src.fileProfile
    return profile !== undefined && profile === activeProfile
  })
  const baseTier = included.filter(src => {
    const profile = src.docProfile ?? src.fileProfile
    return profile === undefined
  })

  const pick = (candidates: DocSource[], key: string): { value: string; source: string } | undefined => {
    const byValue = new Map<string, string>()
    for (const src of candidates) {
      const raw = src.values.get(key)
      if (raw === undefined) continue
      const normalized = normalizeContextPath(raw)
      if (!normalized) continue
      const source = src.docIndex > 0 ? `${src.file}#doc${src.docIndex}` : src.file
      if (!byValue.has(normalized)) byValue.set(normalized, source)
    }
    if (byValue.size === 0) return undefined
    if (byValue.size > 1) {
      const details = [...byValue.entries()]
        .map(([value, source]) => `${value} (${source})`)
        .join(', ')
      warnings.push(`Conflicting ${key} values: ${details}; returning empty (no guessing)`)
      return { value: '', source: '' }
    }
    const [value, source] = [...byValue.entries()][0]
    return { value, source }
  }

  const chosenTier = activeTier.length > 0 ? activeTier : baseTier
  const contextPick = pick(chosenTier, CONTEXT_KEY)
  const mvcPick = pick(activeTier.length > 0 ? activeTier : baseTier, MVC_KEY)

  return {
    contextPath: contextPick && contextPick.value ? contextPick.value : '',
    warnings,
    ...(mvcPick && mvcPick.value ? { mvcServletPath: mvcPick.value } : {}),
    ...(contextPick && contextPick.source ? { source: contextPick.source } : {}),
  }
}

export function resolveContextPathFromDir(
  dir: string,
  options?: ResolveOptions
): ContextPathResolution {
  const files: Record<string, string> = {}
  collectFiles(dir, files)
  return resolveContextPath(files, options)
}
