import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProxyModule } from './modules/proxy/proxy.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthMiddleware } from './modules/auth/auth.middleware';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
    ProxyModule,
    AuditModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude('auth/login', 'auth/register', 'auth/refresh', 'health', 'api/docs')
      .forRoutes('*');
  }
}