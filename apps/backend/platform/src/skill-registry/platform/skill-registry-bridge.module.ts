import { Global, Module } from '@nestjs/common';
import {
  SKILL_REGISTRY_PRISMA,
  BUILTIN_SKILL_REGISTRY,
  BUILTIN_SKILL_RUNTIME_CONFIG,
} from '@ops/skill-registry/registry';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BuiltinSkillModule,
  BuiltinSkillRegistryService,
  BuiltinSkillRuntimeConfigService,
} from '@ops/skill-registry/builtin';

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
