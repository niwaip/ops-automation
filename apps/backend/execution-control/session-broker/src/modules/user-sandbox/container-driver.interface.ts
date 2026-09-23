export interface ContainerInspectData {
  Id: string;
  Name?: string;
  State?: {
    Status?: string;
    Running?: boolean;
    Paused?: boolean;
    ExitCode?: number;
    StartedAt?: string;
    FinishedAt?: string;
    Error?: string;
    [key: string]: unknown;
  };
  NetworkSettings?: {
    Networks?: Record<string, { IPAddress?: string; [key: string]: unknown }>;
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ContainerHandle {
  id: string;
  inspect(): Promise<ContainerInspectData>;
  start(): Promise<void>;
  stop(options?: { t?: number }): Promise<void>;
  remove(options?: { force?: boolean; v?: boolean }): Promise<void>;
  pause?(): Promise<void>;
  unpause?(): Promise<void>;
  update?(options?: Record<string, unknown>): Promise<void>;
  exec(options: Record<string, unknown>): Promise<any>;
  logs?(options: { stdout?: boolean; stderr?: boolean; tail?: number }): Promise<Buffer | string>;
  [key: string]: unknown;
}

export const CONTAINER_DRIVER = 'CONTAINER_DRIVER';

export interface DriverMetadata {
  driverType: 'dockerode' | 'kubernetes' | 'mock' | string;
  isRemote: boolean;
  socketOrEndpoint?: string;
}

export interface IContainerDriver {
  getContainer(idOrName: string): ContainerHandle;
  createContainer(options: Record<string, unknown>): Promise<ContainerHandle>;
  listContainers(options?: { all?: boolean; filters?: Record<string, string[] | string> }): Promise<any[]>;
  ping?(): Promise<boolean>;
  getMetadata?(): DriverMetadata;
}
