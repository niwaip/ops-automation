/**
 * ReAct Engine Module
 */

import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ControlPlaneClientModule } from '../../client/control-plane-client.module';
import { ModelModule } from '../model/model.module';
import { DebugSettingsModule } from '../debug-settings/debug-settings.module';
import { ReActEngineService } from './react-engine.service';
import { ToolExecutor } from './tool-executor';
import { CapabilityResolver } from './capability-resolver';
import { ModelRouterService } from './model-router.service';
import { ALL_TOOLS } from './tools';

@Module({
  imports: [ModelModule, DiscoveryModule, DebugSettingsModule, ControlPlaneClientModule],
  providers: [
    ReActEngineService,
    ToolExecutor,
    CapabilityResolver,
    ModelRouterService,
    ...ALL_TOOLS,
  ],
  exports: [ReActEngineService, ToolExecutor, CapabilityResolver, ModelRouterService],
})
export class ReActEngineModule {}
