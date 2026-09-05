import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BuiltinSkillAuditService } from './audit/builtin-skill-audit.service';
import { BuiltinSkillRegistryService } from './registry/builtin-skill-registry.service';
import { BuiltinSkillPermissionService } from './permissions/builtin-skill-permission.service';
import { BuiltinSkillProvisioningService } from './provisioning/builtin-skill-provisioning.service';
import { BuiltinSkillCatalogProjectionService } from './catalog-projection/builtin-skill-catalog-projection.service';
import { BuiltinSkillRuntimeConfigCipher } from './runtime-config/builtin-skill-runtime-config.crypto';
import { BuiltinSkillRuntimeConfigService } from './runtime-config/builtin-skill-runtime-config.service';

import { BuiltinSkillController } from './builtin-skill.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BuiltinSkillController],
  providers: [
    BuiltinSkillAuditService,
    BuiltinSkillRegistryService,
    BuiltinSkillPermissionService,
    BuiltinSkillProvisioningService,
    BuiltinSkillCatalogProjectionService,
    BuiltinSkillRuntimeConfigCipher,
    BuiltinSkillRuntimeConfigService,
  ],
  exports: [
    BuiltinSkillAuditService,
    BuiltinSkillRegistryService,
    BuiltinSkillPermissionService,
    BuiltinSkillProvisioningService,
    BuiltinSkillCatalogProjectionService,
    BuiltinSkillRuntimeConfigService,
    BuiltinSkillRuntimeConfigCipher,
  ],
})
export class BuiltinSkillModule {}
