import * as fs from 'fs'
import * as path from 'path'

export interface ServiceRootPathResolution {
  /** Normalized root path ('' when unresolved or conflicting). */
  path: string
  warnings: string[]
  /** Config key that produced the path (e.g. 'spring.application.webflux.base-path'). */
  source?: string
}

export interface ResolveServiceRootPathOptions {
  activeProfile?: string
}

const CONFIG_FILE_RE = /^(application|bootstrap)(-[^./\\]+)?\.(yaml|yml|properties)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'out', 'dist', 'build', '.worktrees'])
const WEBFLUX_KEY = 'spring.application.webflux.base-path'
const SERVLET_KEY = 'server.servlet.context-path'
const BLOCK_SCALAR_RE = /^[|>][+-]?$/

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

/**
 * Normalize a detected path: ensure a leading slash, strip trailing slashes,
 * collapse repeated slashes. Values containing ${...} placeholders are returned
 * verbatim (never expanded, never slash-touched) so callers can detect them.
 * Root-only values ('/' or '') normalize to '' (no prefix).
 */
export function normalizeRootPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.includes('${')) return trimmed
  let s = trimmed.replace(/\/+$/, '')
  if (s === '') return ''
  s = s.replace(/\/{2,}/g, '/')
  if (!s.startsWith('/')) s = '/' + s
  return s
}

function parseProperties(content: string, anomalies: string[]): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const eq = trimmed.indexOf('=')
    const colon = trimmed.indexOf(':')
    const seps = [eq, colon].filter(i => i > 0)
    if (seps.length === 0) {
      anomalies.push(`malformed properties line: "${trimmed}"`)
      continue
    }
    const idx = Math.min(...seps)
    const key = trimmed.slice(0, idx).trim()
    const value = stripQuotes(trimmed.slice(idx + 1))
    if (key) values.set(key, value)
  }
  return values
}

function parseYamlDoc(lines: string[], anomalies: string[]): Map<string, string> {
  const values = new Map<string, string>()
  const stack: Array<{ indent: number; key: string }> = []
  let blockIndent = -1
  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.length - line.trimStart().length
    if (blockIndent >= 0) {
      if (indent > blockIndent) continue
      blockIndent = -1
    }
    const trimmed = line.trim()
    if (trimmed.startsWith('-') || trimmed === '...') continue
    const m = /^(\s*)([^:#]+?)\s*:\s*(.*)$/.exec(line)
    if (!m) {
      anomalies.push(`malformed YAML line: "${trimmed}"`)
      continue
    }
    const key = m[2].trim()
    const rest = m[3].trim()
    if (!key) continue
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()
    let value = rest
    if (value.startsWith('"') || value.startsWith("'")) {
      const q = value[0]
      const close = value.indexOf(q, 1)
      const after = close === -1 ? '' : value.slice(close + 1).trim()
      if (close === -1 || (after !== '' && !after.startsWith('#'))) {
        anomalies.push(`malformed quoted value for key "${[...stack.map(s => s.key), key].join('.')}"`)
        continue
      }
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
      if (value === '') {
        stack.push({ indent, key })
        continue
      }
    }
    if (BLOCK_SCALAR_RE.test(value)) {
      blockIndent = indent
      continue
    }
    values.set([...stack.map(s => s.key), key].join('.'), stripQuotes(value))
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

function collectSources(files: Record<string, string>, anomalies: string[]): DocSource[] {
  const sources: DocSource[] = []
  for (const fileName of Object.keys(files).sort()) {
    const content = files[fileName]
    if (typeof content !== 'string') continue
    const base = path.basename(fileName)
    if (!CONFIG_FILE_RE.test(base)) continue
    const fileProfile = profileFromFileName(fileName)
    if (/\.properties$/i.test(base)) {
      sources.push({ file: fileName, docIndex: 0, fileProfile, values: parseProperties(content, anomalies) })
      continue
    }
    splitYamlDocs(content).forEach((docLines, docIndex) => {
      sources.push({ file: fileName, docIndex, fileProfile, values: parseYamlDoc(docLines, anomalies) })
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
    } else if (entry.isFile() && CONFIG_FILE_RE.test(entry.name)) {
      try {
        out[full] = fs.readFileSync(full, 'utf8')
      } catch {
        // unreadable file: skip
      }
    }
  }
}

/**
 * Effective value of one key within one precedence tier. Within a single file
 * the last YAML document wins (Spring multi-document semantics); across files
 * disagreeing values are a conflict (no guessing).
 */
function pickFromTier(
  candidates: DocSource[],
  key: string,
  warnings: string[]
): { value: string; source: string } | undefined {
  const perFile = new Map<string, { value: string; source: string }>()
  for (const src of candidates) {
    const raw = src.values.get(key)
    if (raw === undefined) continue
    const normalized = normalizeRootPath(raw)
    if (!normalized) continue
    const source = src.docIndex > 0 ? `${path.basename(src.file)}#doc${src.docIndex}` : path.basename(src.file)
    perFile.set(src.file, { value: normalized, source })
  }
  if (perFile.size === 0) return undefined
  const byValue = new Map<string, string>()
  for (const entry of perFile.values()) {
    if (!byValue.has(entry.value)) byValue.set(entry.value, entry.source)
  }
  if (byValue.size > 1) {
    const details = [...byValue.entries()].map(([value, source]) => `${value} (${source})`).join(', ')
    warnings.push(`conflicting ${key} values: ${details}; returning empty (no guessing)`)
    return { value: '', source: '' }
  }
  const [value, source] = [...byValue.entries()][0]
  return { value, source }
}

/**
 * Resolve the service root path from Spring Boot config file contents.
 *
 * Webflux-first: `spring.application.webflux.base-path` wins over
 * `server.servlet.context-path` when both are present and agree (after
 * normalization). When they disagree the result is empty + warning — no
 * guessing, no invented precedence. Profile-aware: the active profile's
 * `application-{profile}` files override default files (which still fill keys
 * the profile files do not define). Multi-document YAML is supported (later
 * documents override earlier ones; profile-tagged documents are honored only
 * when their profile is active). `${ENV_VAR}` placeholders are never expanded —
 * returned verbatim. Malformed input yields empty + warnings, never a throw.
 *
 * This module never hardcodes company or service names; servlet-only services
 * are handled by the runtime rules override downstream.
 */
export function resolveServiceRootPath(
  files: Record<string, string>,
  options?: ResolveServiceRootPathOptions
): ServiceRootPathResolution {
  const warnings: string[] = []
  const anomalies: string[] = []
  const sources = collectSources(files, anomalies)

  if (anomalies.length > 0) {
    warnings.push(...anomalies)
    return { path: '', warnings }
  }

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
  const baseTier = included.filter(src => (src.docProfile ?? src.fileProfile) === undefined)

  const pick = (key: string): { value: string; source: string } | undefined =>
    pickFromTier(activeTier, key, warnings) ?? pickFromTier(baseTier, key, warnings)

  const webflux = pick(WEBFLUX_KEY)
  const servlet = pick(SERVLET_KEY)

  // Indeterminate key (intra-key conflict) → no guessing.
  if (webflux !== undefined && !webflux.value) return { path: '', warnings }
  if (servlet !== undefined && !servlet.value) return { path: '', warnings }

  if (webflux && servlet) {
    if (webflux.value !== servlet.value) {
      warnings.push(
        `conflict: ${WEBFLUX_KEY}=${webflux.value} (${webflux.source}) vs ` +
          `${SERVLET_KEY}=${servlet.value} (${servlet.source}); returning empty (no guessing)`
      )
      return { path: '', warnings }
    }
    return { path: webflux.value, warnings, source: webflux.source }
  }

  const chosen = webflux ?? servlet
  if (chosen && chosen.value) {
    return { path: chosen.value, warnings, source: chosen.source }
  }
  return { path: '', warnings }
}

/** Filesystem-backed variant: scans `dir` for Spring config files, then resolves. */
export function resolveServiceRootPathFromDir(
  dir: string,
  options?: ResolveServiceRootPathOptions
): ServiceRootPathResolution {
  const files: Record<string, string> = {}
  collectFiles(dir, files)
  return resolveServiceRootPath(files, options)
}
