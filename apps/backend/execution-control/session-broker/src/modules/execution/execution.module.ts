import { Module } from '@nestjs/common';
import { CdpExecutor } from './cdp.executor';
import { CdpWorkerClientService } from './cdp-worker-client.service';
import { CdpStepRunnerService } from './cdp-step-runner.service';
import { CdpLoopRunnerService } from './cdp-loop-runner.service';

@Module({
  providers: [
    CdpWorkerClientService,
    CdpStepRunnerService,
    CdpLoopRunnerService,
    CdpExecutor,
  ],
  exports: [
    CdpWorkerClientService,
    CdpStepRunnerService,
    CdpLoopRunnerService,
    CdpExecutor,
  ],
})
export class ExecutionModule {}
