import { Module } from '@nestjs/common';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SessionModule } from './modules/session';
import { LockModule } from './modules/lock';
import { AllocationModule } from './modules/allocation';
import { FreezeModule } from './modules/freeze';
import { TemplateModule } from './modules/template/template.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { RuntimeSessionModule } from './modules/runtime-session/runtime-session.module';

@Module({
  imports: [
    PrismaModule,
    LockModule,
    AllocationModule,
    FreezeModule,
    TemplateModule,
    ExecutionModule,
    SessionModule,
    RuntimeSessionModule,
  ],
})
export class AppModule {}