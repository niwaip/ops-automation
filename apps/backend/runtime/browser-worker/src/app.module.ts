import { Module } from '@nestjs/common';
import { WorkerModule } from './modules/worker/worker.module';
import { HealthModule } from './modules/health/health.module';
import { RecorderModule } from './modules/recorder/recorder.module';
import { BrowserModule } from './modules/browser/browser.module';

@Module({
  imports: [WorkerModule, HealthModule, RecorderModule, BrowserModule],
  controllers: [],
  providers: [],
})
export class AppModule {}