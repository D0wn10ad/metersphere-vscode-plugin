/**
 * Webview scan watchdog + postMessage observability tests.
 *
 * The harness evals the <script> extracted from getControlPanelHtml() under a
 * hand-rolled DOM stub (NO jsdom) with jest fake timers, then drives the
 * captured window message handler exactly as the real webview would.
 */
import { SidebarView } from '../src/metersphere/views/sidebarView'
import { DebugLogger } from '../src/metersphere/debugLogger'

interface StubElement {
  innerHTML: string
  textContent: string
  value: string
  disabled: boolean
  checked: boolean
  style: Record<string, unknown>
  dataset: Record<string, string>
  classList: { add: () => void; remove: () => void; contains: () => boolean }
  addEventListener: () => void
  querySelector: () => StubElement
  querySelectorAll: () => StubElement[]
  closest: () => null
}

function makeEl(): StubElement {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
    style: {},
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: () => {},
    querySelector: makeEl,
    querySelectorAll: () => [],
    closest: () => null,
  }
}

function extractScript(html: string): string {
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('no <script> found in control panel HTML')
  return match[1]
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('SidebarView webview scan watchdog', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  function boot() {
    const els = new Map<string, StubElement>()
    const elFor = (id: string): StubElement => {
      if (!els.has(id)) els.set(id, makeEl())
      return els.get(id) as StubElement
    }
    const documentStub = {
      getElementById: (id: string): StubElement => elFor(id),
      querySelectorAll: (): StubElement[] => [],
    }
    const messageListeners: Array<(event: { data: unknown }) => void> = []
    const windowStub = {
      addEventListener: (type: string, listener: (event: { data: unknown }) => void): void => {
        if (type === 'message') messageListeners.push(listener)
      },
    }
    const vscodeApi = { postMessage: (): Promise<boolean> => Promise.resolve(true) }

    const script = extractScript(SidebarView.getControlPanelHtml())
    const factory = new Function(
      'document', 'window', 'acquireVsCodeApi', 'confirm', 'setTimeout', 'clearTimeout',
      script
    )
    factory(documentStub, windowStub, () => vscodeApi, () => false, globalThis.setTimeout, globalThis.clearTimeout)

    if (messageListeners.length === 0) throw new Error('message handler was not registered')

    return {
      dispatch: (msg: unknown): void => messageListeners.forEach(l => l({ data: msg })),
      statusEl: elFor('status'),
      uploadBtn: elFor('uploadBtn'),
      fileList: elFor('fileList'),
      timerCount: (): number => jest.getTimerCount(),
    }
  }

  test('happy: scanningStarted then scanComplete -> file list shown and the watchdog never fires', () => {
    jest.useFakeTimers()
    const h = boot()

    h.dispatch({ command: 'scanningStarted', data: { message: 'Scanning...' } })
    expect(h.statusEl.innerHTML).toContain('Scanning...')
    expect(h.timerCount()).toBe(1)

    h.dispatch({ command: 'scanComplete', data: { files: ['A.java'] } })
    expect(h.statusEl.innerHTML).toContain('Found 1 Java files')
    expect(h.timerCount()).toBe(0)

    jest.advanceTimersByTime(30_000)
    expect(h.statusEl.innerHTML).toContain('Found 1 Java files')
    expect(h.statusEl.innerHTML).not.toContain('Scan timed out')
  })

  test('failure: scanningStarted only + 30s -> status leaves "Scanning..." and shows the timeout message', () => {
    jest.useFakeTimers()
    const h = boot()

    h.dispatch({ command: 'scanningStarted', data: { message: 'Scanning...' } })
    expect(h.statusEl.innerHTML).toContain('Scanning...')

    jest.advanceTimersByTime(30_000)

    expect(h.statusEl.innerHTML).toContain('Scan timed out - please retry')
    expect(h.statusEl.innerHTML).not.toContain('Scanning...')
    expect(h.uploadBtn.textContent).not.toBe('Scanning...')
  })

  test('watchdog does not fire before 30s and a second scanningStarted re-arms (previous watchdog cleared)', () => {
    jest.useFakeTimers()
    const h = boot()

    h.dispatch({ command: 'scanningStarted', data: { message: 'Scanning...' } })
    jest.advanceTimersByTime(29_999)
    expect(h.statusEl.innerHTML).not.toContain('Scan timed out')

    h.dispatch({ command: 'scanningStarted', data: { message: 'Scanning...' } })
    jest.advanceTimersByTime(20_000)
    expect(h.statusEl.innerHTML).not.toContain('Scan timed out')
    expect(h.statusEl.innerHTML).toContain('Scanning...')

    jest.advanceTimersByTime(10_001)
    expect(h.statusEl.innerHTML).toContain('Scan timed out - please retry')
  })

  test('scanComplete also clears a pending watchdog after the error path is exercised then recovered', () => {
    jest.useFakeTimers()
    const h = boot()

    h.dispatch({ command: 'scanningStarted', data: { message: 'Scanning...' } })
    h.dispatch({ command: 'scanComplete', data: { files: [], error: 'No @RestController found' } })
    jest.advanceTimersByTime(30_000)
    expect(h.statusEl.innerHTML).toContain('Error: No @RestController found')
    expect(h.statusEl.innerHTML).not.toContain('Scan timed out')
  })
})

describe('SidebarView postMessage observability', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(DebugLogger, 'error')
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  test('failed webview.postMessage is logged, not silently swallowed', async () => {
    const view = {
      webview: { postMessage: () => Promise.reject(new Error('webview gone')) },
    }
    SidebarView.registerView('wd-obs-1', view as never)
    try {
      SidebarView.postMessage({ command: 'probe' }, 'wd-obs-1')
      await flush()
      expect(errorSpy).toHaveBeenCalledWith('Sync', 'postMessage failed', expect.any(Error))
    } finally {
      SidebarView.unregisterView('wd-obs-1')
    }
  })

  test('registerView flush of pending messages logs failures instead of swallowing them', async () => {
    SidebarView.postMessage({ command: 'pending-probe' }, 'wd-obs-2')
    const view = {
      webview: { postMessage: () => Promise.reject(new Error('flush failed')) },
    }
    SidebarView.registerView('wd-obs-2', view as never)
    try {
      await flush()
      expect(errorSpy).toHaveBeenCalledWith('Sync', 'postMessage failed', expect.any(Error))
    } finally {
      SidebarView.unregisterView('wd-obs-2')
    }
  })
})
