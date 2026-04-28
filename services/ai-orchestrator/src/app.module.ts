import { Module } from '@nestjs/common';
import { ModelModule } from './modules/model/model.module';
import { AgentModule } from './modules/agent/agent.module';
import { RecognizerModule } from './modules/recognizer/recognizer.module';
import { DeciderModule } from './modules/decider/decider.module';
import { BrowserCommandModule } from './modules/browser-command/browser-command.module';
import { ReActEngineModule } from './modules/react-engine/react-engine.module';
import { RedisModule } from './modules/redis/redis.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ExecutionStepModule } from './modules/execution-step/execution-step.module';
import { PlannerModule } from './modules/planner/planner.module';
import { ModelController } from './controllers/model.controller';
import { ChatController } from './controllers/chat.controller';
import { OrchestrationController } from './controllers/orchestration.controller';

@Module({
  imports: [
    PrismaModule,
    ExecutionStepModule,
    ModelModule,
    AgentModule,
    RecognizerModule,
    DeciderModule,
    BrowserCommandModule,
    ReActEngineModule,
    RedisModule,
    PlannerModule,
  ],
  controllers: [ModelController, ChatController, OrchestrationController],
})
export class AppModule {}
