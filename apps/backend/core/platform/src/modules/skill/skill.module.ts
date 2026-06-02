/**
 * Skill Module
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';
import { ExecutionFlowModule } from '../execution-flow/execution-flow.module';
import { ToolCatalogService } from './tool-catalog.service';
import { ToolCatalogController } from './tool-catalog.controller';
import { SkillToolBindingService } from './skill-tool-binding.service';
import { SkillEnrichmentService } from './skill-enrichment.service';
import { SkillValidationService } from './skill-validation.service';
import { SkillAccessService } from './skill-access.service';
import { SkillMatcherService } from './skill-matcher.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
    ExecutionFlowModule,
  ],
  controllers: [SkillController, ToolCatalogController],
  providers: [
    SkillService,
    ToolCatalogService,
    SkillToolBindingService,
    SkillEnrichmentService,
    SkillAccessService,
    SkillMatcherService,
    SkillValidationService,
  ],
  exports: [
    SkillService,
    ToolCatalogService,
    SkillToolBindingService,
    SkillEnrichmentService,
    SkillAccessService,
    SkillMatcherService,
    SkillValidationService,
  ],
})
export class SkillModule {}
