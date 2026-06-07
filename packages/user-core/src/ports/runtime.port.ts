export interface RuntimeConfigPort {
  apiBaseUrl: string;
  websocketBaseUrl?: string;
  controlPlaneApiBaseUrl?: string;
  aiApiBaseUrl?: string;
  hostIp?: string;
  recorderWsUrl?: string;
  noVncUrl?: string;
  officeAddinBaseUrl?: string;
  userWebBaseUrl?: string;
}

export type RuntimeEnvSource = Record<string, string | undefined>;
