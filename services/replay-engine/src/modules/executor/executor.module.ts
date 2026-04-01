import { Module } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { CdpModule } from '../cdp/cdp.module';
import { LogModule } from '../log/log.module';
import { RetryModule } from '../retry/retry.module';
import { AiModule } from '../ai-interaction/ai.module';
import { TakeoverModule } from '../takeover/takeover.module';

@Module({
  imports: [CdpModule, LogModule, RetryModule, AiModule, TakeoverModule],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}