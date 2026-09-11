export interface UserSandboxStatus {
  userId: string;
  containerId?: string;
  containerName: string;
  status: 'running' | 'paused' | 'stopped' | 'not_found' | 'error';
  workspacePath: string;
  knowledgePath: string;
  endpoints?: {
    internalIp?: string;
    httpPort?: number;
  };
  createdAt?: string;
  lastActiveAt?: string;
  cpuLimit?: number;
  memoryLimitMb?: number;
}
