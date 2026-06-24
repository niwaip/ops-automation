/**
 * Execution Flow Template Module
 * 执行流程模板模块
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ExecutionFlowTemplateController } from './execution-flow.controller';
import { ExecutionFlowTemplateService } from './execution-flow-template.service';
import { ExecutionFlowValidationHttpService } from './execution-flow-validation-http.service';
import { ExecutionFlowValidationService } from './execution-flow-validation.service';
import { ExecutionFlowValidationFacadeService } from './execution-flow-validation-facade.service';
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
  providers: [
    ExecutionFlowTemplateService,
    ExecutionFlowValidationHttpService,
    ExecutionFlowValidationService,
    ExecutionFlowValidationFacadeService,
  ],
  exports: [
    ExecutionFlowTemplateService,
    ExecutionFlowValidationHttpService,
    ExecutionFlowValidationService,
    ExecutionFlowValidationFacadeService,
  ],
})
export class ExecutionFlowModule {}
