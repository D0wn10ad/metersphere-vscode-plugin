import { fetchWithTimeout, FetchTimeoutError } from '../src/metersphere/timeoutFetch'

describe('fetchWithTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('returns the resolved Response and clears the timer when fetch settles in time', async () => {
    jest.useFakeTimers()
    const response = new Response('{"success":true}', { status: 200 })
    const fetchImpl = jest.fn((_url: string, _init?: RequestInit) => Promise.resolve(response))

    const result = await fetchWithTimeout(
      'http://localhost:8081/api',
      { method: 'POST' },
      12_000,
      fetchImpl as unknown as typeof fetch
    )

    expect(result).toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8081/api',
      expect.objectContaining({ method: 'POST', signal: expect.anything() })
    )
    expect(jest.getTimerCount()).toBe(0)
  })

  test('rejects with FetchTimeoutError carrying url and timeoutMs when the timer fires', async () => {
    jest.useFakeTimers()
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')))
      })

    let caught: unknown
    const pending = fetchWithTimeout(
      'http://localhost:8081/api/project/list/related',
      {},
      12_000,
      fetchImpl as unknown as typeof fetch
    ).catch((e: unknown) => { caught = e })

    jest.advanceTimersByTime(12_001)
    await pending

    expect(caught).toBeInstanceOf(FetchTimeoutError)
    const err = caught as FetchTimeoutError
    expect(err.url).toBe('http://localhost:8081/api/project/list/related')
    expect(err.timeoutMs).toBe(12_000)
    expect(err.name).toBe('FetchTimeoutError')
    expect(err.message).toContain('12000ms')
  })

  test('does not abort before timeoutMs has elapsed', () => {
    jest.useFakeTimers()
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')))
      })

    let settled = false
    fetchWithTimeout('http://x', {}, 12_000, fetchImpl as unknown as typeof fetch).catch(() => { settled = true })

    jest.advanceTimersByTime(11_999)
    return Promise.resolve().then(() => {
      expect(settled).toBe(false)
    })
  })

  test('passes through non-timeout fetch errors unchanged', async () => {
    jest.useFakeTimers()
    const boom = new Error('connection refused')
    const fetchImpl = jest.fn(() => Promise.reject<Response>(boom))

    let caught: unknown
    const pending = fetchWithTimeout('http://x', {}, 12_000, fetchImpl as unknown as typeof fetch).catch((e: unknown) => { caught = e })
    await pending

    expect(caught).toBe(boom)
    expect(caught).not.toBeInstanceOf(FetchTimeoutError)
  })

  test('uses the 12s default timeout when timeoutMs is omitted', async () => {
    jest.useFakeTimers()
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })

    let caught: unknown
    const pending = fetchWithTimeout('http://x', {}, undefined, fetchImpl as unknown as typeof fetch).catch((e: unknown) => { caught = e })

    jest.advanceTimersByTime(12_001)
    await pending

    expect(caught).toBeInstanceOf(FetchTimeoutError)
    expect((caught as FetchTimeoutError).timeoutMs).toBe(12_000)
  })
})
