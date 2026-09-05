import { Module } from '@nestjs/common';
import { ControlPlaneClientModule } from '../../client/control-plane-client.module';
import { DebugSettingsModule } from '../debug-settings/debug-settings.module';
import { ModelModule } from '../model/model.module';
import { PlannerModule } from '../planner';
import { ReActEngineModule } from '../react-engine/react-engine.module';
import { RecognizerModule } from '../recognizer/recognizer.module';
import { RedisModule } from '../redis/redis.module';
import { ChatController } from './chat.controller';
import { ChatConversationService } from './chat-conversation.service';
import { ChatExecutionStreamService } from './chat-execution-stream.service';
import { ChatMediaService } from './chat-media.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { ChatResultNormalizerService } from './chat-result-normalizer.service';
import { ChatWaitingInputService } from './chat-waiting-input.service';
import { DeterministicTaskExecutionService } from './deterministic-task-execution.service';
import { ChatFeedbackService } from './chat-feedback.service';
import { PlanningDecisionShadowService } from './planning-decision-shadow.service';
import { TaskFallbackPolicyService } from './task-fallback-policy.service';
import { ChatTaskResumeService } from './chat-task-resume.service';
import { ChatPlanningPresentationService } from './chat-planning-presentation.service';
import { ScopedPlannerMemoryService } from './scoped-planner-memory.service';
import { UserSandboxDispatcherService } from './user-sandbox-dispatcher.service';

@Module({
  imports: [
    ControlPlaneClientModule,
    DebugSettingsModule,
    ModelModule,
    PlannerModule,
    ReActEngineModule,
    RecognizerModule,
    RedisModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatWaitingInputService,
    ChatResultNormalizerService,
    ChatExecutionStreamService,
    ChatOrchestratorService,
    ChatConversationService,
    ChatMediaService,
    DeterministicTaskExecutionService,
    ChatFeedbackService,
    PlanningDecisionShadowService,
    TaskFallbackPolicyService,
    ChatTaskResumeService,
    ChatPlanningPresentationService,
    ScopedPlannerMemoryService,
    UserSandboxDispatcherService,
  ],
})
export class ChatModule {}
