const { httpRequest } = require('../src/metersphere/httpClient.js')
const TokenManager = require('../src/metersphere/tokenManager.js')

describe('HttpClient Phase 1 TS (Jest-like)', () => {
  test('attaches token via override', async () => {
    TokenManager.setToken('COSMIC')
    const mockFetch = async (url: string, opts: Record<string, unknown>) => {
      expect(opts.headers).toBeDefined()
      const headers = opts.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer COSMIC')
      return {
        status: 200,
        headers: { get: (_k: string) => 'application/json', entries: () => [['content-type','application/json']] },
        json: async () => ({ ok: true }),
        text: async () => '{"ok":true}'
      }
    }
    const res = await httpRequest('GET', 'https://example.com', {}, null, undefined, mockFetch)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe('HttpClient TS (AbortController timeout)', () => {
  const tsClient = require('../src/metersphere/httpClient.ts')
  const originalFetch = (globalThis as any).fetch

  afterEach(() => {
    jest.useRealTimers()
    if (originalFetch === undefined) {
      delete (globalThis as any).fetch
    } else {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  test('passes an AbortSignal to fetch', async () => {
    const fetchMock = jest.fn(async (_url: string, _opts: Record<string, unknown>) => ({
      status: 200,
      headers: {
        get: (_k: string) => 'application/json',
        entries: () => [['content-type', 'application/json']],
      },
      json: async () => ({ ok: true }),
      text: async () => '{"ok":true}',
    }))
    ;(globalThis as any).fetch = fetchMock

    const res = await tsClient.httpRequest('GET', 'https://example.com/api')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const opts = fetchMock.mock.calls[0][1] as { signal?: AbortSignal }
    expect(opts.signal).toBeDefined()
    expect(opts.signal!.aborted).toBe(false)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  test('aborts the in-flight fetch on timeout and rejects with the timeout message', async () => {
    jest.useFakeTimers()
    const fetchMock = jest.fn((_url: string, _opts: Record<string, unknown>) => {
      return new Promise<never>(() => {})
    })
    ;(globalThis as any).fetch = fetchMock

    const pending = tsClient.httpRequest('GET', 'https://example.com/slow')
    const assertion = expect(pending).rejects.toThrow('Request timed out after 10s')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const opts = fetchMock.mock.calls[0][1] as { signal?: AbortSignal }
    expect(opts.signal).toBeDefined()
    expect(opts.signal!.aborted).toBe(false)

    jest.advanceTimersByTime(10_000)

    await assertion
    expect(opts.signal!.aborted).toBe(true)

    let thrown: any
    try {
      await pending
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toBe('Request timed out after 10s')
  })
})
