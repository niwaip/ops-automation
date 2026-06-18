import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { LockModule } from '../lock';
import { AllocationModule } from '../allocation';
import { FreezeModule } from '../freeze';
import { TemplateModule } from '../template/template.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [LockModule, AllocationModule, FreezeModule, TemplateModule, ExecutionModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
