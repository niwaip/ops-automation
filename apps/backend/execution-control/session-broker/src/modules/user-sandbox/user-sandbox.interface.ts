export type UserSandboxState = 'running' | 'paused' | 'stopped' | 'not_found' | 'error';

export interface UserSandboxEndpoints {
  workspaceUrl?: string;
  httpPort?: number;
  internalIp?: string;
}

export interface UserSandboxStatus {
  userId: string;
  containerId?: string;
  containerName: string;
  status: UserSandboxState;
  workspacePath: string;
  knowledgePath: string;
  endpoints?: UserSandboxEndpoints;
  createdAt?: string;
  lastActiveAt?: string;
  uptimeSeconds?: number;
  cpuLimit?: number;
  memoryLimitMb?: number;
}

export interface UserSandboxLaunchOptions {
  modelApiKey?: string;
  cpuLimit?: number;
  memoryLimitMb?: number;
  customEnv?: Record<string, string>;
}

export interface UserSandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  containerName: string;
}

export interface UserSandboxHarnessResult {
  success: boolean;
  output: string;
  containerName: string;
  durationMs: number;
  exitCode: number;
}

