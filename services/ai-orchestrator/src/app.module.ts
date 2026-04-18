import { Module } from '@nestjs/common';
import { ModelModule } from './modules/model/model.module';
import { AgentModule } from './modules/agent/agent.module';
import { RecognizerModule } from './modules/recognizer/recognizer.module';
import { DeciderModule } from './modules/decider/decider.module';
import { BrowserCommandModule } from './modules/browser-command/browser-command.module';
import { ReActEngineModule } from './modules/react-engine/react-engine.module';
import { RedisModule } from './modules/redis/redis.module';
import { AIController } from './ai.controller';

@Module({
  imports: [
    ModelModule,
    AgentModule,
    RecognizerModule,
    DeciderModule,
    BrowserCommandModule,
    ReActEngineModule,
    RedisModule,
  ],
  controllers: [AIController],
})
export class AppModule {}