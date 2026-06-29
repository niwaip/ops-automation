import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { LockModule } from '../lock/lock.module';
import { AllocationModule } from '../allocation/allocation.module';
import { FreezeModule } from '../freeze/freeze.module';
import { TemplateModule } from '../template/template.module';
import { ExecutionModule as WorkerRoutingModule } from '../execution/execution.module';

@Module({
  imports: [LockModule, AllocationModule, FreezeModule, TemplateModule, WorkerRoutingModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
