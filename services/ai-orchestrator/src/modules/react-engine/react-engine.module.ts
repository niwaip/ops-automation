/**
 * ReAct Engine Module
 */

import { Module } from '@nestjs/common';
import { ModelModule } from '../model/model.module';
import { ReActEngineService } from './react-engine.service';
import { ToolExecutor } from './tool-executor';

@Module({
  imports: [ModelModule],
  providers: [ReActEngineService, ToolExecutor],
  exports: [ReActEngineService, ToolExecutor],
})
export class ReActEngineModule {}
