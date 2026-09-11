import { Global, Module } from '@nestjs/common';
import { WORKBENCH_PRISMA } from '@ops/workbench';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: WORKBENCH_PRISMA,
      useExisting: PrismaService,
    },
  ],
  exports: [WORKBENCH_PRISMA],
})
export class WorkbenchBridgeModule {}
