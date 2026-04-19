import { Module } from '@nestjs/common';
import { ExecutionStepService } from './execution-step.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ExecutionStepService],
  exports: [ExecutionStepService],
})
export class ExecutionStepModule {}