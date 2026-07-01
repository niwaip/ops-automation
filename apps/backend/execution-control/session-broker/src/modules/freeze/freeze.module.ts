import { Module } from '@nestjs/common';
import { FreezeService } from './freeze.service';
import { LockModule } from '../lock/lock.module';

@Module({
  imports: [LockModule],
  providers: [FreezeService],
  exports: [FreezeService],
})
export class FreezeModule {}
