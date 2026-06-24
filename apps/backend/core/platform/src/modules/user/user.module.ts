import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { IdentityAccessBridgeModule } from '../../governance/identity-access/identity-access-bridge.module';

@Module({
  imports: [IdentityAccessBridgeModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
