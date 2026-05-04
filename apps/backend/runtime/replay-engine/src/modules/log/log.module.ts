import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { DatabaseModule } from '../database';

@Module({
  imports: [DatabaseModule],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}