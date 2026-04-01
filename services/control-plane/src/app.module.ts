import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ProxyModule } from './modules/proxy/proxy.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthMiddleware } from './modules/auth/auth.middleware';

@Module({
  imports: [ProxyModule, AuditModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude('auth/login', 'auth/register', 'auth/refresh', 'health', 'api/docs')
      .forRoutes('*');
  }
}