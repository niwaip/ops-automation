import { Module } from '@nestjs/common';
import { RuntimeSessionController } from './runtime-session.controller';
import { RuntimeSessionService } from './runtime-session.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LockModule } from '../lock/lock.module';
import { AllocationModule } from '../allocation/allocation.module';

@Module({
  imports: [PrismaModule, LockModule, AllocationModule],
  controllers: [RuntimeSessionController],
  providers: [RuntimeSessionService],
  exports: [RuntimeSessionService],
})
export class RuntimeSessionModule {}