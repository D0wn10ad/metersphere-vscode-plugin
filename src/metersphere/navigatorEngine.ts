import { NavigatorNode, NodeType } from './models/navigatorNode'
import { HttpResponse } from './httpClient'
import { SettingsManager } from './settingsManager'

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

  private static buildAuthHeaders(): Record<string, string> {
    const ak = SettingsManager.getAccessKey()
    const sk = SettingsManager.getSecretKey()
    if (!ak || !sk) return {}
    return {
      accessKey: ak,
      signature: SettingsManager.generateSignature(ak, sk),
    }
  }

  static async discoverWorkspaces(
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    if (NavigatorEngine.workspaceCache) {
      return NavigatorEngine.workspaceCache
    }
    try {
      const baseUrl = NavigatorEngine.getBaseUrl()
      const headers = NavigatorEngine.buildAuthHeaders()
      const resp = await fetchFn('GET', `${baseUrl}/workspace/list/userworkspace`, headers)
      const data = (resp.body as { data: MsWorkspace[] }).data ?? []
      const nodes = data.map(ws => new NavigatorNode({
        id: ws.id,
        name: ws.name,
        type: NodeType.WORKSPACE,
      }))
      NavigatorEngine.workspaceCache = nodes
      return nodes
    } catch (error) {
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
    const headers = NavigatorEngine.buildAuthHeaders()
    const resp = await fetchFn('POST', `${baseUrl}/project/list/related`, headers, body)
    const data = (resp.body as { data: MsProject[] }).data ?? []
    return data.map(proj => new NavigatorNode({
      id: proj.id,
      name: proj.name,
      type: NodeType.PROJECT,
      parentId: proj.workspaceId ?? workspaceId,
    }))
  }

  static async discoverModules(
    projectId: string,
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    const baseUrl = NavigatorEngine.getBaseUrl()
    const headers = NavigatorEngine.buildAuthHeaders()
    const resp = await fetchFn('GET', `${baseUrl}/api/module/list/${projectId}/HTTP`, headers)
    const data = (resp.body as { data: MsModule[] }).data ?? []
    return data.map(mod => new NavigatorNode({
      id: mod.id,
      name: mod.name,
      type: NodeType.MODULE,
      parentId: mod.parentId,
    }))
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
