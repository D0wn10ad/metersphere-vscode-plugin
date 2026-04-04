describe('Phase 2 Extension Bootstrap', () => {
  test('metersphere.navigator.view is registered in package.json', () => {
    const pkg = require('../package.json')
    const views = pkg.contributes?.views?.['metersphere.navigator'] ?? []
    expect(views.length).toBeGreaterThan(0)
    expect(views[0].id).toBe('metersphere.navigator.view')
  })

  test('Phase 2 commands are registered in package.json', () => {
    const pkg = require('../package.json')
    const commands = pkg.contributes?.commands ?? []
    const cmdIds = commands.map((c: any) => c.command)
    expect(cmdIds).toContain('metersphere.refreshNavigator')
    expect(cmdIds).toContain('metersphere.openNavigator')
    expect(cmdIds).toContain('metersphere.prefillFromNode')
  })

  test('activation events include Phase 2 commands', () => {
    const pkg = require('../package.json')
    const events = pkg.activationEvents ?? []
    expect(events.some((e: string) => e.includes('metersphere.refreshNavigator'))).toBe(true)
    expect(events.some((e: string) => e.includes('metersphere.openNavigator'))).toBe(true)
  })
})
