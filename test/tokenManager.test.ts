const { setToken, getToken, applyAuth } = require('../src/metersphere/tokenManager.js')

describe('TokenManager Phase 1 TS (Jest-like)', () => {
  test('persist and apply token', () => {
    setToken('PHASE1_TOK')
    expect(getToken()).toBe('PHASE1_TOK')
    const headers: Record<string, string> = {}
    applyAuth(headers)
    expect(headers.Authorization).toBe('Bearer PHASE1_TOK')
  })
})
