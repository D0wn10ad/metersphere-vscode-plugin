import * as fs from 'fs'
import * as path from 'path'
import {
  normalizeRootPath,
  resolveServiceRootPath,
  resolveServiceRootPathFromDir,
} from '../src/metersphere/serviceRootPathResolver'

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'service-root-path', 'app')

describe('resolveServiceRootPath — webflux-first', () => {
  test('webflux base-path resolved when only key present', () => {
    const result = resolveServiceRootPath({
      'application.yaml': ['spring:', '  application:', '    webflux:', '      base-path: /gateway'].join('\n'),
    })
    expect(result.path).toBe('/gateway')
    expect(result.source).toBe('application.yaml')
    expect(result.warnings).toEqual([])
  })

  test('webflux wins when both keys present and agreeing (normalized equal)', () => {
    const result = resolveServiceRootPath({
      'application.yaml': [
        'spring:',
        '  application:',
        '    webflux:',
        '      base-path: /api',
        'server:',
        '  servlet:',
        '    context-path: api/',
      ].join('\n'),
    })
    expect(result.path).toBe('/api')
    expect(result.source).toBe('application.yaml')
  })

  test('servlet context-path used as fallback when webflux absent', () => {
    const result = resolveServiceRootPath({
      'application.yaml': ['server:', '  servlet:', '    context-path: /servlet-ctx'].join('\n'),
    })
    expect(result.path).toBe('/servlet-ctx')
    expect(result.source).toBe('application.yaml')
  })

  test('flat dotted keys and inline comments supported', () => {
    const result = resolveServiceRootPath({
      'application.yaml': 'server.servlet.context-path: /inline # trailing comment\n',
    })
    expect(result.path).toBe('/inline')
  })
})

describe('resolveServiceRootPath — profile-aware', () => {
  const defaultFile = [
    'spring:',
    '  profiles:',
    '    active: prod',
    '  application:',
    '    webflux:',
    '      base-path: /default-root',
  ].join('\n')
  const prodFile = ['spring:', '  application:', '    webflux:', '      base-path: /prod-root'].join('\n')

  test('active-profile file preferred over default file (explicit option)', () => {
    const result = resolveServiceRootPath(
      {
        'application.yaml': defaultFile.replace('active: prod', 'active: dev'),
        'application-prod.yaml': prodFile,
      },
      { activeProfile: 'prod' }
    )
    expect(result.path).toBe('/prod-root')
    expect(result.source).toBe('application-prod.yaml')
  })

  test('active profile auto-detected from spring.profiles.active', () => {
    const result = resolveServiceRootPath({
      'application.yaml': defaultFile,
      'application-prod.yaml': prodFile,
    })
    expect(result.path).toBe('/prod-root')
    expect(result.source).toBe('application-prod.yaml')
  })

  test('non-active profile file is ignored', () => {
    const result = resolveServiceRootPath(
      {
        'application.yaml': defaultFile,
        'application-dev.yaml': ['server:', '  servlet:', '    context-path: /dev-ctx'].join('\n'),
      },
      { activeProfile: 'prod' }
    )
    expect(result.path).toBe('/default-root')
  })

  test('profile value preferred; default fills keys the profile file does not define', () => {
    const result = resolveServiceRootPath(
      {
        'application.yaml': ['server:', '  servlet:', '    context-path: /default-ctx'].join('\n'),
        'application-prod.yaml': ['server:', '  port: 8080'].join('\n'),
      },
      { activeProfile: 'prod' }
    )
    expect(result.path).toBe('/default-ctx')
  })

  test('explicit option overrides spring.profiles.active hint', () => {
    const result = resolveServiceRootPath(
      {
        'application.yaml': defaultFile,
        'application-dev.yaml': ['spring:', '  application:', '    webflux:', '      base-path: /dev-root'].join('\n'),
      },
      { activeProfile: 'dev' }
    )
    expect(result.path).toBe('/dev-root')
    expect(result.source).toBe('application-dev.yaml')
  })
})

describe('resolveServiceRootPath — multi-document YAML', () => {
  test('later document overrides earlier for the same key', () => {
    const result = resolveServiceRootPath({
      'application.yaml': [
        'spring:',
        '  application:',
        '    webflux:',
        '      base-path: /v1',
        '---',
        'spring:',
        '  application:',
        '    webflux:',
        '      base-path: /v2',
      ].join('\n'),
    })
    expect(result.path).toBe('/v2')
    expect(result.source).toBe('application.yaml#doc1')
  })

  test('profile-tagged document honored only when profile active', () => {
    const content = [
      'server:',
      '  port: 8080',
      '---',
      'spring:',
      '  config:',
      '    activate:',
      '      on-profile: prod',
      '  application:',
      '    webflux:',
      '      base-path: /prod-doc',
    ].join('\n')
    expect(resolveServiceRootPath({ 'application.yaml': content }, { activeProfile: 'prod' }).path).toBe('/prod-doc')
    expect(resolveServiceRootPath({ 'application.yaml': content }, { activeProfile: 'dev' }).path).toBe('')
  })

  test('profile document overrides plain document without conflict', () => {
    const result = resolveServiceRootPath(
      {
        'application.yaml': [
          'spring:',
          '  application:',
          '    webflux:',
          '      base-path: /plain',
          '---',
          'spring:',
          '  config:',
          '    activate:',
          '      on-profile: prod',
          '  application:',
          '    webflux:',
          '      base-path: /prod-doc',
        ].join('\n'),
      },
      { activeProfile: 'prod' }
    )
    expect(result.path).toBe('/prod-doc')
  })
})

describe('resolveServiceRootPath — ${ENV_VAR} placeholders left literal', () => {
  test('servlet context-path placeholder returned verbatim, never expanded', () => {
    const previous = process.env.MS_CTX_ROOT
    process.env.MS_CTX_ROOT = '/should-not-be-used'
    try {
      const result = resolveServiceRootPath({
        'application.yaml': ['server:', '  servlet:', '    context-path: ${MS_CTX_ROOT}'].join('\n'),
      })
      expect(result.path).toBe('${MS_CTX_ROOT}')
    } finally {
      if (previous === undefined) {
        delete process.env.MS_CTX_ROOT
      } else {
        process.env.MS_CTX_ROOT = previous
      }
    }
  })

  test('webflux placeholder with default value left literal', () => {
    const result = resolveServiceRootPath({
      'application.yaml': ['spring:', '  application:', '    webflux:', '      base-path: ${ROOT:/fallback}'].join('\n'),
    })
    expect(result.path).toBe('${ROOT:/fallback}')
  })

  test('placeholder webflux vs concrete servlet cannot confirm agreement → empty + warning', () => {
    const result = resolveServiceRootPath({
      'application.yaml': [
        'spring:',
        '  application:',
        '    webflux:',
        '      base-path: ${ROOT}',
        'server:',
        '  servlet:',
        '    context-path: /concrete',
      ].join('\n'),
    })
    expect(result.path).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('normalizeRootPath', () => {
  test('leading slash ensured', () => {
    expect(normalizeRootPath('api/v1')).toBe('/api/v1')
  })

  test('trailing slash stripped', () => {
    expect(normalizeRootPath('/api/v1/')).toBe('/api/v1')
  })

  test('double slashes collapsed', () => {
    expect(normalizeRootPath('//api//v1')).toBe('/api/v1')
    expect(normalizeRootPath('//api///v1//')).toBe('/api/v1')
  })

  test('root slash normalizes to empty prefix', () => {
    expect(normalizeRootPath('/')).toBe('')
    expect(normalizeRootPath('')).toBe('')
  })

  test('placeholder values skipped entirely (returned verbatim)', () => {
    expect(normalizeRootPath('${VAR}')).toBe('${VAR}')
    expect(normalizeRootPath('${VAR}/suffix/')).toBe('${VAR}/suffix/')
  })

  test('end-to-end messy value normalized', () => {
    const result = resolveServiceRootPath({
      'application.yaml': ['server:', '  servlet:', '    context-path: //messy///path//'].join('\n'),
    })
    expect(result.path).toBe('/messy/path')
  })
})

describe('resolveServiceRootPath — conflict (no guessing)', () => {
  test('disagreeing webflux and servlet keys → empty + warning', () => {
    const result = resolveServiceRootPath({
      'application.yaml': [
        'spring:',
        '  application:',
        '    webflux:',
        '      base-path: /api',
        'server:',
        '  servlet:',
        '    context-path: /other',
      ].join('\n'),
    })
    expect(result.path).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('conflict')
  })

  test('same key defined differently across two modules → empty + warning', () => {
    const result = resolveServiceRootPath({
      'module-a/application.yaml': ['spring:', '  application:', '    webflux:', '      base-path: /a'].join('\n'),
      'module-b/application.yaml': ['spring:', '  application:', '    webflux:', '      base-path: /b'].join('\n'),
    })
    expect(result.path).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('resolveServiceRootPath — malformed input (no crash)', () => {
  test('unterminated quoted value → empty + warning, no throw', () => {
    const result = resolveServiceRootPath({
      'application.yaml': ['spring:', '  application:', '    webflux:', '      base-path: "unterminated'].join('\n'),
    })
    expect(result.path).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('truncated garbage line → empty + warning, no throw', () => {
    const result = resolveServiceRootPath({
      'application.yaml': ['spring:', '  application:', '    webflux:', '      base-path: /ok', '    base-pat'].join('\n'),
    })
    expect(result.path).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('malformed properties line (no =) → empty + warning, no throw', () => {
    const result = resolveServiceRootPath({
      'application.properties': ['server.servlet.context-path=/ok', 'garbage-line-without-separator'].join('\n'),
    })
    expect(result.path).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('resolveServiceRootPath — properties + bootstrap formats', () => {
  test('properties file servlet context-path resolved', () => {
    const result = resolveServiceRootPath({
      'application.properties': 'server.servlet.context-path=/props-ctx\n',
    })
    expect(result.path).toBe('/props-ctx')
  })

  test('webflux in properties wins over agreeing servlet in yaml', () => {
    const result = resolveServiceRootPath({
      'application.properties': 'spring.application.webflux.base-path=/wf-props\n',
      'application.yaml': ['server:', '  servlet:', '    context-path: /wf-props'].join('\n'),
    })
    expect(result.path).toBe('/wf-props')
    expect(result.source).toBe('application.properties')
  })

  test('bootstrap.yaml consulted when application files absent', () => {
    const result = resolveServiceRootPath({
      'bootstrap.yaml': ['spring:', '  application:', '    webflux:', '      base-path: /bootstrap-root'].join('\n'),
    })
    expect(result.path).toBe('/bootstrap-root')
  })

  test('missing files → empty result, no throw', () => {
    expect(resolveServiceRootPath({})).toEqual({ path: '', warnings: [] })
  })
})

describe('resolveServiceRootPathFromDir', () => {
  test('resolves webflux base-path from fixture directory with auto profile', () => {
    const result = resolveServiceRootPathFromDir(FIXTURE_DIR)
    expect(result.path).toBe('/prod-root')
    expect(result.source).toBe('application-prod.yaml')
  })

  test('nonexistent directory → empty result, no throw', () => {
    const result = resolveServiceRootPathFromDir(path.join(FIXTURE_DIR, 'does-not-exist'))
    expect(result.path).toBe('')
    expect(result.warnings).toEqual([])
  })
})

describe('constraints', () => {
  test('no company or service names hardcoded in resolver source', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'metersphere', 'serviceRootPathResolver.ts'),
      'utf-8'
    )
    expect(source).not.toMatch(/igus|kopla|drawing/i)
  })

  test('no js-yaml or new dependencies imported', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'metersphere', 'serviceRootPathResolver.ts'),
      'utf-8'
    )
    expect(source).not.toContain('js-yaml')
  })
})
