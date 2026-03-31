import { Module } from '@nestjs/common';
import { ModelModule } from './modules/model/model.module';
import { AgentModule } from './modules/agent/agent.module';
import { RecognizerModule } from './modules/recognizer/recognizer.module';
import { DeciderModule } from './modules/decider/decider.module';
import { AIController } from './ai.controller';

@Module({
  imports: [ModelModule, AgentModule, RecognizerModule, DeciderModule],
  controllers: [AIController],
})
export class AppModule {}