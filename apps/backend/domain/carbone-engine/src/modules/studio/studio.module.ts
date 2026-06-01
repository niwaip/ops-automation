/**
 * Carbone Engine - Studio Module
 */

import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import { TemplateWorkflowService } from './template-workflow.service';

@Module({
  controllers: [StudioController],
  providers: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
  ],
})
export class StudioModule {}
