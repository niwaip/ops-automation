import { Module } from '@nestjs/common';
import { BuiltinSkillModule } from '@ops/skill-registry/builtin';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import {
  InternalUserEmailConnectionController,
  UserEmailConnectionController,
} from './user-email-connection.controller';
import { UserEmailConnectionService } from './user-email-connection.service';

@Module({
  imports: [BuiltinSkillModule],
  controllers: [UserEmailConnectionController, InternalUserEmailConnectionController],
  providers: [UserEmailConnectionService, MicrosoftOAuthService],
  exports: [UserEmailConnectionService, MicrosoftOAuthService],
})
export class UserConnectionModule {}
