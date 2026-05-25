import { resolveVariables, parseEnvVariables, EnvironmentVariables } from '../src/metersphere/variableResolver'

describe('resolveVariables', () => {
  const vars: EnvironmentVariables = { baseUrl: 'http://localhost:8080', apiKey: 'abc123' }

  test('replaces {{var}} in URL', () => {
    expect(resolveVariables('{{baseUrl}}/api/users', vars)).toBe('http://localhost:8080/api/users')
  })

  test('replaces multiple variables', () => {
    expect(resolveVariables('{{baseUrl}}/api/{{apiKey}}/items', vars)).toBe('http://localhost:8080/api/abc123/items')
  })

  test('leaves unknown variables as-is', () => {
    expect(resolveVariables('{{baseUrl}}/{{unknown}}', vars)).toBe('http://localhost:8080/{{unknown}}')
  })

  test('returns original string when no matches', () => {
    expect(resolveVariables('/api/users', vars)).toBe('/api/users')
  })

  test('handles empty variables map', () => {
    expect(resolveVariables('{{baseUrl}}/test', {})).toBe('{{baseUrl}}/test')
  })

  test('replaces in header value', () => {
    expect(resolveVariables('Bearer {{apiKey}}', vars)).toBe('Bearer abc123')
  })

  test('replaces in body string', () => {
    expect(resolveVariables('{"url":"{{baseUrl}}","key":"{{apiKey}}"}', vars)).toBe('{"url":"http://localhost:8080","key":"abc123"}')
  })
})

describe('parseEnvVariables', () => {
  test('parses array format: [{name, value}]', () => {
    const raw = '[{"name":"baseUrl","value":"http://localhost:8080"},{"name":"apiKey","value":"abc123"}]'
    expect(parseEnvVariables(raw)).toEqual({ baseUrl: 'http://localhost:8080', apiKey: 'abc123' })
  })

  test('parses object format: {key: value}', () => {
    const raw = '{"baseUrl":"http://localhost:8080","apiKey":"abc123"}'
    expect(parseEnvVariables(raw)).toEqual({ baseUrl: 'http://localhost:8080', apiKey: 'abc123' })
  })

  test('returns empty object for null/undefined', () => {
    expect(parseEnvVariables(null)).toEqual({})
    expect(parseEnvVariables(undefined)).toEqual({})
  })

  test('returns empty object for empty string', () => {
    expect(parseEnvVariables('')).toEqual({})
  })

  test('returns empty object for invalid JSON', () => {
    expect(parseEnvVariables('not-json')).toEqual({})
  })
})
