import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { TemporalWorkflowController } from './temporal-workflow.controller';
import { TemporalWorkflowService } from './temporal-workflow.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [TemporalWorkflowController, ActivityController],
  providers: [TemporalWorkflowService, ActivityService],
  exports: [TemporalWorkflowService, ActivityService],
})
export class TemporalWorkflowModule {}