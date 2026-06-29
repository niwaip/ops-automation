import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { PreviewService } from '../render/preview/preview.service';
import { RenderOutputRepository } from './repository/render-output.repository';
import { SkillRepository } from './repository/skill.repository';
import { TemplateRepository } from './repository/template.repository';
import { StudioAiController } from './studio/studio-ai.controller';
import { StudioController } from './studio/studio.controller';
import { StudioTemplateController } from './studio/studio-template.controller';
import { AIIdentifierService } from './workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from './workflow-authoring/document-structure.service';
import { TemplateWorkflowService } from './workflow-authoring/template-workflow.service';

@Module({
  imports: [PrismaModule],
  controllers: [StudioController, StudioTemplateController, StudioAiController],
  providers: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
  ],
  exports: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
  ],
})
export class DocumentTemplateModule {}
