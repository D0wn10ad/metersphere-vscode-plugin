import { NavigatorNode, NodeType } from './models/navigatorNode'
import { HttpResponse } from './httpClient'

interface MsWorkspace {
  id: string
  name: string
}

interface MsProject {
  id: string
  name: string
  workspaceId: string
}

export class NavigatorEngine {
  private static workspaceCache: NavigatorNode[] | null = null

  static clearCache(): void {
    NavigatorEngine.workspaceCache = null
  }

  static async discoverWorkspaces(
    fetchFn: (method: string, url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>
  ): Promise<NavigatorNode[]> {
    if (NavigatorEngine.workspaceCache) {
      return NavigatorEngine.workspaceCache
    }
    const baseUrl = NavigatorEngine.getBaseUrl()
    const resp = await fetchFn('GET', `${baseUrl}/workspace/list`, {})
    const data = (resp.body as { data: MsWorkspace[] }).data ?? []
    const nodes = data.map(ws => new NavigatorNode({
      id: ws.id,
      name: ws.name,
      type: NodeType.WORKSPACE,
    }))
    NavigatorEngine.workspaceCache = nodes
    return nodes
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
    const { SettingsManager } = require('./settingsManager')
    return SettingsManager.getMsUrl() ?? 'http://localhost:8080'
  }
}
