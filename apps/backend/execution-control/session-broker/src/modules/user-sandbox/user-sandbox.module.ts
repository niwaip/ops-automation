import { Module } from '@nestjs/common';
import { LockModule } from '../lock/lock.module';
import { UserSandboxService } from './user-sandbox.service';
import { UserSandboxStorageService } from './user-sandbox-storage.service';
import { UserSandboxContainerService } from './user-sandbox-container.service';
import { UserSandboxHarnessService } from './user-sandbox-harness.service';
import { UserSandboxController } from './user-sandbox.controller';
import { DockerodeContainerDriver } from './dockerode-container.driver';
import { CONTAINER_DRIVER } from './container-driver.interface';

@Module({
  imports: [LockModule],
  controllers: [UserSandboxController],
  providers: [
    UserSandboxStorageService,
    {
      provide: CONTAINER_DRIVER,
      useFactory: () => {
        const socketPath =
          process.env.DOCKER_SOCKET_PATH ||
          process.env.DOCKER_SOCK ||
          '/var/run/docker.sock';
        return new DockerodeContainerDriver({ socketPath });
      },
    },
    DockerodeContainerDriver,
    UserSandboxContainerService,
    UserSandboxHarnessService,
    UserSandboxService,
  ],
  exports: [
    UserSandboxStorageService,
    CONTAINER_DRIVER,
    DockerodeContainerDriver,
    UserSandboxContainerService,
    UserSandboxHarnessService,
    UserSandboxService,
  ],
})
export class UserSandboxModule {}
