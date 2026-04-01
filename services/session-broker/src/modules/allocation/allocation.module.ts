import { Module } from '@nestjs/common';
import { AllocationService } from './allocation.service';
import { LockModule } from '../lock';

@Module({
  imports: [LockModule],
  providers: [AllocationService],
  exports: [AllocationService],
})
export class AllocationModule {}