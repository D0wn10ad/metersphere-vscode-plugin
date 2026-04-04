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
