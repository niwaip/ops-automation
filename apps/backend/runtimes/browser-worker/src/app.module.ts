import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { WorkerModule } from './modules/worker/worker.module';
import { HealthModule } from './modules/health/health.module';
import { RecorderModule } from './modules/recorder/recorder.module';
import { BrowserModule } from './modules/browser/browser.module';
import { InternalAuthGuard } from './common/guards/internal-auth.guard';

@Module({
  imports: [WorkerModule, HealthModule, RecorderModule, BrowserModule],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: InternalAuthGuard,
    },
  ],
})
export class AppModule {}
