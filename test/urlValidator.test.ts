const { validateMsUrl } = require('../src/metersphere/urlValidator')

describe('urlValidator SSRF protections', () => {
  test('blocks loopback 127.0.0.1', () => {
    const res = validateMsUrl('http://127.0.0.1:8080/api')
    expect(res.valid).toBe(false)
    expect(res.error).toBeDefined()
  })

  test('blocks cloud metadata 169.254.169.254', () => {
    const res = validateMsUrl('http://169.254.169.254/latest/meta-data')
    expect(res.valid).toBe(false)
    expect(res.error).toBeDefined()
  })

  test('blocks private IP 192.168.1.1', () => {
    const res = validateMsUrl('http://192.168.1.1/')
    expect(res.valid).toBe(false)
    expect(res.error).toBeDefined()
  })

  test('blocks private IP 10.0.0.1', () => {
    const res = validateMsUrl('http://10.0.0.1/')
    expect(res.valid).toBe(false)
    expect(res.error).toBeDefined()
  })

  test('allows localhost (documented default config)', () => {
    const res = validateMsUrl('http://localhost:8080')
    expect(res.valid).toBe(true)
  })

  test('blocks non-http schemes', () => {
    expect(validateMsUrl('file:///etc/passwd').valid).toBe(false)
    expect(validateMsUrl('ftp://example.com').valid).toBe(false)
    expect(validateMsUrl('javascript:alert(1)').valid).toBe(false)
  })

  test('allows public hostnames', () => {
    const res = validateMsUrl('https://example.com')
    expect(res.valid).toBe(true)
  })

  test('allows public IPs', () => {
    const res = validateMsUrl('https://8.8.8.8')
    expect(res.valid).toBe(true)
  })

  test('allowlist overrides blocked ranges', () => {
    const res = validateMsUrl('http://127.0.0.1:8080', { allowlist: ['127.0.0.1'] })
    expect(res.valid).toBe(true)
  })
})
