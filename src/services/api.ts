import axios, { AxiosInstance } from 'axios';
import { buildAuthHeaders } from './auth';
import { MSWorkSpace, MSProject, MSModule, MSProjectVersion } from '../types';

export class MsApiClient {
  private client: AxiosInstance;
  public baseUrl: string;
  private accessKey: string;
  private secretKey: string;
  
  constructor(url: string, accessKey: string, secretKey: string) {
    this.baseUrl = url.replace(/\/$/, '');
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      const headers = buildAuthHeaders(this.accessKey, this.secretKey);
      Object.assign(config.headers, headers);
      return config;
    });
  }
  
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/currentUser');
      return response.status === 200;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
  
  async getUserInfo(): Promise<any> {
    const response = await this.client.get('/user/key/validate');
    return response.data;
  }
  
  async getWorkSpaces(): Promise<MSWorkSpace[]> {
    const response = await this.client.get('/workspace/list/userworkspace');
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error('Failed to fetch workspaces');
  }
  
  async getProjects(workspaceId: string): Promise<MSProject[]> {
    const response = await this.client.post('/project/list/related', { workspaceId });
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error('Failed to fetch projects');
  }
  
  async getModules(projectId: string, protocol: string = 'HTTP'): Promise<MSModule[]> {
    const response = await this.client.get(`/api/module/list/${projectId}/${protocol}`);
    if (response.data.success) {
      return response.data.data;
    }
    throw new Error('Failed to fetch modules');
  }
  
  async getVersions(projectId: string): Promise<MSProjectVersion[]> {
    const response = await this.client.get(`/project/version/get-project-versions/${projectId}`);
    if (response.data.success) {
      return response.data.data;
    }
    return [];
  }
  
  async isVersionEnabled(projectId: string): Promise<boolean> {
    try {
      const response = await this.client.get(`/project/version/enable/${projectId}`);
      return response.data.success && response.data.data === true;
    } catch {
      return false;
    }
  }
  
  async uploadDefinition(file: Buffer, params: Record<string, any>): Promise<boolean> {
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('file', file, { filename: 'collection.json', contentType: 'application/json' });
    form.append('request', JSON.stringify(params));
    
    const response = await this.client.post('/api/definition/import', form, {
      headers: {
        ...form.getHeaders()
      }
    });
    
    return response.status === 200 || response.status === 201;
  }
}
