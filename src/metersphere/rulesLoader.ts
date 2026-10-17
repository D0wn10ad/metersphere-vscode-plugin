import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * Runtime rules loader for sync branch/placement routing.
 *
 * Rules are read from a user-local JSON file (path configurable via the
 * `metersphere.rulesPath` setting; default `.metersphere/rules.json`,
 * workspace-relative). The file is user configuration, so it is treated as
 * trusted-but-validated: every field is schema-checked and invalid data is
 * skipped with a warning — the loader never throws and never crashes the
 * sync flow.
 *
 * Ordering semantics: rule evaluation is first-match-wins in the order the
 * rules appear in the file. As a defensive measure the loader additionally
 * moves any `catchAll` rule to the end of the list (stable, preserving the
 * relative order of all other rules), because `catchAll` must always be
 * evaluated last regardless of where the user placed it.
 *
 * No company names (or any other vendor-specific strings) are hardcoded
 * here — matching is entirely data-driven from the JSON file.
 */

export type RuleMatchOn =
  | 'methodAndPathPrefix'
  | 'pathRegex'
  | 'className'
  | 'javadocCategory'
  | 'annotationTag'
  | 'catchAll'

export type RuleBranch = 'eapi' | 'iapi' | 'both'

export interface RuleEntry {
  matchOn: RuleMatchOn
  pattern: string
  branch: RuleBranch
}

export interface PlacementConfig {
  enabled: boolean
  managedPrefix: string
}

export interface RulesConfig {
  placement: PlacementConfig
  rules: RuleEntry[]
}

export type RulesWarn = (message: string) => void

export interface LoadRulesOptions {
  /** Explicit rules file path. When omitted, the `metersphere.rulesPath` setting is used. */
  rulesPath?: string
  /** Directory used to resolve a relative rules path. Defaults to the workspace root, then cwd. */
  workspaceRoot?: string
  /** Warning sink. Defaults to console.warn. */
  warn?: RulesWarn
}

/** Setting key contributed in package.json `contributes.configuration`. */
export const RULES_PATH_SETTING = 'metersphere.rulesPath'

/** Default rules file location (workspace-relative). */
export const DEFAULT_RULES_PATH = '.metersphere/rules.json'

const MATCH_ON_VALUES: readonly RuleMatchOn[] = [
  'methodAndPathPrefix',
  'pathRegex',
  'className',
  'javadocCategory',
  'annotationTag',
  'catchAll'
]

const BRANCH_VALUES: readonly RuleBranch[] = ['eapi', 'iapi', 'both']

/** The empty rule set: placement disabled, default managed prefix, no rules. */
export function emptyRulesConfig(): RulesConfig {
  return { placement: { enabled: false, managedPrefix: '/managed' }, rules: [] }
}

function defaultWarn(message: string): void {
  console.warn(`[metersphere] ${message}`)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate an already-parsed JSON value against the rules schema.
 * Invalid placement fields fall back to defaults (with a warning);
 * invalid rule entries are skipped (with a warning). Never throws.
 */
export function parseRulesConfig(raw: unknown, warn: RulesWarn = defaultWarn): RulesConfig {
  if (!isPlainObject(raw)) {
    warn('rules file must contain a JSON object; using empty rules')
    return emptyRulesConfig()
  }

  const placement = parsePlacement(raw.placement, warn)
  const rules = parseRules(raw.rules, warn)
  return { placement, rules: sortCatchAllLast(rules) }
}

function parsePlacement(raw: unknown, warn: RulesWarn): PlacementConfig {
  const fallback: PlacementConfig = { enabled: false, managedPrefix: '/managed' }
  if (raw === undefined) {
    return fallback
  }
  if (!isPlainObject(raw)) {
    warn('placement must be an object; using defaults (enabled: false, managedPrefix: "/managed")')
    return fallback
  }

  let enabled = false
  if (raw.enabled === undefined) {
    enabled = false
  } else if (typeof raw.enabled === 'boolean') {
    enabled = raw.enabled
  } else {
    warn(`placement.enabled must be a boolean (got ${typeof raw.enabled}); using false`)
  }

  let managedPrefix = '/managed'
  if (raw.managedPrefix === undefined) {
    managedPrefix = '/managed'
  } else if (typeof raw.managedPrefix === 'string' && raw.managedPrefix.trim() !== '') {
    const trimmed = raw.managedPrefix.trim()
    managedPrefix = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  } else {
    warn('placement.managedPrefix must be a non-empty string; using "/managed"')
  }

  return { enabled, managedPrefix }
}

function parseRules(raw: unknown, warn: RulesWarn): RuleEntry[] {
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    warn('rules must be an array; using empty rules')
    return []
  }

  const valid: RuleEntry[] = []
  raw.forEach((entry: unknown, index: number) => {
    if (!isPlainObject(entry)) {
      warn(`rules[${index}] is not an object; skipping`)
      return
    }

    const matchOn = entry.matchOn
    if (typeof matchOn !== 'string' || !(MATCH_ON_VALUES as readonly string[]).includes(matchOn)) {
      warn(`rules[${index}].matchOn is invalid (${JSON.stringify(matchOn)}); skipping`)
      return
    }
    const validMatchOn = matchOn as RuleMatchOn

    const branch = entry.branch
    if (typeof branch !== 'string' || !(BRANCH_VALUES as readonly string[]).includes(branch)) {
      warn(`rules[${index}].branch is invalid (${JSON.stringify(branch)}); skipping`)
      return
    }
    const validBranch = branch as RuleBranch

    // catchAll ignores the pattern entirely; everything else requires a string pattern.
    let pattern = ''
    if (validMatchOn === 'catchAll') {
      pattern = ''
    } else if (typeof entry.pattern === 'string') {
      pattern = entry.pattern
    } else {
      warn(`rules[${index}].pattern must be a string (got ${typeof entry.pattern}); skipping`)
      return
    }

    if (validMatchOn === 'pathRegex') {
      try {
        // eslint-disable-next-line no-new
        new RegExp(pattern)
      } catch {
        warn(`rules[${index}].pattern is not a valid regular expression (${JSON.stringify(pattern)}); skipping`)
        return
      }
    }

    valid.push({ matchOn: validMatchOn, pattern, branch: validBranch })
  })
  return valid
}

/** Defensive stable sort: catchAll rules always evaluate last. */
function sortCatchAllLast(rules: RuleEntry[]): RuleEntry[] {
  return rules.filter((r) => r.matchOn !== 'catchAll').concat(rules.filter((r) => r.matchOn === 'catchAll'))
}

function resolveRulesPath(options: LoadRulesOptions): string {
  let configured = options.rulesPath
  if (configured === undefined || configured.trim() === '') {
    const fromSetting = vscode.workspace.getConfiguration().get<string>(RULES_PATH_SETTING)
    configured = fromSetting !== undefined && fromSetting.trim() !== '' ? fromSetting : DEFAULT_RULES_PATH
  }
  const trimmed = configured.trim()
  if (path.isAbsolute(trimmed)) {
    return trimmed
  }
  const root = options.workspaceRoot ?? vscode.workspace.rootPath ?? process.cwd()
  return path.resolve(root, trimmed)
}

/**
 * Load and validate the runtime sync rules.
 *
 * - Missing file → empty rule set, no warning, no throw.
 * - Unreadable file (e.g. path is a directory) → one warning + empty rule set.
 * - Malformed / truncated JSON → one warning + empty rule set.
 * - Invalid schema fragments → skipped with per-item warnings; valid parts kept.
 */
export function loadRules(options: LoadRulesOptions = {}): RulesConfig {
  const warn = options.warn ?? defaultWarn
  const resolved = resolveRulesPath(options)

  let text: string
  try {
    text = fs.readFileSync(resolved, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      warn(`cannot read rules file "${resolved}" (${code ?? String(error)}); using empty rules`)
    }
    return emptyRulesConfig()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    warn(`rules file "${resolved}" is not valid JSON (${String(error)}); using empty rules`)
    return emptyRulesConfig()
  }

  return parseRulesConfig(parsed, warn)
}
