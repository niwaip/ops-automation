import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExecutionFlowModule } from '../execution-flow/execution-flow.module';
import { TemporalWorkflowModule } from '../temporal-workflow/temporal-workflow.module';
import { SkillModule } from '../skill/skill.module';
import { CapabilityReleaseController } from './capability-release.controller';
import { CapabilityReleaseService } from './capability-release.service';

@Module({
  imports: [
    PrismaModule,
    ExecutionFlowModule,
    TemporalWorkflowModule,
    SkillModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [CapabilityReleaseController],
  providers: [CapabilityReleaseService],
  exports: [CapabilityReleaseService],
})
export class CapabilityReleaseModule {}
