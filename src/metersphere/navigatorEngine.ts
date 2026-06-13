import { NavigatorNode, NodeType } from './models/navigatorNode'
import { HttpResponse } from './httpClient'
import { SettingsManager } from './settingsManager'
import { DebugLogger } from './debugLogger'

interface MsWorkspace {
  id: string
  name: string
}

interface MsProject {
  id: string
  name: string
  workspaceId?: string
}

interface MsModule {
  id: string
  name: string
  parentId?: string
  projectId?: string
  children?: MsModule[]
}

interface MsApiDefinition {
  id: string
  name: string
  path: string
  method: string
  moduleId?: string
  projectId?: string
  description?: string
}

export class NavigatorEngine {
  private static workspaceCache: NavigatorNode[] | null = null
  private static contextState: any = null

  static setStateStorage(storage: any): void {
    NavigatorEngine.contextState = storage
  }

  static clearCache(): void {
    NavigatorEngine.workspaceCache = null
  }

  private static async getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000): Promise<T> {
    if (NavigatorEngine.contextState) {
      const cached: { data: T; timestamp: number } | undefined = NavigatorEngine.contextState.get(key)
      if (cached && Date.now() - cached.timestamp < ttlMs) {
        DebugLogger.log('Navigator', `Using cached data for ${key}`, {})
        return cached.data
      }
    }
    const data = await fetcher()
    if (NavigatorEngine.contextState) {
      await NavigatorEngine.contextState.update(key, { data, timestamp: Date.now() })
    }
    return data
  }

  private static summarizeModuleTree(node: NavigatorNode): unknown {
    return {
      id: node.id,
      name: node.name,
      childIds: node.getChildren().map(child => child.id),
      children: node.getChildren().map(child => NavigatorEngine.summarizeModuleTree(child)),
    }
  }

  private static rehydrateModuleTree(mod: {
    id: string
    name: string
    parentId?: string
    projectId?: string
    children?: unknown[]
  }, projectId: string): NavigatorNode {
    const node = new NavigatorNode({
      id: mod.id,
      name: mod.name,
      type: NodeType.MODULE,
      parentId: mod.parentId ?? projectId,
      projectId: mod.projectId || projectId,
    })

    for (const child of Array.isArray(mod.children) ? mod.children : []) {
      const childTree = NavigatorEngine.rehydrateModuleTree(child as {
        id: string
        name: string
        parentId?: string
        projectId?: string
        children?: unknown[]
      }, projectId)
      node.addChild(childTree)
    }

    return node
  }

  private static mapModuleTree(mod: MsModule, projectId: string): NavigatorNode {
    const node = new NavigatorNode({
      id: mod.id,
      name: mod.name,
      type: NodeType.MODULE,
      parentId: mod.parentId ?? projectId,
      projectId: mod.projectId || projectId,
    })

    for (const child of mod.children ?? []) {
      node.addChild(NavigatorEngine.mapModuleTree(child, projectId))
    }

    DebugLogger.log('Navigator', 'Mapped module node', {
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      projectId: node.projectId,
      directChildIds: node.getChildren().map(child => child.id),
      sourceChildCount: mod.children?.length ?? 0,
    })

    return node
  }

  private static buildAuthHeaders(contentType?: string): Record<string, string> {
    const ak = SettingsManager.getAccessKey()
    const sk = SettingsManager.getSecretKey()
    if (!ak || !sk) return {}
    const headers: Record<string, string> = {
      accessKey: ak,
      signature: SettingsManager.generateSignature(ak, sk),
    }
    if (contentType) {
      headers['Content-Type'] = contentType
    }
    return headers
  }

  static async discoverWorkspaces(
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    if (NavigatorEngine.workspaceCache) {
      DebugLogger.log('Navigator', 'Using cached workspaces', { count: NavigatorEngine.workspaceCache.length })
      return NavigatorEngine.workspaceCache
    }
    return NavigatorEngine.getCached('workspaces', async () => {
      try {
        const baseUrl = NavigatorEngine.getBaseUrl()
        const headers = NavigatorEngine.buildAuthHeaders()
        const url = `${baseUrl}/api/workspace/list/userworkspace`
        DebugLogger.log('Navigator', 'Discovering workspaces', { url, hasHeaders: !!headers.accessKey })
        
        const resp = await fetchFn('GET', url, headers)
        DebugLogger.log('Navigator', 'Workspaces response', { status: resp.status, bodyKeys: Object.keys(resp.body ?? {}) })
        
        const data = (resp.body as { data: MsWorkspace[] }).data ?? []
        const nodes = data.map(ws => new NavigatorNode({
          id: ws.id,
          name: ws.name,
          type: NodeType.WORKSPACE,
        }))
        NavigatorEngine.workspaceCache = nodes
        DebugLogger.log('Navigator', 'Workspaces discovered', { count: nodes.length })
        return nodes
      } catch (error) {
        DebugLogger.error('Navigator', 'Failed to discover workspaces', error)
        console.warn('NavigatorEngine: failed to discover workspaces:', error)
        return []
      }
    })
  }

  static async discoverProjects(
    workspaceId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    return NavigatorEngine.getCached(`projects_${workspaceId}`, async () => {
      const baseUrl = NavigatorEngine.getBaseUrl()
      const body = { workspaceIds: [workspaceId] }
      const headers = NavigatorEngine.buildAuthHeaders('application/json')
      const url = `${baseUrl}/api/project/list/related`
      
      DebugLogger.log('Navigator', 'Discovering projects', { workspaceId, url, hasHeaders: !!headers.accessKey })
      
      try {
        const resp = await fetchFn('POST', url, headers, body)
        DebugLogger.log('Navigator', 'Projects response', { status: resp.status, bodyKeys: Object.keys(resp.body ?? {}) })
        
        const data = (resp.body as { data: MsProject[] }).data ?? []
        const nodes = data.map(proj => new NavigatorNode({
          id: proj.id,
          name: proj.name,
          type: NodeType.PROJECT,
          parentId: proj.workspaceId ?? workspaceId,
        }))
        DebugLogger.log('Navigator', 'Projects discovered', { count: nodes.length })
        return nodes
      } catch (error) {
        DebugLogger.error('Navigator', 'Failed to discover projects', error)
        return []
      }
    })
  }

  static async discoverModules(
    projectId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    if (NavigatorEngine.contextState) {
      const cached: { data: unknown[]; timestamp: number } | undefined = NavigatorEngine.contextState.get(`modules_${projectId}`)
      if (cached && Date.now() - cached.timestamp < 300_000) {
        DebugLogger.log('Navigator', `Using cached data for modules_${projectId}`, {})
        return cached.data.map(mod => NavigatorEngine.rehydrateModuleTree(mod as {
          id: string
          name: string
          parentId?: string
          projectId?: string
          children?: unknown[]
        }, projectId))
      }
    }

    return NavigatorEngine.getCached(`modules_${projectId}`, async () => {
      const baseUrl = NavigatorEngine.getBaseUrl()
      const headers = NavigatorEngine.buildAuthHeaders()
      const url = `${baseUrl}/api/api/module/list/${projectId}/HTTP`
      
      DebugLogger.log('Navigator', 'Discovering modules', { projectId, url, hasHeaders: !!headers.accessKey })
      
      try {
        const resp = await fetchFn('GET', url, headers)
        DebugLogger.log('Navigator', 'Modules response', { status: resp.status, body: resp.body })
        
        const data = (resp.body as { data: MsModule[] }).data ?? []
        DebugLogger.log('Navigator', 'Raw top-level module payload summary', {
          projectId,
          modules: data.map(mod => ({
            id: mod.id,
            name: mod.name,
            parentId: mod.parentId,
            childIds: (mod.children ?? []).map(child => child.id),
          })),
        })
        const topLevelModules = data.filter(mod => !mod.parentId || mod.parentId === projectId)
        const nodes = topLevelModules.map(mod => NavigatorEngine.mapModuleTree(mod, projectId))
        DebugLogger.log('Navigator', 'Modules discovered', {
          count: nodes.length,
          modules: nodes.map(node => NavigatorEngine.summarizeModuleTree(node)),
        })
        return nodes
      } catch (error) {
        DebugLogger.error('Navigator', 'Failed to discover modules', error)
        return []
      }
    })
  }

  static async discoverChildModules(
    projectId: string,
    parentModuleId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    const cachedModules = await NavigatorEngine.discoverModules(projectId, fetchFn)
    const stack = [...cachedModules]
    DebugLogger.log('Navigator', 'Searching cached tree for child modules', {
      parentModuleId,
      cachedRootIds: cachedModules.map(node => node.id),
    })

    while (stack.length > 0) {
      const current = stack.shift()
      if (!current) continue
      DebugLogger.log('Navigator', 'Inspecting cached module during child lookup', {
        targetParentModuleId: parentModuleId,
        currentId: current.id,
        currentChildIds: current.getChildren().map(child => child.id),
      })
      if (current.id === parentModuleId) {
        const children = current.getChildren()
        if (children.length > 0) {
          DebugLogger.log('Navigator', 'Child modules discovered', {
            count: children.length,
            parentModuleId,
            source: 'cachedTree',
            childIds: children.map(child => child.id),
          })
          return children
        }
        DebugLogger.log('Navigator', 'Cached parent module had no children, falling back to flat lookup', {
          parentModuleId,
          currentId: current.id,
        })
        break
      }
      stack.push(...current.getChildren())
    }

    const baseUrl = NavigatorEngine.getBaseUrl()
    const headers = NavigatorEngine.buildAuthHeaders()
    const url = `${baseUrl}/api/api/module/list/${projectId}/HTTP`

    DebugLogger.log('Navigator', 'Discovering child modules', { projectId, parentModuleId, url, hasHeaders: !!headers.accessKey })

    try {
      const resp = await fetchFn('GET', url, headers)
      const data = (resp.body as { data: MsModule[] }).data ?? []
      const childModules = data.filter(mod => mod.parentId === parentModuleId)
      const nodes = childModules.map(mod => NavigatorEngine.mapModuleTree(mod, projectId))
      DebugLogger.log('Navigator', 'Child modules discovered', {
        count: nodes.length,
        parentModuleId,
        source: 'flatFallback',
        childIds: nodes.map(node => node.id),
      })
      return nodes
    } catch (error) {
      DebugLogger.error('Navigator', 'Failed to discover child modules', error)
      return []
    }
  }

  static async discoverApis(
    projectId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>,
    moduleId?: string
  ): Promise<NavigatorNode[]> {
    const baseUrl = NavigatorEngine.getBaseUrl()
    const headers = NavigatorEngine.buildAuthHeaders('application/json')
    const url = `${baseUrl}/api/api/definition/list/all`
    const body: Record<string, unknown> = { projectId, protocol: 'HTTP' }
    if (moduleId) body.moduleIds = [moduleId]

    DebugLogger.log('Navigator', 'Discovering APIs', { projectId, moduleId, url })

    try {
      const resp = await fetchFn('POST', url, headers, body)
      DebugLogger.log('Navigator', 'APIs response', { status: resp.status, bodyKeys: Object.keys(resp.body ?? {}) })

      const data = (resp.body as { data: MsApiDefinition[] }).data ?? []
      return data.map(api => new NavigatorNode({
        id: api.id,
        name: `[${api.method}] ${api.path}`,
        type: NodeType.API,
        parentId: moduleId || projectId,
        projectId,
        tooltip: api.description || api.name,
      }))
    } catch (error) {
      DebugLogger.error('Navigator', 'Failed to discover APIs', error)
      return []
    }
  }

  static buildTree(projects: MsProject[]): NavigatorNode[] {
    const projectMap = new Map<string, NavigatorNode>()
    for (const proj of projects) {
      const node = new NavigatorNode({
        id: proj.id,
        name: proj.name,
        type: NodeType.PROJECT,
        parentId: proj.workspaceId,
      })
      projectMap.set(proj.id, node)
    }
    return Array.from(projectMap.values())
  }

  static getBaseUrl(): string {
    return SettingsManager.getMsUrl() ?? 'http://localhost:8080'
  }
}
