import { Module } from '@nestjs/common';
import { TakeoverService } from './takeover.service';

@Module({
  providers: [TakeoverService],
  exports: [TakeoverService],
})
export class TakeoverModule {}