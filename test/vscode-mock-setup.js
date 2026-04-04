const store = {}

class MockEventEmitter {
  constructor() {
    this._listeners = []
  }
  get event() {
    return (listener) => {
      this._listeners.push(listener)
      return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener) } }
    }
  }
  fire(data) {
    this._listeners.forEach(l => l(data))
  }
  dispose() {}
}

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key) => store[key],
      update: (key, value) => { store[key] = value; return Promise.resolve() }
    })
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  EventEmitter: MockEventEmitter,
  window: {
    createWebviewPanel: () => ({
      viewType: 'test',
      title: 'test',
      webview: { html: '', onDidReceiveMessage: () => ({ dispose: () => {} }), postMessage: () => Promise.resolve(true) },
      onDidDispose: { addListener: () => ({ dispose: () => {} }) },
      dispose: () => {},
      reveal: () => {},
    }),
    createTreeView: (_viewId, options) => ({
      treeDataProvider: options?.treeDataProvider,
      selection: [],
      dispose: () => {},
    }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
  },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}), { virtual: true })
