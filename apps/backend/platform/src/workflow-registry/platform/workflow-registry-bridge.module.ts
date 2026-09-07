import { Global, Module } from '@nestjs/common';
import { WORKFLOW_REGISTRY_PRISMA } from '@ops/workflow-registry/flow-template';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: WORKFLOW_REGISTRY_PRISMA,
      useExisting: PrismaService,
    },
  ],
  exports: [WORKFLOW_REGISTRY_PRISMA],
})
export class WorkflowRegistryBridgeModule {}
