import * as path from 'path'
import {
  loadRules,
  parseRulesConfig,
  emptyRulesConfig,
  DEFAULT_RULES_PATH,
  RulesConfig
} from '../src/metersphere/rulesLoader'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const vscode = require('vscode')

const FIXTURES = path.join(__dirname, 'fixtures')
const REPO_ROOT = path.resolve(__dirname, '..')
const fixture = (name: string): string => path.join(FIXTURES, name)

const collectWarn = (): { warnings: string[]; warn: (m: string) => void } => {
  const warnings: string[] = []
  return { warnings, warn: (m: string): void => { warnings.push(m) } }
}

const RULES_PATH_SETTING = 'metersphere.rulesPath'

describe('loadRules — missing / unreadable files never throw', () => {
  test('missing file returns empty rules, no throw, no warning', () => {
    const { warnings, warn } = collectWarn()
    let result: RulesConfig | undefined
    expect(() => {
      result = loadRules({ rulesPath: fixture('no-such-rules.json'), warn })
    }).not.toThrow()
    expect(result).toEqual(emptyRulesConfig())
    expect(result).toEqual({ placement: { enabled: false, managedPrefix: '/managed' }, rules: [] })
    expect(warnings).toEqual([])
    console.log('[evidence] missing file -> ', JSON.stringify(result), 'warnings:', JSON.stringify(warnings))
  })

  test('directory as path returns empty rules with one warning, no throw', () => {
    const { warnings, warn } = collectWarn()
    let result: RulesConfig | undefined
    expect(() => {
      result = loadRules({ rulesPath: FIXTURES, warn })
    }).not.toThrow()
    expect(result).toEqual(emptyRulesConfig())
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('cannot read')
    console.log('[evidence] directory path warnings:', JSON.stringify(warnings))
  })
})

describe('loadRules — malformed / truncated JSON warns once and returns empty', () => {
  test('malformed JSON -> exactly one warning + empty rules, no throw', () => {
    const { warnings, warn } = collectWarn()
    let result: RulesConfig | undefined
    expect(() => {
      result = loadRules({ rulesPath: fixture('rules.malformed.json'), warn })
    }).not.toThrow()
    expect(result).toEqual(emptyRulesConfig())
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('rules.malformed.json')
    expect(warnings[0]).toContain('not valid JSON')
    console.log('[evidence] malformed warnings:', JSON.stringify(warnings))
  })

  test('truncated JSON -> exactly one warning + empty rules, no throw', () => {
    const { warnings, warn } = collectWarn()
    let result: RulesConfig | undefined
    expect(() => {
      result = loadRules({ rulesPath: fixture('rules.truncated.json'), warn })
    }).not.toThrow()
    expect(result).toEqual(emptyRulesConfig())
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('rules.truncated.json')
    console.log('[evidence] truncated warnings:', JSON.stringify(warnings))
  })

  test('default warn sink writes to console.warn (no warn option)', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      loadRules({ rulesPath: fixture('rules.malformed.json') })
      expect(spy).toHaveBeenCalledTimes(1)
      expect(String(spy.mock.calls[0][0])).toContain('rules.malformed.json')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('loadRules — valid file parses into the exact schema', () => {
  test('rules.example.json -> exact expected object (order preserved as-is)', () => {
    const { warnings, warn } = collectWarn()
    const cfg = loadRules({ rulesPath: fixture('rules.example.json'), warn })
    const expected: RulesConfig = {
      placement: { enabled: true, managedPrefix: '/managed' },
      rules: [
        { matchOn: 'methodAndPathPrefix', pattern: '/api/orders', branch: 'eapi' },
        { matchOn: 'pathRegex', pattern: '^/api/v2/', branch: 'iapi' },
        { matchOn: 'className', pattern: 'OrderController', branch: 'both' },
        { matchOn: 'javadocCategory', pattern: 'external', branch: 'iapi' },
        { matchOn: 'annotationTag', pattern: 'legacy', branch: 'eapi' },
        { matchOn: 'catchAll', pattern: '', branch: 'both' }
      ]
    }
    expect(cfg).toEqual(expected)
    expect(warnings).toEqual([])
    // first-match-wins: file order is the evaluation order (catchAll already last here)
    expect(cfg.rules.map((r) => r.matchOn)).toEqual([
      'methodAndPathPrefix', 'pathRegex', 'className', 'javadocCategory', 'annotationTag', 'catchAll'
    ])
    console.log('[evidence] valid rules.json parsed:', JSON.stringify(cfg, null, 2))
  })

  test('missing managedPrefix defaults to "/managed" silently', () => {
    const { warnings, warn } = collectWarn()
    const cfg = loadRules({ rulesPath: fixture('rules.no-managed-prefix.json'), warn })
    expect(cfg.placement).toEqual({ enabled: false, managedPrefix: '/managed' })
    expect(warnings).toEqual([])
  })

  test('missing placement section defaults to disabled + "/managed" silently', () => {
    const { warnings, warn } = collectWarn()
    const cfg = loadRules({ rulesPath: fixture('rules.no-placement.json'), warn })
    expect(cfg.placement).toEqual({ enabled: false, managedPrefix: '/managed' })
    expect(cfg.rules).toEqual([{ matchOn: 'className', pattern: 'LegacyController', branch: 'iapi' }])
    expect(warnings).toEqual([])
  })
})

describe('loadRules — catchAll ordering (loader sorts it last, documented)', () => {
  test('catchAll in the middle is moved to the end; other order preserved', () => {
    const { warnings, warn } = collectWarn()
    const cfg = loadRules({ rulesPath: fixture('rules.catchall-middle.json'), warn })
    expect(cfg.rules.map((r) => r.matchOn)).toEqual(['className', 'pathRegex', 'catchAll'])
    expect(cfg.rules[2]).toEqual({ matchOn: 'catchAll', pattern: '', branch: 'iapi' })
    expect(warnings).toEqual([])
  })
})

describe('loadRules — invalid entries are skipped with warnings, never crash', () => {
  test('wrong-typed / out-of-vocabulary entries skipped; valid ones kept', () => {
    const { warnings, warn } = collectWarn()
    let result: RulesConfig | undefined
    expect(() => {
      result = loadRules({ rulesPath: fixture('rules.invalid-entries.json'), warn })
    }).not.toThrow()
    const cfg = result as RulesConfig
    expect(cfg.rules).toEqual([
      { matchOn: 'className', pattern: 'GoodController', branch: 'eapi' },
      { matchOn: 'catchAll', pattern: '', branch: 'iapi' }
    ])
    // invalid: bad matchOn, non-string pattern, invalid regex, non-object entry, bad branch = 5 rule warnings
    // + placement.enabled "yes" + placement.managedPrefix 42 = 2 placement warnings
    expect(warnings).toHaveLength(7)
    expect(warnings.some((w) => w.includes('notARealMatchOn'))).toBe(true)
    expect(warnings.some((w) => w.includes('([unclosed'))).toBe(true)
    expect(warnings.some((w) => w.includes('sideways'))).toBe(true)
    expect(warnings.some((w) => w.includes('placement.enabled'))).toBe(true)
    expect(warnings.some((w) => w.includes('placement.managedPrefix'))).toBe(true)
    console.log('[evidence] invalid-entries warnings:', JSON.stringify(warnings, null, 2))
    console.log('[evidence] invalid-entries surviving rules:', JSON.stringify(cfg.rules))
  })

  test('top-level wrong shapes (placement string, rules object) -> defaults + warnings', () => {
    const { warnings, warn } = collectWarn()
    const cfg = loadRules({ rulesPath: fixture('rules.bad-shapes.json'), warn })
    expect(cfg).toEqual(emptyRulesConfig())
    expect(warnings).toHaveLength(2)
    console.log('[evidence] bad-shapes warnings:', JSON.stringify(warnings))
  })

  test('managedPrefix without leading slash is normalized to "/gateway"', () => {
    const { warnings, warn } = collectWarn()
    const cfg = loadRules({ rulesPath: fixture('rules.prefix-no-slash.json'), warn })
    expect(cfg.placement).toEqual({ enabled: true, managedPrefix: '/gateway' })
    expect(warnings).toEqual([])
  })
})

describe('loadRules — path resolution via metersphere.rulesPath setting', () => {
  afterEach(() => {
    vscode.workspace.getConfiguration().update(RULES_PATH_SETTING, undefined)
  })

  test('reads workspace-relative path from the setting when no explicit path given', () => {
    vscode.workspace.getConfiguration().update(RULES_PATH_SETTING, 'test/fixtures/rules.example.json')
    const cfg = loadRules({ workspaceRoot: REPO_ROOT })
    expect(cfg.placement.enabled).toBe(true)
    expect(cfg.rules).toHaveLength(6)
  })

  test('falls back to default .metersphere/rules.json when setting is unset', () => {
    expect(DEFAULT_RULES_PATH).toBe('.metersphere/rules.json')
    const cfg = loadRules({ workspaceRoot: path.join(FIXTURES, 'default-ws') })
    expect(cfg.rules).toEqual([
      { matchOn: 'className', pattern: 'AcmeOrderController', branch: 'both' },
      { matchOn: 'catchAll', pattern: '', branch: 'eapi' }
    ])
  })

  test('empty-string setting falls back to the default path', () => {
    vscode.workspace.getConfiguration().update(RULES_PATH_SETTING, '   ')
    const cfg = loadRules({ workspaceRoot: path.join(FIXTURES, 'default-ws') })
    expect(cfg.rules).toEqual([
      { matchOn: 'className', pattern: 'AcmeOrderController', branch: 'both' },
      { matchOn: 'catchAll', pattern: '', branch: 'eapi' }
    ])
  })

  test('explicit options.rulesPath takes precedence over the setting', () => {
    vscode.workspace.getConfiguration().update(RULES_PATH_SETTING, 'test/fixtures/no-such-file.json')
    const cfg = loadRules({ rulesPath: fixture('rules.example.json') })
    expect(cfg.rules).toHaveLength(6)
  })

  test('absolute path is used as-is (no workspace-root resolution)', () => {
    const cfg = loadRules({ rulesPath: fixture('rules.example.json') })
    expect(cfg.placement.enabled).toBe(true)
  })
})

describe('parseRulesConfig — unit-level schema validation', () => {
  test('non-object root (array) -> warning + empty config', () => {
    const { warnings, warn } = collectWarn()
    expect(parseRulesConfig([1, 2], warn)).toEqual(emptyRulesConfig())
    expect(warnings).toHaveLength(1)
  })

  test('null root -> warning + empty config', () => {
    const { warnings, warn } = collectWarn()
    expect(parseRulesConfig(null, warn)).toEqual(emptyRulesConfig())
    expect(warnings).toHaveLength(1)
  })

  test('missing rules key -> [] with no warning', () => {
    const { warnings, warn } = collectWarn()
    const cfg = parseRulesConfig({ placement: { enabled: true } }, warn)
    expect(cfg.rules).toEqual([])
    expect(cfg.placement.enabled).toBe(true)
    expect(warnings).toEqual([])
  })

  test('null rules value -> warning + []', () => {
    const { warnings, warn } = collectWarn()
    const cfg = parseRulesConfig({ rules: null }, warn)
    expect(cfg.rules).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  test('catchAll ignores pattern: missing pattern is allowed and normalized to ""', () => {
    const { warnings, warn } = collectWarn()
    const cfg = parseRulesConfig({ rules: [{ matchOn: 'catchAll', branch: 'both' }] }, warn)
    expect(cfg.rules).toEqual([{ matchOn: 'catchAll', pattern: '', branch: 'both' }])
    expect(warnings).toEqual([])
  })
})
