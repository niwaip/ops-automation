import { Module } from '@nestjs/common';
import { WorkerModule } from './modules/worker/worker.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [WorkerModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}