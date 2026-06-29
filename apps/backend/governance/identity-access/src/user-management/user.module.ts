import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { IdentityAccessUserService } from './identity-access-user.service';

@Module({
  controllers: [UserController],
  providers: [IdentityAccessUserService],
  exports: [IdentityAccessUserService],
})
export class UserModule {}
