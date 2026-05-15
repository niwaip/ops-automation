import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
