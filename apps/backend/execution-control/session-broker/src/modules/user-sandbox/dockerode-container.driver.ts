import { Injectable } from '@nestjs/common';
import Docker from 'dockerode';
import {
  ContainerHandle,
  ContainerInspectData,
  IContainerDriver,
} from './container-driver.interface';

@Injectable()
export class DockerodeContainerDriver implements IContainerDriver {
  private readonly docker: Docker;

  constructor(options?: { socketPath?: string } | Docker) {
    if (options && typeof (options as any).getContainer === 'function') {
      this.docker = options as Docker;
    } else {
      const socketPath =
        (options as any)?.socketPath ||
        process.env.DOCKER_SOCKET_PATH ||
        process.env.DOCKER_SOCK ||
        '/var/run/docker.sock';
      this.docker = new Docker({ socketPath });
    }
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
      pause: () => (container as any).pause(),
      unpause: () => (container as any).unpause(),
      update: (opts) => (container as any).update(opts),
      exec: (opts) => (container as any).exec(opts),
      logs: (opts) => container.logs(opts),
      rawContainer: container,
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
      pause: () => (container as any).pause(),
      unpause: () => (container as any).unpause(),
      update: (opts) => (container as any).update(opts),
      exec: (opts) => (container as any).exec(opts),
      logs: (opts) => container.logs(opts),
      rawContainer: container,
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
