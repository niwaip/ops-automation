import { Module } from '@nestjs/common';
import { WorkerController } from './worker.controller';
import { WorkerService } from './worker.service';
import { DockerodeContainerDriver } from './dockerode-container.driver';
import { CONTAINER_DRIVER } from './container-driver.interface';

const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';

@Module({
  controllers: [WorkerController],
  providers: [
    {
      provide: CONTAINER_DRIVER,
      useFactory: () => {
        const socketPath =
          process.env.DOCKER_SOCKET_PATH ||
          process.env.DOCKER_SOCK ||
          DEFAULT_DOCKER_SOCKET_PATH;
        return new DockerodeContainerDriver({ socketPath });
      },
    },
    DockerodeContainerDriver,
    WorkerService,
  ],
  exports: [CONTAINER_DRIVER, DockerodeContainerDriver, WorkerService],
})
export class WorkerModule {}
