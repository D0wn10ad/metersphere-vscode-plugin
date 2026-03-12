import { fetchWithProxy } from './http';
import { buildAuthHeaders } from './auth';
import { MSWorkSpace, MSProject, MSModule, MSProjectVersion } from '../types';

export class MsApiClient {
  public baseUrl: string;
  private accessKey: string;
  private secretKey: string;

  constructor(url: string, accessKey: string, secretKey: string) {
    this.baseUrl = url.replace(/\/$/, '');
    this.accessKey = accessKey;
    this.secretKey = secretKey;
  }

  private async request(method: string | undefined, path: string, body?: any): Promise<any> {
    let finalUrl = `${this.baseUrl}${path}`;
    const headers: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...buildAuthHeaders(this.accessKey, this.secretKey)
    };
    // default method: GET if no body, POST if body present
    let fetchMethod: string = (method ?? (body ? 'POST' : 'GET')) as string;
    // Prepare fetch options
    const fetchOpts: any = { method: fetchMethod as any, headers };

    // If GET or (no explicit method and body exists), map body fields to query string
    const toQuery = (params: any): string => {
      if (!params || typeof params !== 'object') return '';
      return Object.entries(params)
        .filter(([k, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    };

    if ((fetchMethod === 'GET') && body && typeof body === 'object') {
      const qs = toQuery(body);
      if (qs) finalUrl += (finalUrl.includes('?') ? '&' : '?') + qs;
      // Do not send body for GET
    } else if (body != null) {
      fetchOpts.body = JSON.stringify(body);
    }

    const resp = await fetchWithProxy(finalUrl, fetchOpts);
    const data = await (async () => (typeof resp.json === 'function' ? await resp.json() : null))();
    return { ok: resp.ok, status: resp.status, data };
  }

  async testConnection(): Promise<boolean> {
    try {
      const r = await this.request('GET', '/currentUser');
      return r.ok && r.status === 200;
    } catch (e) {
      console.error('Connection test failed:', e);
      return false;
    }
  }

  async getUserInfo(): Promise<any> {
    const r = await this.request('GET', '/currentUser');
    return r.data;
  }

  async getWorkSpaces(): Promise<MSWorkSpace[]> {
    const r = await this.request('GET', '/workspace/list/userworkspace');
    return r.data?.data ?? [];
  }

  async getProjects(workspaceId: string): Promise<MSProject[]> {
    const r = await this.request('POST', '/project/list/related', { workspaceId });
    return r.data?.data ?? [];
  }

  async getModules(projectId: string, protocol: string = 'HTTP'): Promise<MSModule[]> {
    const r = await this.request('GET', `/api/module/list/${projectId}/${protocol}`);
    return r.data?.data ?? [];
  }

  async getVersions(projectId: string): Promise<MSProjectVersion[]> {
    const r = await this.request('GET', `/project/version/get-project-versions/${projectId}`);
    return r.data?.data ?? [];
  }

  async isVersionEnabled(projectId: string): Promise<boolean> {
    try {
      const r = await this.request('GET', `/project/version/enable/${projectId}`);
      return !!(r.data?.data === true);
    } catch {
      return false;
    }
  }

  async uploadDefinition(file: Buffer, params: Record<string, any>): Promise<boolean> {
    // Lightweight JSON payload; in real scenario consider form-data
    const payload = { file: file.toString('base64'), ...params };
    const r = await this.request('POST', '/api/definition/import', payload);
    return r.status === 200 || r.status === 201;
  }
}
