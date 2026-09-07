import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { BuiltinSkillModule } from '@ops/skill-registry/builtin';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import {
  InternalUserEmailConnectionController,
  UserEmailConnectionController,
} from './user-email-connection.controller';
import { UserEmailConnectionService } from './user-email-connection.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
    BuiltinSkillModule,
  ],
  controllers: [UserEmailConnectionController, InternalUserEmailConnectionController],
  providers: [UserEmailConnectionService, MicrosoftOAuthService],
  exports: [UserEmailConnectionService, MicrosoftOAuthService],
})
export class UserConnectionModule {}
