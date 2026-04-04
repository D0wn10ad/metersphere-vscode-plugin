const store = {}
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key) => store[key],
      update: (key, value) => { store[key] = value; return Promise.resolve() }
    })
  }
}), { virtual: true })
