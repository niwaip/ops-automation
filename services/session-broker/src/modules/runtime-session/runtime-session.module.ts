import { Module } from '@nestjs/common';
import { RuntimeSessionController } from './runtime-session.controller';
import { RuntimeSessionService } from './runtime-session.service';
import { PrismaModule } from '../prisma/prisma.module';
import { LockModule } from '../lock/lock.module';
import { AllocationModule } from '../allocation/allocation.module';
import { FreezeModule } from '../freeze/freeze.module';

@Module({
  imports: [PrismaModule, LockModule, AllocationModule, FreezeModule],
  controllers: [RuntimeSessionController],
  providers: [RuntimeSessionService],
  exports: [RuntimeSessionService],
})
export class RuntimeSessionModule {}
