import { Module } from '@nestjs/common';
import { SessionModule } from './modules/session';
import { LockModule } from './modules/lock';
import { AllocationModule } from './modules/allocation';
import { FreezeModule } from './modules/freeze';
import { TemplateModule } from './modules/template/template.module';
import { ExecutionModule } from './modules/execution/execution.module';

@Module({
  imports: [
    LockModule,
    AllocationModule,
    FreezeModule,
    TemplateModule,
    ExecutionModule,
    SessionModule,
  ],
})
export class AppModule {}