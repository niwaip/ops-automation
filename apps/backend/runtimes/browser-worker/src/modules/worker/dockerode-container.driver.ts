import { Injectable } from '@nestjs/common';
import Docker from 'dockerode';
import {
  ContainerHandle,
  ContainerInspectData,
  IContainerDriver,
  DriverMetadata,
} from './container-driver.interface';

@Injectable()
export class DockerodeContainerDriver implements IContainerDriver {
  private readonly docker: Docker;
  private readonly socketPath: string;

  constructor(options?: { socketPath?: string } | Docker) {
    if (options && typeof (options as any).getContainer === 'function') {
      this.docker = options as Docker;
      this.socketPath = (options as any)?.modem?.socketPath || '/var/run/docker.sock';
    } else {
      this.socketPath =
        (options as any)?.socketPath ||
        process.env.DOCKER_SOCKET_PATH ||
        process.env.DOCKER_SOCK ||
        '/var/run/docker.sock';
      this.docker = new Docker({ socketPath: this.socketPath });
    }
  }

  getMetadata(): DriverMetadata {
    return {
      driverType: 'dockerode',
      isRemote: false,
      socketOrEndpoint: this.socketPath,
    };
  }

  getRawDocker(): Docker {
    return this.docker;
  }

  getContainer(idOrName: string): ContainerHandle {
    const container = this.docker.getContainer(idOrName);
    return {
      id: container.id,
      inspect: () => (container.inspect() as unknown) as Promise<ContainerInspectData>,
      start: () => container.start(),
      stop: (opts) => container.stop(opts),
      remove: (opts) => container.remove(opts),
      logs: (opts) => container.logs(opts),
    };
  }

  async createContainer(options: Record<string, unknown>): Promise<ContainerHandle> {
    const container = await this.docker.createContainer(options as Docker.ContainerCreateOptions);
    return {
      id: container.id,
      inspect: () => (container.inspect() as unknown) as Promise<ContainerInspectData>,
      start: () => container.start(),
      stop: (opts) => container.stop(opts),
      remove: (opts) => container.remove(opts),
      logs: (opts) => container.logs(opts),
    };
  }

  async listContainers(options?: {
    all?: boolean;
    filters?: Record<string, string[] | string>;
  }): Promise<any[]> {
    return (this.docker.listContainers(options as Docker.ContainerListOptions) as unknown) as Promise<any[]>;
  }

  async ping(): Promise<boolean> {
    try {
      await (this.docker as any).ping();
      return true;
    } catch {
      return false;
    }
  }
}
