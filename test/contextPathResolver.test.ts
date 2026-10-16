import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  resolveContextPath,
  resolveContextPathFromDir,
} from '../src/metersphere/contextPathResolver'

/**
 * C2 (todo 3): detect-and-prefill context path from Spring config files.
 * Detect only — manual UI input stays authoritative; resolver output never
 * overrides it. Line-based parsing, NO js-yaml dependency.
 */
describe('resolveContextPath (pure file-map API)', () => {
  it('detects server.servlet.context-path from application.yaml', () => {
    const result = resolveContextPath({
      'application.yaml': [
        'server:',
        '  servlet:',
        '    context-path: /shop/v1',
      ].join('\n'),
    })
    expect(result.contextPath).toBe('/shop/v1')
    expect(result.warnings).toEqual([])
  })

  it('detects server.servlet.context-path from application.properties', () => {
    const result = resolveContextPath({
      'application.properties': 'server.servlet.context-path=/shop/v1\n',
    })
    expect(result.contextPath).toBe('/shop/v1')
  })

  it('detects server.servlet.context-path from bootstrap.yaml', () => {
    const result = resolveContextPath({
      'bootstrap.yml': 'server:\n  servlet:\n    context-path: /boot/root\n',
    })
    expect(result.contextPath).toBe('/boot/root')
  })

  it('detects flattened dotted key in yaml', () => {
    const result = resolveContextPath({
      'application.yaml': 'server.servlet.context-path: /flat/path\n',
    })
    expect(result.contextPath).toBe('/flat/path')
  })

  it('prefers the active profile variant application-{profile}.yaml over the default', () => {
    const result = resolveContextPath(
      {
        'application.yaml': 'server:\n  servlet:\n    context-path: /base\n',
        'application-prod.yaml':
          'server:\n  servlet:\n    context-path: /prod\n',
      },
      { activeProfile: 'prod' }
    )
    expect(result.contextPath).toBe('/prod')
  })

  it('uses the default value when the active profile has no variant', () => {
    const result = resolveContextPath(
      {
        'application.yaml': 'server:\n  servlet:\n    context-path: /base\n',
        'application-dev.yaml':
          'server:\n  servlet:\n    context-path: /dev\n',
      },
      { activeProfile: 'prod' }
    )
    expect(result.contextPath).toBe('/base')
    expect(result.warnings).toEqual([])
  })

  it('ignores inactive profile variants when no active profile is set', () => {
    const result = resolveContextPath({
      'application.yaml': 'server:\n  servlet:\n    context-path: /base\n',
      'application-prod.yaml':
        'server:\n  servlet:\n    context-path: /prod\n',
    })
    expect(result.contextPath).toBe('/base')
  })

  it('reads spring.profiles.active from config to pick the matching variant', () => {
    const result = resolveContextPath({
      'application.yaml': [
        'spring:',
        '  application:',
        '    name: demo',
        '  profiles:',
        '    active: prod',
        'server:',
        '  servlet:',
        '    context-path: /base',
      ].join('\n'),
      'application-prod.yaml':
        'server:\n  servlet:\n    context-path: /prod\n',
    })
    expect(result.contextPath).toBe('/prod')
  })

  it('handles --- multi-doc yaml: doc marked with the active profile wins', () => {
    const result = resolveContextPath(
      {
        'application.yaml': [
          'server:',
          '  servlet:',
          '    context-path: /base',
          '---',
          'spring:',
          '  profiles: prod',
          'server:',
          '  servlet:',
          '    context-path: /prod',
        ].join('\n'),
      },
      { activeProfile: 'prod' }
    )
    expect(result.contextPath).toBe('/prod')
  })

  it('handles --- multi-doc yaml with a single default doc', () => {
    const result = resolveContextPath({
      'application.yaml': [
        'spring:',
        '  application:',
        '    name: demo',
        '---',
        'server:',
        '  servlet:',
        '    context-path: /multi',
      ].join('\n'),
    })
    expect(result.contextPath).toBe('/multi')
  })

  it('detects spring.mvc.servlet.path but does NOT apply it', () => {
    const result = resolveContextPath({
      'application.yaml': [
        'spring:',
        '  mvc:',
        '    servlet:',
        '      path: /mvc',
      ].join('\n'),
    })
    expect(result.contextPath).toBe('')
    expect(result.mvcServletPath).toBe('/mvc')
  })

  it('never merges spring.mvc.servlet.path into an existing context-path', () => {
    const result = resolveContextPath({
      'application.yaml': [
        'server:',
        '  servlet:',
        '    context-path: /shop/v1',
        'spring:',
        '  mvc:',
        '    servlet:',
        '      path: /mvc',
      ].join('\n'),
    })
    expect(result.contextPath).toBe('/shop/v1')
    expect(result.mvcServletPath).toBe('/mvc')
  })

  it('keeps ${ENV_VAR} literal (never expanded)', () => {
    const result = resolveContextPath({
      'application.yaml':
        'server:\n  servlet:\n    context-path: ${CTX_ROOT}\n',
    })
    expect(result.contextPath).toBe('${CTX_ROOT}')
  })

  it('keeps a literal placeholder in application.properties (never expanded)', () => {
    const result = resolveContextPath({
      'application.properties': 'server.servlet.context-path=${CTX_ROOT}\n',
    })
    expect(result.contextPath).toBe('${CTX_ROOT}')
  })

  it('normalizes leading and trailing slashes', () => {
    expect(
      resolveContextPath({
        'application.yaml': 'server:\n  servlet:\n    context-path: shop/v1\n',
      }).contextPath
    ).toBe('/shop/v1')
    expect(
      resolveContextPath({
        'application.yaml': 'server:\n  servlet:\n    context-path: /shop/v1/\n',
      }).contextPath
    ).toBe('/shop/v1')
    expect(
      resolveContextPath({
        'application.properties': 'server.servlet.context-path=/shop/v1/\n',
      }).contextPath
    ).toBe('/shop/v1')
  })

  it('returns empty + warning on multi-module conflict (no guessing)', () => {
    const result = resolveContextPath({
      'moduleA/application.yaml':
        'server:\n  servlet:\n    context-path: /module-a\n',
      'moduleB/application.yaml':
        'server:\n  servlet:\n    context-path: /module-b\n',
    })
    expect(result.contextPath).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/context-path/i)
  })

  it('returns empty + warning when default multi-doc docs disagree', () => {
    const result = resolveContextPath({
      'application.yaml': [
        'server:',
        '  servlet:',
        '    context-path: /one',
        '---',
        'server:',
        '  servlet:',
        '    context-path: /two',
      ].join('\n'),
    })
    expect(result.contextPath).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('returns empty + warning when active-profile sources disagree', () => {
    const result = resolveContextPath(
      {
        'moduleA/application-prod.yaml':
          'server:\n  servlet:\n    context-path: /a\n',
        'moduleB/application-prod.yaml':
          'server:\n  servlet:\n    context-path: /b\n',
      },
      { activeProfile: 'prod' }
    )
    expect(result.contextPath).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('does not crash on malformed yaml and returns empty + warning', () => {
    const result = resolveContextPath({
      'application.yaml': 'server:\n  servlet:\n    context-path: /a\n\t\t##{ broken \x00',
    })
    expect(typeof result.contextPath).toBe('string')
    expect(result.contextPath === '' || result.contextPath === '/a').toBe(true)
  })

  it('does not crash on truncated yaml (key without value at EOF)', () => {
    const result = resolveContextPath({
      'application.yaml': 'server:\n  servlet:\n    context-path:',
    })
    expect(result.contextPath).toBe('')
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('does not crash on malformed properties (no = sign) and ignores the line', () => {
    const result = resolveContextPath({
      'application.properties': 'server.servlet.context-path\nnot a valid line ===\n',
    })
    expect(result.contextPath).toBe('')
    expect(Array.isArray(result.warnings)).toBe(true)
  })

  it('returns empty (no warning required) when no config files are present', () => {
    const result = resolveContextPath({})
    expect(result.contextPath).toBe('')
    expect(result.warnings).toEqual([])
  })

  it('treats root context-path "/" as no context path', () => {
    const result = resolveContextPath({
      'application.yaml': 'server:\n  servlet:\n    context-path: /\n',
    })
    expect(result.contextPath).toBe('')
  })

  it('ignores yaml comments and quoted values', () => {
    const result = resolveContextPath({
      'application.yaml': [
        '# server config',
        'server:',
        '  servlet:',
        '    context-path: "/quoted/path"',
      ].join('\n'),
    })
    expect(result.contextPath).toBe('/quoted/path')
  })
})

describe('resolveContextPathFromDir (end-to-end fs scan)', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-ctxpath-'))
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('detects the exact context-path from a fixture application.yaml end-to-end', () => {
    const yaml = [
      'server:',
      '  port: 8080',
      '  servlet:',
      '    context-path: /shop/v1',
      'spring:',
      '  application:',
      '    name: shop-service',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(tmpRoot, 'application.yaml'), yaml, 'utf8')

    const result = resolveContextPathFromDir(tmpRoot)
    expect(result.contextPath).toBe('/shop/v1')
    expect(result.warnings).toEqual([])
  })

  it('detects from application.properties in a nested module dir', () => {
    const moduleDir = path.join(tmpRoot, 'svc-a')
    fs.mkdirSync(moduleDir, { recursive: true })
    fs.writeFileSync(
      path.join(moduleDir, 'application.properties'),
      'server.servlet.context-path=/nested/root\n',
      'utf8'
    )
    expect(resolveContextPathFromDir(tmpRoot).contextPath).toBe('/nested/root')
  })

  it('returns empty + warning when two modules configure different values', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'moduleA.yaml'),
      'server:\n  servlet:\n    context-path: /a\n',
      'utf8'
    )
    fs.writeFileSync(
      path.join(tmpRoot, 'moduleB.yaml'),
      'server:\n  servlet:\n    context-path: /b\n',
      'utf8'
    )
    // moduleX.yaml is not an application/bootstrap file -> nothing found
    expect(resolveContextPathFromDir(tmpRoot).contextPath).toBe('')

    const modA = path.join(tmpRoot, 'modA')
    const modB = path.join(tmpRoot, 'modB')
    fs.mkdirSync(modA)
    fs.mkdirSync(modB)
    fs.writeFileSync(
      path.join(modA, 'application.yaml'),
      'server:\n  servlet:\n    context-path: /a\n',
      'utf8'
    )
    fs.writeFileSync(
      path.join(modB, 'application.yaml'),
      'server:\n  servlet:\n    context-path: /b\n',
      'utf8'
    )
    const result = resolveContextPathFromDir(tmpRoot)
    expect(result.contextPath).toBe('')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('does not crash on a directory with no spring config files', () => {
    const result = resolveContextPathFromDir(tmpRoot)
    expect(result.contextPath).toBe('')
    expect(result.warnings).toEqual([])
  })

  it('skips node_modules while scanning', () => {
    const nm = path.join(tmpRoot, 'node_modules', 'pkg')
    fs.mkdirSync(nm, { recursive: true })
    fs.writeFileSync(
      path.join(nm, 'application.yaml'),
      'server:\n  servlet:\n    context-path: /from-deps\n',
      'utf8'
    )
    fs.writeFileSync(
      path.join(tmpRoot, 'application.yaml'),
      'server:\n  servlet:\n    context-path: /real\n',
      'utf8'
    )
    expect(resolveContextPathFromDir(tmpRoot).contextPath).toBe('/real')
  })
})
