import { ApiTemplate, Method } from '../../src/metersphere/models/apiTemplate'

describe('ApiTemplate', () => {
  test('creates template from NavigatorNode', () => {
    const template = new ApiTemplate({
      name: 'Get Users',
      method: Method.GET,
      url: '/api/users',
      path: '/api/users',
      moduleId: 'mod-1',
      projectId: 'proj-1',
    })
    expect(template.method).toBe('GET')
    expect(template.url).toBe('/api/users')
    expect(template.headers).toEqual({})
    expect(template.body).toBeUndefined()
  })

  test('toWebviewPayload returns correct shape', () => {
    const template = new ApiTemplate({
      name: 'Create User',
      method: Method.POST,
      url: '/api/users',
      path: '/api/users',
    })
    const payload = template.toWebviewPayload()
    expect(payload.command).toBe('prefill')
    expect(payload.name).toBe('Create User')
    expect(payload.method).toBe('POST')
    expect(payload.url).toBe('/api/users')
  })
})