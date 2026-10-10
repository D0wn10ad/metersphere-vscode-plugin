import { runScanWithTerminalMessage, ScanLifecycleOptions } from '../src/metersphere/scanLifecycle'

function makeOpts(overrides: Partial<ScanLifecycleOptions>): { opts: ScanLifecycleOptions; posted: Record<string, unknown>[] } {
  const posted: Record<string, unknown>[] = []
  const opts: ScanLifecycleOptions = {
    scan: async () => [],
    post: (msg: Record<string, unknown>) => { posted.push(msg) },
    label: 'test',
    ...overrides,
  }
  return { opts, posted }
}

describe('runScanWithTerminalMessage', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('posts exactly one scanComplete with the file list on success and returns the files', async () => {
    const { opts, posted } = makeOpts({ scan: async () => ['A.java'] })

    const files = await runScanWithTerminalMessage(opts)

    expect(files).toEqual(['A.java'])
    expect(posted).toEqual([{ command: 'scanComplete', data: { files: ['A.java'] } }])
  })

  test('posts exactly one scanComplete with an empty list and the error message when scan rejects, and calls onError with the original error', async () => {
    const onError = jest.fn()
    const boom = new Error('scanner exploded')
    const { opts, posted } = makeOpts({ scan: async () => { throw boom }, onError })

    const files = await runScanWithTerminalMessage(opts)

    expect(files).toEqual([])
    expect(posted).toHaveLength(1)
    expect(posted[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'scanner exploded' } })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
  })

  test('posts exactly one scanComplete with "scan timed out" when scan never settles', async () => {
    jest.useFakeTimers()
    const { opts, posted } = makeOpts({ scan: () => new Promise<string[]>(() => {}) })

    let result: string[] | undefined
    const pending = runScanWithTerminalMessage(opts).then((files: string[]) => { result = files })

    jest.advanceTimersByTime(60_001)
    await pending

    expect(result).toEqual([])
    expect(posted).toHaveLength(1)
    expect(posted[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'scan timed out' } })
  })

  test('ignores a late scan resolution after the hard timeout (no double post)', async () => {
    jest.useFakeTimers()
    let releaseScan: ((files: string[]) => void) | undefined
    const { opts, posted } = makeOpts({ scan: () => new Promise<string[]>(resolve => { releaseScan = resolve }) })

    const pending = runScanWithTerminalMessage(opts)
    jest.advanceTimersByTime(60_001)
    await pending

    releaseScan?.(['late.java'])
    await Promise.resolve()
    await Promise.resolve()

    expect(posted).toHaveLength(1)
    expect(posted[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'scan timed out' } })
  })

  test('honors a custom hardTimeoutMs', async () => {
    jest.useFakeTimers()
    const { opts, posted } = makeOpts({ scan: () => new Promise<string[]>(() => {}), hardTimeoutMs: 5_000 })

    const pending = runScanWithTerminalMessage(opts)
    jest.advanceTimersByTime(5_001)
    await pending

    expect(posted).toHaveLength(1)
    expect(posted[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'scan timed out' } })
  })

  test('does not time out before the hard timeout elapses', () => {
    jest.useFakeTimers()
    const { opts, posted } = makeOpts({ scan: () => new Promise<string[]>(() => {}) })

    runScanWithTerminalMessage(opts)

    jest.advanceTimersByTime(59_999)
    return Promise.resolve().then(() => {
      expect(posted).toHaveLength(0)
    })
  })

  test('stringifies non-Error rejections into the error field', async () => {
    const { opts, posted } = makeOpts({ scan: async () => { throw 'plain string failure' } })

    const files = await runScanWithTerminalMessage(opts)

    expect(files).toEqual([])
    expect(posted[0]).toEqual({ command: 'scanComplete', data: { files: [], error: 'plain string failure' } })
  })
})
