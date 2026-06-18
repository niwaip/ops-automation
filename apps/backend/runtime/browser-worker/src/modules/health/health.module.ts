import { Module } from '@nestjs/common';
import { WorkerModule } from '../worker/worker.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [WorkerModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
