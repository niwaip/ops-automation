import { Global, Module } from '@nestjs/common';
import { ORGANIZATION_REPOSITORY } from '@ops/organization';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformOrganizationRepository } from './organization-repository.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    PlatformOrganizationRepository,
    {
      provide: ORGANIZATION_REPOSITORY,
      useExisting: PlatformOrganizationRepository,
    },
  ],
  exports: [ORGANIZATION_REPOSITORY],
})
export class OrganizationBridgeModule {}
