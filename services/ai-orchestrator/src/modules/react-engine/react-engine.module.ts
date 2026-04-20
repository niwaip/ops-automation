/**
 * ReAct Engine Module
 */

import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { ExecutionStepModule } from '../execution-step/execution-step.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReActEngineService } from './react-engine.service';
import { ToolExecutor } from './tool-executor';

@Module({
  imports: [ModelModule, ExecutionStepModule, PrismaModule],
  providers: [ReActEngineService, ToolExecutor],
  exports: [ReActEngineService, ToolExecutor],
})
export class ReActEngineModule {}