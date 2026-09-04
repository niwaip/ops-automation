import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BuiltinSkillModule } from '../builtin-skill/builtin-skill.module';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import {
  InternalUserEmailConnectionController,
  UserEmailConnectionController,
} from './user-email-connection.controller';
import { UserEmailConnectionService } from './user-email-connection.service';

@Module({
  imports: [PrismaModule, BuiltinSkillModule],
  controllers: [UserEmailConnectionController, InternalUserEmailConnectionController],
  providers: [UserEmailConnectionService, MicrosoftOAuthService],
  exports: [UserEmailConnectionService, MicrosoftOAuthService],
})
export class UserConnectionModule {}
