import { Module } from '@nestjs/common';
import { ModelModule } from './modules/model/model.module';
import { AgentModule } from './modules/agent/agent.module';
import { RecognizerModule } from './modules/recognizer/recognizer.module';
import { DeciderModule } from './modules/decider/decider.module';
import { BrowserModule } from './modules/browser/browser.module';
import { ReActEngineModule } from './modules/react-engine/react-engine.module';
import { RedisModule } from './modules/redis/redis.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ControlPlaneClientModule } from './client/control-plane-client.module';
import { PlannerModule } from './modules/planner/planner.module';
import { BrowserPhaseRecoveryModule } from './modules/browser/recovery/browser-phase-recovery.module';
import { DebugSettingsModule } from './modules/debug-settings/debug-settings.module';
import { ChatModule } from './modules/chat/chat.module';
import { OrchestrationModule } from './modules/orchestration/orchestration.module';

@Module({
  imports: [
    PrismaModule,
    ControlPlaneClientModule,
    ModelModule,
    AgentModule,
    RecognizerModule,
    DeciderModule,
    BrowserModule,
    ReActEngineModule,
    RedisModule,
    PlannerModule,
    BrowserPhaseRecoveryModule,
    DebugSettingsModule,
    ChatModule,
    OrchestrationModule,
  ],
})
export class AppModule {}
