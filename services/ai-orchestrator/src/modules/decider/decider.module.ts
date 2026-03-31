import { Module } from '@nestjs/common';
import { DeciderService } from './decider.service';

@Module({
  providers: [DeciderService],
  exports: [DeciderService],
})
export class DeciderModule {}