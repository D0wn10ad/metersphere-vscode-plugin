export interface MeterSphereConfig {
  url: string;
  accessKey: string;
  secretKey: string;
  contextPath: string;
  exportMode: 'fullCoverage' | 'incrementalMerge';
  useJavadoc: boolean;
  nestingDepth: number;
  
  // Runtime (loaded from API)
  workspaceId?: string;
  workspaceName?: string;
  projectId?: string;
  projectName?: string;
  moduleId?: string;
  moduleName?: string;
  versionId?: string;
}

export interface MSWorkSpace {
  id: string;
  name: string;
}

export interface MSProject {
  id: string;
  name: string;
  versionEnable?: boolean;
}

export interface MSModule {
  id: string;
  name: string;
}

export interface MSProjectVersion {
  id: string;
  name: string;
}

// Postman Collection v2.1 types
export interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
}

export interface PostmanInfo {
  name: string;
  description: string;
  schema: string;
  _postman_id?: string;
}

export interface PostmanItem {
  name: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
  response?: PostmanResponse[];
}

export interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl;
}

export interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
}

export interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded';
  raw?: string;
  formdata?: PostmanFormData[];
  jsonSchema?: string;
}

export interface PostmanFormData {
  key: string;
  value: string;
  type: string;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQuery[];
  variable?: PostmanVariable[];
}

export interface PostmanQuery {
  key: string;
  value: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
}

export interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  header: PostmanHeader[];
  body: string;
  originalRequest: PostmanRequest;
}
