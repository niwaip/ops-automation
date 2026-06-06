export interface RuntimeConfigPort {
  apiBaseUrl: string;
  controlPlaneApiBaseUrl?: string;
  aiApiBaseUrl?: string;
  hostIp?: string;
  recorderWsUrl?: string;
  noVncUrl?: string;
  officeAddinBaseUrl?: string;
}

export type RuntimeEnvSource = Record<string, string | undefined>;
