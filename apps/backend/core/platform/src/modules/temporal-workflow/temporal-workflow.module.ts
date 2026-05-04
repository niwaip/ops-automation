import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TemporalWorkflowController } from './temporal-workflow.controller';
import { TemporalWorkflowService } from './temporal-workflow.service';
import { TemporalWorkflowAiDraftService } from './temporal-workflow-draft.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './temporal-activity.service';
import { BuiltinActivityRegistry } from './builtin-activity.registry';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [TemporalWorkflowController, ActivityController],
  providers: [TemporalWorkflowService, TemporalWorkflowAiDraftService, ActivityService, BuiltinActivityRegistry],
  exports: [TemporalWorkflowService, TemporalWorkflowAiDraftService, ActivityService, BuiltinActivityRegistry],
})
export class TemporalWorkflowModule {}
