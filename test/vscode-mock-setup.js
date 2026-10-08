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

class Position {
  constructor(line, character) {
    this.line = line
    this.character = character
  }
}

// Per-test configurable stub. Each test sets its own stub via
// globalThis.__vscodeMock = { hover, symbols, extensions, documents, delayMs };
// the factory below reads it at CALL time (not at factory time).
const DEFAULT_MOCK = { hover: undefined, symbols: undefined, extensions: [], documents: {}, delayMs: 0 }

function mockConfig() {
  return globalThis.__vscodeMock || DEFAULT_MOCK
}

jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key) => store[key],
      update: (key, value) => { store[key] = value; return Promise.resolve() }
    }),
    openTextDocument: (uri) => {
      const cfg = mockConfig()
      const key = typeof uri === 'string' ? uri : uri && uri.fsPath
      const source = cfg.documents ? cfg.documents[key] : undefined
      return Promise.resolve({ getText: () => (source === undefined ? '' : source) })
    },
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  EventEmitter: MockEventEmitter,
  Uri: {
    parse: (s) => ({ toString: () => s, fsPath: s, scheme: 'file' }),
  },
  Position,
  extensions: {
    get all() {
      return mockConfig().extensions || []
    },
  },
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
    createStatusBarItem: (alignment, priority) => ({
      text: '',
      tooltip: undefined,
      color: undefined,
      command: undefined,
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    showQuickPick: (items, options) => Promise.resolve(items[0]),
    showInputBox: (options) => Promise.resolve(''),
    showInformationMessage: (message) => Promise.resolve(),
    showErrorMessage: (message) => Promise.resolve(),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: (command, ...args) => {
      const cfg = mockConfig()
      const dispatch = () => {
        if (command === 'vscode.executeHoverProvider') {
          return cfg.hover ? cfg.hover(...args) : []
        }
        if (command === 'vscode.executeWorkspaceSymbolProvider') {
          return cfg.symbols ? cfg.symbols(...args) : []
        }
        return undefined
      }
      const delay = cfg.delayMs || 0
      if (delay > 0) {
        return new Promise((resolve) => setTimeout(() => resolve(dispatch()), delay))
      }
      return Promise.resolve(dispatch())
    },
  },
  ViewColumn: { One: 1, Two: 2, Three: 3 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
}), { virtual: true })
