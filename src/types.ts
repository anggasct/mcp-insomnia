export interface InsomniaCollection {
  _type: 'export';
  __export_format: number;
  __export_date: string;
  __export_source: string;
  resources: InsomniaResource[];
}

export interface InsomniaResource {
  _id: string;
  _type: string;
  parentId?: string;
  name: string;
  description?: string;
  modified: number;
  created: number;
}

export interface InsomniaWorkspace extends InsomniaResource {
  _type: 'workspace';
  scope: 'collection' | 'design';
}

export interface InsomniaRequestGroup extends InsomniaResource {
  _type: 'request_group';
  environment?: Record<string, any>;
}

export interface InsomniaRequest extends InsomniaResource {
  _type: 'request';
  url: string;
  method: HttpMethod;
  headers: InsomniaHeader[];
  body?: InsomniaRequestBody;
  parameters: InsomniaParameter[];
  authentication?: InsomniaAuthentication;
  settingStoreCookies?: boolean;
  settingSendCookies?: boolean;
  settingDisableRenderRequestBody?: boolean;
  settingEncodeUrl?: boolean;
  settingRebuildPath?: boolean;
  settingFollowRedirects?: 'global' | 'on' | 'off';
  history?: InsomniaExecution[];
}

export interface InsomniaExecution {
  _id: string;
  parentId: string; // The ID of the request
  timestamp: number;
  response: {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    duration: number;
    size: number;
  };
  error?: {
    message: string;
    stack?: string;
  };
}

export interface InsomniaEnvironment extends InsomniaResource {
  _type: 'environment';
  data: Record<string, any>;
  dataPropertyOrder?: Record<string, number>;
  color?: string;
  isPrivate?: boolean;
}

export interface InsomniaHeader {
  id?: string;
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface InsomniaParameter {
  id?: string;
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface InsomniaRequestBody {
  mimeType?: string;
  text?: string;
  params?: InsomniaFormParameter[];
  fileName?: string;
}

export interface InsomniaFormParameter {
  id?: string;
  name: string;
  value: string;
  description?: string;
  disabled?: boolean;
  type?: 'text' | 'file';
  fileName?: string;
}

export interface InsomniaAuthentication {
  type: 'basic' | 'bearer' | 'oauth1' | 'oauth2' | 'digest' | 'ntlm' | 'aws-iam-v4' | 'hawk';
  username?: string;
  password?: string;
  token?: string;
  prefix?: string;
  disabled?: boolean;
  consumerKey?: string;
  consumerSecret?: string;
  tokenKey?: string;
  tokenSecret?: string;
  signatureMethod?: string;
  grantType?: string;
  accessTokenUrl?: string;
  authorizationUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  service?: string;
}

export type HttpMethod = 
  | 'GET' 
  | 'POST' 
  | 'PUT' 
  | 'DELETE' 
  | 'PATCH' 
  | 'HEAD' 
  | 'OPTIONS'
  | 'CONNECT'
  | 'TRACE';

export interface RequestExecutionResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
  size: number;
  timestamp: string;
}

export interface CreateRequestParams {
  collectionId: string;
  folderId?: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers?: InsomniaHeader[];
  body?: InsomniaRequestBody;
  parameters?: InsomniaParameter[];
  authentication?: InsomniaAuthentication;
  description?: string;
}

export interface UpdateRequestParams {
  requestId: string;
  name?: string;
  method?: HttpMethod;
  url?: string;
  headers?: InsomniaHeader[];
  body?: InsomniaRequestBody;
  parameters?: InsomniaParameter[];
  authentication?: InsomniaAuthentication;
  description?: string;
}

export interface CreateCollectionParams {
  name: string;
  description?: string;
  scope?: 'collection' | 'design';
}

export interface CreateFolderParams {
  collectionId: string;
  parentId?: string;
  name: string;
  description?: string;
}

export interface SetEnvironmentVariableParams {
  collectionId: string;
  environmentId?: string;
  key: string;
  value: any;
  description?: string;
}

export interface CollectionStructure {
  workspace: InsomniaWorkspace;
  folders: InsomniaRequestGroup[];
  requests: InsomniaRequest[];
  environments: InsomniaEnvironment[];
}
