import { Module } from '@nestjs/common';
import { LockModule } from '../lock/lock.module';
import { UserSandboxService } from './user-sandbox.service';
import { UserSandboxStorageService } from './user-sandbox-storage.service';
import { UserSandboxContainerService } from './user-sandbox-container.service';
import { UserSandboxHarnessService } from './user-sandbox-harness.service';
import { UserSandboxController } from './user-sandbox.controller';
import { DockerodeContainerDriver } from './dockerode-container.driver';

@Module({
  imports: [LockModule],
  controllers: [UserSandboxController],
  providers: [
    UserSandboxStorageService,
    UserSandboxContainerService,
    UserSandboxHarnessService,
    UserSandboxService,
    DockerodeContainerDriver,
  ],
  exports: [
    UserSandboxStorageService,
    UserSandboxContainerService,
    UserSandboxHarnessService,
    UserSandboxService,
    DockerodeContainerDriver,
  ],
})
export class UserSandboxModule {}
