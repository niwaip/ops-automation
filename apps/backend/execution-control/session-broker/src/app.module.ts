import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SessionModule } from './modules/session/session.module';
import { LockModule } from './modules/lock/lock.module';
import { AllocationModule } from './modules/allocation/allocation.module';
import { FreezeModule } from './modules/freeze/freeze.module';
import { TemplateModule } from './modules/template/template.module';
import { RuntimeSessionModule } from './modules/runtime-session/runtime-session.module';
import { ExecutionModule as WorkerRoutingModule } from './modules/execution/execution.module';

@Module({
  imports: [
    PrismaModule,
    LockModule,
    AllocationModule,
    FreezeModule,
    TemplateModule,
    WorkerRoutingModule,
    SessionModule,
    RuntimeSessionModule,
  ],
})
export class AppModule {}
