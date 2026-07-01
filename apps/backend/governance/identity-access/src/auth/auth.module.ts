import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '../strategies';
import { AuthController } from './auth.controller';
import { IdentityAccessAuthService } from './identity-access-auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [IdentityAccessAuthService, JwtStrategy],
  exports: [IdentityAccessAuthService, JwtStrategy],
})
export class AuthModule {}
