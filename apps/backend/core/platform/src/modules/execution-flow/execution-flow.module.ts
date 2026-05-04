/**
 * Execution Flow Template Module
 * 执行流程模板模块
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExecutionFlowTemplateController } from './execution-flow.controller';
import { ExecutionFlowTemplateService } from './execution-flow-template.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [ExecutionFlowTemplateController],
  providers: [ExecutionFlowTemplateService],
  exports: [ExecutionFlowTemplateService],
})
export class ExecutionFlowModule {}