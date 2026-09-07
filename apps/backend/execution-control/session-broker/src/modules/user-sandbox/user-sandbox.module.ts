import { Module } from '@nestjs/common';
import { UserSandboxService } from './user-sandbox.service';
import { UserSandboxController } from './user-sandbox.controller';

@Module({
  controllers: [UserSandboxController],
  providers: [UserSandboxService],
  exports: [UserSandboxService],
})
export class UserSandboxModule {}
