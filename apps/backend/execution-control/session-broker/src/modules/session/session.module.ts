import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { LockModule } from '../lock';
import { AllocationModule } from '../allocation';
import { FreezeModule } from '../freeze';
import { TemplateModule } from '../template/template.module';
import { WorkerRoutingModule } from '../worker-routing';

@Module({
  imports: [LockModule, AllocationModule, FreezeModule, TemplateModule, WorkerRoutingModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
