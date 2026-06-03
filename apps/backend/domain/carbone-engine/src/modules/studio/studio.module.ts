/**
 * Carbone Engine - Studio Module
 */

import { Module } from '@nestjs/common';
import { StudioController } from './studio.controller';
import { StudioAiController } from './studio-ai.controller';
import { StudioRenderController } from './studio-render.controller';
import { StudioSkillRenderController } from './studio-skill-render.controller';
import { StudioTemplateController } from './studio-template.controller';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import { TemplateWorkflowService } from './template-workflow.service';
import { StudioSkillRenderDataService } from './studio-skill-render-data.service';

@Module({
  controllers: [
    StudioController,
    StudioRenderController,
    StudioSkillRenderController,
    StudioTemplateController,
    StudioAiController,
  ],
  providers: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
    StudioSkillRenderDataService,
  ],
})
export class StudioModule {}
