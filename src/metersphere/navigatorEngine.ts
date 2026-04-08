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
}

export class NavigatorEngine {
  private static workspaceCache: NavigatorNode[] | null = null

  static clearCache(): void {
    NavigatorEngine.workspaceCache = null
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
  }

  static async discoverProjects(
    workspaceId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
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
  }

  static async discoverModules(
    projectId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    const baseUrl = NavigatorEngine.getBaseUrl()
    const headers = NavigatorEngine.buildAuthHeaders()
    const url = `${baseUrl}/api/api/module/list/${projectId}/HTTP`
    
    DebugLogger.log('Navigator', 'Discovering modules', { projectId, url, hasHeaders: !!headers.accessKey })
    
    try {
      const resp = await fetchFn('GET', url, headers)
      DebugLogger.log('Navigator', 'Modules response', { status: resp.status, body: resp.body })
      
      const data = (resp.body as { data: MsModule[] }).data ?? []
      DebugLogger.log('Navigator', 'Modules discovered', { count: data.length, modules: data.map(m => ({ id: m.id, name: m.name })) })
      
      return data.map(mod => new NavigatorNode({
        id: mod.id,
        name: mod.name,
        type: NodeType.MODULE,
        parentId: mod.parentId,
      }))
    } catch (error) {
      DebugLogger.error('Navigator', 'Failed to discover modules', error)
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
