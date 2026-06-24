import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ActionLoopModule } from './modules/action-loop';
import { PerceptionModule } from './modules/perception';
import { RuntimeBridgeModule } from './modules/runtime-bridge';

@Module({
  imports: [PerceptionModule, ActionLoopModule, RuntimeBridgeModule],
  controllers: [HealthController],
})
export class AppModule {}
