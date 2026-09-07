import { Module } from '@nestjs/common';
import { UserSandboxService } from './user-sandbox.service';
import { UserSandboxStorageService } from './user-sandbox-storage.service';
import { UserSandboxContainerService } from './user-sandbox-container.service';
import { UserSandboxHarnessService } from './user-sandbox-harness.service';
import { UserSandboxController } from './user-sandbox.controller';

@Module({
  controllers: [UserSandboxController],
  providers: [
    UserSandboxStorageService,
    UserSandboxContainerService,
    UserSandboxHarnessService,
    UserSandboxService,
  ],
  exports: [
    UserSandboxStorageService,
    UserSandboxContainerService,
    UserSandboxHarnessService,
    UserSandboxService,
  ],
})
export class UserSandboxModule {}
