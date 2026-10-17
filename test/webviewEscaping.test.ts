/**
 * P1-A1: Webview XSS sinks + credential exposure.
 *
 * 1. escapeHtml unit + JS-twin parity (the twin is injected into webview
 *    <script> blocks so browser-side sinks can escape postMessage data).
 * 2. Server-generated HTML never embeds stored credentials and escapes msUrl.
 * 3. Browser-side sinks (innerHTML driven by postMessage) render escaped
 *    output. Scripts are extracted from the generated HTML and evaluated
 *    under a hand-rolled DOM stub (NO jsdom) — same harness pattern as
 *    sidebarViewWatchdog.test.ts.
 * 4. saveSettings omits empty credential fields end-to-end (webview save()
 *    payload + server-side handleMessage guard).
 */
import { SidebarView } from '../src/metersphere/views/sidebarView'
import { WebViewController } from '../src/metersphere/webviewController'
import { SettingsManager } from '../src/metersphere/settingsManager'
import { escapeHtml, escapeHtmlJs } from '../src/metersphere/escapeHtml'

const vscode = require('vscode')

const PAYLOAD = '<img src=x onerror=alert(1)>"&'
const ESCAPED = '&lt;img src=x onerror=alert(1)&gt;&quot;&amp;'
const SECRET_AK = 'ak-SECRET-VALUE-111'
const SECRET_SK = 'sk-SECRET-VALUE-222'

function setSetting(key: string, value: string): void {
  vscode.workspace.getConfiguration().update(key, value)
}

function expectEscaped(inner: string): void {
  expect(inner).toContain(ESCAPED)
  expect(inner).not.toContain('<img src=x')
}

// --- DOM stub harness -------------------------------------------------------

type Listener = (event: any) => void

interface StubElement {
  innerHTML: string
  textContent: string
  value: string
  disabled: boolean
  checked: boolean
  style: Record<string, unknown>
  dataset: Record<string, string>
  className: string
  classList: { add: Listener; remove: Listener; contains: (c: string) => boolean }
  listeners: Record<string, Listener[]>
  addEventListener(type: string, fn: Listener): void
  appendChild(child: StubElement): void
  querySelector(sel: string): StubElement
  querySelectorAll(sel: string): StubElement[]
  closest(sel: string): null
  parentElement: StubElement | null
  remove(): void
}

function makeEl(id = ''): StubElement {
  const listeners: Record<string, Listener[]> = {}
  const el: StubElement = {
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
    style: {},
    dataset: {},
    className: '',
    listeners,
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: (type, fn) => {
      ;(listeners[type] = listeners[type] || []).push(fn)
    },
    appendChild: () => {},
    querySelector: () => makeEl(id + ':q'),
    querySelectorAll: () => [],
    closest: () => null,
    parentElement: null,
    remove: () => {},
  }
  return el
}

function boot(html: string, opts: { captureSave?: boolean } = {}) {
  const els = new Map<string, StubElement>()
  const elFor = (id: string): StubElement => {
    if (!els.has(id)) els.set(id, makeEl(id))
    return els.get(id) as StubElement
  }
  const messageListeners: Listener[] = []
  const documentStub = {
    getElementById: (id: string): StubElement => elFor(id),
    querySelectorAll: (): StubElement[] => [],
    createElement: (): StubElement => makeEl('created'),
  }
  const windowStub = {
    addEventListener: (type: string, fn: Listener): void => {
      if (type === 'message') messageListeners.push(fn)
    },
  }
  const posted: Array<{ command: string; data?: any }> = []
  const vscodeApi = {
    postMessage: (m: any): Promise<boolean> => {
      posted.push(m)
      return Promise.resolve(true)
    },
  }

  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('no <script> found')
  const body = match[1] + (opts.captureSave ? '\nreturn save;' : '')
  const factory = new Function(
    'document', 'window', 'acquireVsCodeApi', 'confirm', 'setTimeout', 'clearTimeout',
    body
  )
  const save = factory(documentStub, windowStub, () => vscodeApi, () => false, globalThis.setTimeout, globalThis.clearTimeout)

  return {
    dispatch: (msg: unknown): void => messageListeners.forEach(l => l({ data: msg })),
    el: elFor,
    posted,
    save: save as undefined | ((e: { preventDefault: () => void }) => void),
  }
}

// --- 1. escapeHtml helper ---------------------------------------------------

describe('escapeHtml helper', () => {
  test('escapes &, <, >, ", \' with & replaced first', () => {
    expect(escapeHtml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
    expect(escapeHtml(PAYLOAD)).toBe(ESCAPED)
    expect(escapeHtml(null as any)).toBe('')
    expect(escapeHtml(undefined as any)).toBe('')
    expect(escapeHtml(42 as any)).toBe('42')
  })

  test('injected JS twin produces output identical to the TS helper', () => {
    const jsEscape = new Function(`${escapeHtmlJs}\nreturn escapeHtml;`)() as (v: unknown) => string
    for (const s of [PAYLOAD, '&lt;', 'plain', '"quotes"', "it's", 'a&b', '', '<b>', String(200)]) {
      expect(jsEscape(s)).toBe(escapeHtml(s))
    }
    expect(jsEscape(null)).toBe('')
    expect(jsEscape(undefined)).toBe('')
  })
})

// --- 2. server-generated HTML -----------------------------------------------

describe('generated webview HTML: credentials and msUrl', () => {
  beforeEach(() => {
    setSetting('metersphere.msUrl', PAYLOAD)
    setSetting('metersphere.accessKey', SECRET_AK)
    setSetting('metersphere.secretKey', SECRET_SK)
  })

  test('every rendering webview script defines escapeHtml', () => {
    const debugCtrl = new WebViewController({} as never) as unknown as { getHtml(): string }
    const pages: Array<[string, () => string]> = [
      ['settings', () => SidebarView.getSettingsHtml()],
      ['control panel', () => SidebarView.getControlPanelHtml()],
      ['environment', () => SidebarView.getEnvironmentHtml()],
      ['history', () => SidebarView.getHistoryHtml()],
      ['sync', () => SidebarView.getSyncHtml()],
      ['debugger', () => debugCtrl.getHtml()],
    ]
    for (const [name, getHtml] of pages) {
      const html = getHtml()
      if (!html.includes('function escapeHtml(')) {
        throw new Error(`${name} webview script is missing escapeHtml`)
      }
    }
  })

  test('getSettingsHtml never embeds stored credentials; msUrl is escaped', () => {
    const html = SidebarView.getSettingsHtml()
    expect(html).not.toContain(SECRET_AK)
    expect(html).not.toContain(SECRET_SK)
    expect(html).toContain('id="accessKey" value=""')
    expect(html).toContain('id="secretKey" value=""')
    expect(html).toContain('(unchanged)')
    expect(html).not.toContain(PAYLOAD)
    expect(html).toContain(ESCAPED)
  })

  test('getSettingsHtml shows "Not configured" when no credentials stored', () => {
    setSetting('metersphere.accessKey', '')
    setSetting('metersphere.secretKey', '')
    const html = SidebarView.getSettingsHtml()
    expect(html).toContain('Not configured')
    expect(html).not.toContain('(unchanged)')
  })

  test('getControlPanelHtml never embeds stored credentials; msUrl is escaped', () => {
    const html = SidebarView.getControlPanelHtml()
    expect(html).not.toContain(SECRET_AK)
    expect(html).not.toContain(SECRET_SK)
    expect(html).toContain('id="accessKey" value=""')
    expect(html).toContain('id="secretKey" value=""')
    expect(html).toContain('(unchanged)')
    expect(html).toContain('value="' + ESCAPED + '"')
  })

  test('debugger getHtml escapes msUrl and embeds no credentials', () => {
    const ctrl = new WebViewController({} as never) as unknown as { getHtml(): string }
    const html = ctrl.getHtml()
    expect(html).not.toContain(SECRET_AK)
    expect(html).not.toContain(SECRET_SK)
    expect(html).not.toContain(PAYLOAD)
    expect(html).toContain('value="' + ESCAPED + '/api/"')
  })
})

// --- 3. control panel browser-side sinks ------------------------------------

describe('control panel script sinks escape postMessage data', () => {
  test('environment rendering and error are escaped', () => {
    const h = boot(SidebarView.getControlPanelHtml())
    h.dispatch({
      command: 'environmentsLoaded',
      data: {
        environments: [{ name: PAYLOAD, description: PAYLOAD, config: { protocol: 'http', host: PAYLOAD, port: 8080 } }],
      },
    })
    expectEscaped(h.el('envContent').innerHTML)
    h.dispatch({ command: 'environmentsError', data: { message: PAYLOAD } })
    expectEscaped(h.el('envContent').innerHTML)
  })

  test('history rendering (attrs + text) and error are escaped', () => {
    const h = boot(SidebarView.getControlPanelHtml())
    h.dispatch({
      command: 'historyLoaded',
      data: { history: [{ url: PAYLOAD, method: 'GET', status: 200, success: true, timestamp: Date.now() }] },
    })
    expectEscaped(h.el('historyContent').innerHTML)
    h.dispatch({ command: 'historyError', data: { message: PAYLOAD } })
    expectEscaped(h.el('historyContent').innerHTML)
  })

  test('status, module options and file list sinks are escaped', () => {
    const h = boot(SidebarView.getControlPanelHtml())
    h.dispatch({ command: 'uploadError', data: { message: PAYLOAD } })
    expectEscaped(h.el('status').innerHTML)
    h.dispatch({ command: 'loadProjectError', data: { message: PAYLOAD } })
    expectEscaped(h.el('status').innerHTML)
    h.dispatch({ command: 'projectLoaded', name: 'P', data: { modules: [{ id: PAYLOAD, name: PAYLOAD }] } })
    expectEscaped(h.el('moduleSelect').innerHTML)
    h.dispatch({ command: 'javaFilesSelected', files: ['/proj/' + PAYLOAD] })
    expectEscaped(h.el('fileList').innerHTML)
  })
})

// --- 3b. standalone pages ---------------------------------------------------

describe('environment page script sinks escape postMessage data', () => {
  test('env rendering and error are escaped', () => {
    const h = boot(SidebarView.getEnvironmentHtml())
    h.dispatch({
      command: 'environmentsLoaded',
      data: {
        environments: [{ name: PAYLOAD, description: PAYLOAD, config: { protocol: 'http', host: PAYLOAD, port: 8080 } }],
        projectId: 'p1',
      },
    })
    expectEscaped(h.el('content').innerHTML)
    h.dispatch({ command: 'environmentsError', data: { message: PAYLOAD } })
    expectEscaped(h.el('content').innerHTML)
  })
})

describe('history page script sinks escape postMessage data', () => {
  test('history rendering and error are escaped', () => {
    const h = boot(SidebarView.getHistoryHtml())
    h.dispatch({
      command: 'historyLoaded',
      data: { history: [{ url: PAYLOAD, method: 'GET', status: 200, success: true, timestamp: Date.now() }] },
    })
    expectEscaped(h.el('content').innerHTML)
    h.dispatch({ command: 'historyError', data: { message: PAYLOAD } })
    expectEscaped(h.el('content').innerHTML)
  })
})

describe('sync page script sinks escape postMessage data', () => {
  test('file list, modules and status are escaped', () => {
    const h = boot(SidebarView.getSyncHtml())
    h.dispatch({ command: 'javaFilesSelected', files: ['/proj/' + PAYLOAD] })
    expectEscaped(h.el('fileList').innerHTML)
    h.dispatch({ command: 'scanComplete', data: { files: [PAYLOAD] } })
    expectEscaped(h.el('fileList').innerHTML)
    h.dispatch({ command: 'projectLoaded', name: 'P', data: { modules: [{ id: PAYLOAD, name: PAYLOAD }] } })
    expectEscaped(h.el('moduleSelect').innerHTML)
    h.dispatch({ command: 'uploadError', data: { message: PAYLOAD } })
    expectEscaped(h.el('status').innerHTML)
  })
})

describe('debugger script sinks escape postMessage data', () => {
  test('response error and statusText are escaped', () => {
    const ctrl = new WebViewController({} as never) as unknown as { getHtml(): string }
    const h = boot(ctrl.getHtml())
    h.dispatch({ command: 'response', payload: { status: 0, statusText: 'Error', error: PAYLOAD } })
    expectEscaped(h.el('statusBadge').innerHTML)
    h.dispatch({ command: 'response', payload: { status: 500, statusText: PAYLOAD, body: '', headers: {} } })
    expectEscaped(h.el('statusBadge').innerHTML)
  })
})

// --- 4. saveSettings credential handling ------------------------------------

describe('saveSettings credential handling', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('empty credential fields do not overwrite stored keys', async () => {
    const akSpy = jest.spyOn(SettingsManager, 'setAccessKey')
    const skSpy = jest.spyOn(SettingsManager, 'setSecretKey')
    await SidebarView.handleMessage({
      command: 'saveSettings',
      data: { msUrl: 'http://localhost:8080', accessKey: '', secretKey: '', debugEnabled: false },
    })
    expect(akSpy).not.toHaveBeenCalled()
    expect(skSpy).not.toHaveBeenCalled()
  })

  test('non-empty credential fields are stored', async () => {
    const akSpy = jest.spyOn(SettingsManager, 'setAccessKey')
    const skSpy = jest.spyOn(SettingsManager, 'setSecretKey')
    await SidebarView.handleMessage({
      command: 'saveSettings',
      data: { msUrl: 'http://localhost:8080', accessKey: 'ak-new', secretKey: 'sk-new', debugEnabled: false },
    })
    expect(akSpy).toHaveBeenCalledWith('ak-new')
    expect(skSpy).toHaveBeenCalledWith('sk-new')
  })
})

describe('webview save() omits empty credential fields from the payload', () => {
  test('control panel save() posts credentials only when the user typed them', () => {
    const h = boot(SidebarView.getControlPanelHtml(), { captureSave: true })
    h.el('msUrl').value = 'http://localhost:8080'
    h.el('accessKey').value = ''
    h.el('secretKey').value = ''
    h.save!({ preventDefault: () => {} })
    const first = h.posted.filter(m => m.command === 'saveSettings')
    expect(first).toHaveLength(1)
    expect(first[0].data).not.toHaveProperty('accessKey')
    expect(first[0].data).not.toHaveProperty('secretKey')

    h.el('accessKey').value = 'ak-new'
    h.el('secretKey').value = 'sk-new'
    h.save!({ preventDefault: () => {} })
    const second = h.posted.filter(m => m.command === 'saveSettings')
    expect(second[1].data.accessKey).toBe('ak-new')
    expect(second[1].data.secretKey).toBe('sk-new')
  })

  test('settings page save() posts credentials only when the user typed them', () => {
    const h = boot(SidebarView.getSettingsHtml(), { captureSave: true })
    h.el('msUrl').value = 'http://localhost:8080'
    h.el('accessKey').value = ''
    h.el('secretKey').value = ''
    h.save!({ preventDefault: () => {} })
    const first = h.posted.filter(m => m.command === 'saveSettings')
    expect(first).toHaveLength(1)
    expect(first[0].data).not.toHaveProperty('accessKey')
    expect(first[0].data).not.toHaveProperty('secretKey')

    h.el('accessKey').value = 'ak-new'
    h.save!({ preventDefault: () => {} })
    const second = h.posted.filter(m => m.command === 'saveSettings')
    expect(second[1].data.accessKey).toBe('ak-new')
    expect(second[1].data).not.toHaveProperty('secretKey')
  })
})
