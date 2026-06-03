import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { BrowserPhaseRecoveryModule } from '../browser-phase-recovery/browser-phase-recovery.module';
import { DeciderModule } from '../decider/decider.module';
import { ModelModule } from '../model/model.module';
import { PlannerModule } from '../planner/planner.module';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { ReActEngineModule } from '../react-engine/react-engine.module';
import { OrchestrationController } from './orchestration.controller';

@Module({
  imports: [
    AgentModule,
    BrowserPhaseRecoveryModule,
    DeciderModule,
    ModelModule,
    PlannerModule,
    RecognizerModule,
    ReActEngineModule,
  ],
  controllers: [OrchestrationController],
})
export class OrchestrationModule {}
