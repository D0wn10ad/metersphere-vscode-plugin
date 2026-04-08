import { SyncEngine, SyncDirection } from '../src/metersphere/syncEngine'

describe('SyncEngine', () => {
  test('detects conflict when local and remote differ', () => {
    const local = { id: 'api-1', version: 1, body: { name: 'Local' } }
    const remote = { id: 'api-1', version: 1, body: { name: 'Remote' } }
    const hasConflict = SyncEngine.detectConflict(local as any, remote as any)
    expect(hasConflict).toBe(true)
  })

  test('no conflict when local and remote match', () => {
    const local = { id: 'api-1', version: 2, body: { name: 'Same' } }
    const remote = { id: 'api-1', version: 2, body: { name: 'Same' } }
    const hasConflict = SyncEngine.detectConflict(local as any, remote as any)
    expect(hasConflict).toBe(false)
  })

  test('conflict when versions differ', () => {
    const local = { id: 'api-1', version: 1, body: { name: 'Same' } }
    const remote = { id: 'api-1', version: 2, body: { name: 'Same' } }
    const hasConflict = SyncEngine.detectConflict(local as any, remote as any)
    expect(hasConflict).toBe(true)
  })

  test('pull returns remote data', async () => {
    const mockFetch = async () => ({ status: 200, body: { id: 'api-1', name: 'Remote API' } })
    const result = await SyncEngine.pull('api-1', mockFetch as any)
    expect(result.body.name).toBe('Remote API')
  })
})
