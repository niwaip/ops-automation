import { Module } from '@nestjs/common';
import { WorkerModule } from './modules/worker/worker.module';
import { HealthModule } from './modules/health/health.module';
import { RecorderModule } from './modules/recorder/recorder.module';

@Module({
  imports: [WorkerModule, HealthModule, RecorderModule],
  controllers: [],
  providers: [],
})
export class AppModule {}