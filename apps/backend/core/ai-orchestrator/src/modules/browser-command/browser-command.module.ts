import { Module } from '@nestjs/common';
import { BrowserCommandService } from './browser-command.service';
import { BrowserCommandController } from './browser-command.controller';
import { RecorderDebugService } from './recorder-debug.service';
import { RecorderDebugController } from './recorder-debug.controller';
import { ModelModule } from '../model/model.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [ModelModule, RedisModule],
  controllers: [BrowserCommandController, RecorderDebugController],
  providers: [BrowserCommandService, RecorderDebugService],
  exports: [BrowserCommandService, RecorderDebugService],
})
export class BrowserCommandModule {}
