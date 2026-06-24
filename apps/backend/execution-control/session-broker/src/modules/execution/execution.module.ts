import { Module } from '@nestjs/common';
import { CdpExecutor } from './cdp.executor';

@Module({
  providers: [CdpExecutor],
  exports: [CdpExecutor],
})
export class ExecutionModule {}
