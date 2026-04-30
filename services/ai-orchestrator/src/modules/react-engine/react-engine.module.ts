/**
 * ReAct Engine Module
 */

import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { ReActEngineService } from './react-engine.service';
import { ToolExecutor } from './tool-executor';
import { CapabilityResolver } from './capability-resolver';
import { ModelRouterService } from './model-router.service';

@Module({
  imports: [ModelModule],
  providers: [ReActEngineService, ToolExecutor, CapabilityResolver, ModelRouterService],
  exports: [ReActEngineService, ToolExecutor, CapabilityResolver, ModelRouterService],
})
export class ReActEngineModule {}
