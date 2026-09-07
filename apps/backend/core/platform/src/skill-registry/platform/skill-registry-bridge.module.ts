import { Global, Module } from '@nestjs/common';
import {
  SKILL_REGISTRY_PRISMA,
  BUILTIN_SKILL_REGISTRY,
  BUILTIN_SKILL_RUNTIME_CONFIG,
} from '@ops/skill-registry/registry';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { BuiltinSkillModule } from '../../modules/builtin-skill/builtin-skill.module';
import { BuiltinSkillRegistryService } from '../../modules/builtin-skill/registry/builtin-skill-registry.service';
import { BuiltinSkillRuntimeConfigService } from '../../modules/builtin-skill/runtime-config/builtin-skill-runtime-config.service';

@Global()
@Module({
  imports: [PrismaModule, BuiltinSkillModule],
  providers: [
    {
      provide: SKILL_REGISTRY_PRISMA,
      useExisting: PrismaService,
    },
    {
      provide: BUILTIN_SKILL_REGISTRY,
      useExisting: BuiltinSkillRegistryService,
    },
    {
      provide: BUILTIN_SKILL_RUNTIME_CONFIG,
      useExisting: BuiltinSkillRuntimeConfigService,
    },
  ],
  exports: [SKILL_REGISTRY_PRISMA, BUILTIN_SKILL_REGISTRY, BUILTIN_SKILL_RUNTIME_CONFIG],
})
export class SkillRegistryBridgeModule {}
