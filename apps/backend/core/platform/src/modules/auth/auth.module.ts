import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '@ops/identity-access';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IdentityAccessBridgeModule } from '../../governance/identity-access/identity-access-bridge.module';

@Module({
  imports: [
    IdentityAccessBridgeModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
