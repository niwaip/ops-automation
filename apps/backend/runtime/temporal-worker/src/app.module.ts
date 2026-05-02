import { Module } from '@nestjs/common';
import { WorkerModule } from './worker/worker.module';
import { SandboxModule } from './sandbox/sandbox.module';

@Module({
  imports: [WorkerModule, SandboxModule],
})
export class AppModule {}