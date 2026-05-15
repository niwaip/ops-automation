import { Module } from '@nestjs/common';
import { ReplayController } from './replay.controller';
import { PrismaModule } from './prisma/prisma.module';
import { CdpModule } from './modules/cdp/cdp.module';
import { ExecutorModule } from './modules/executor/executor.module';
import { RetryModule } from './modules/retry/retry.module';
import { LogModule } from './modules/log/log.module';
import { AiModule } from './modules/ai-interaction/ai.module';
import { TakeoverModule } from './modules/takeover/takeover.module';

@Module({
  imports: [
    PrismaModule,
    CdpModule,
    ExecutorModule,
    RetryModule,
    LogModule,
    AiModule,
    TakeoverModule,
  ],
  controllers: [ReplayController],
})
export class AppModule {}
