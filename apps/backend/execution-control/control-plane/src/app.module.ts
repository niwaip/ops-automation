import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ProxyModule } from './modules/proxy/proxy.module';
import { AuditModule } from './modules/audit/audit.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthMiddleware } from './modules/auth/auth.middleware';
import { McpModule } from './modules/mcp/mcp.module';
import { JwtSecretGuard } from './modules/auth/jwt-secret.guard';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SavedSkillModule } from './modules/saved-skill/saved-skill.module';
import { AssistantFeedbackModule } from './modules/feedback/assistant-feedback.module';
import { ExperienceLearningModule } from './modules/experience-learning/experience-learning.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
    ProxyModule,
    AuditModule,
    ExecutionModule,
    NotificationModule,
    McpModule,
    SchedulerModule,
    SavedSkillModule,
    AssistantFeedbackModule,
    ExperienceLearningModule,
  ],
  providers: [JwtSecretGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .exclude(
        'auth/login',
        'auth/register',
        'auth/refresh',
        'health',
        'api/docs',
        'mcp/sse',
        'mcp/message'
      )
      .forRoutes('*');
  }
}
