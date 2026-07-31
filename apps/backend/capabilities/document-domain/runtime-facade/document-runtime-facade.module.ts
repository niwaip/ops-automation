import { Module } from '@nestjs/common';
import { PrismaModule } from '../template/prisma.module';
import { PreviewService } from '../render/preview/preview.service';
import { StudioSkillRenderDataService } from '../render/resolved-render/studio-skill-render-data.service';
import { RenderOutputRepository } from '../template/repository/render-output.repository';
import { SkillRepository } from '../template/repository/skill.repository';
import { TemplateRepository } from '../template/repository/template.repository';
import { AIIdentifierService } from '../template/workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from '../template/workflow-authoring/document-structure.service';
import { TemplateWorkflowService } from '../template/workflow-authoring/template-workflow.service';
import { DocumentRenderEntryController } from './render-entry/document-render-entry.controller';
import { DocumentSkillRenderEntryController } from './render-entry/document-skill-render-entry.controller';
import { MarkdownArtifactController } from './markdown-artifact/markdown-artifact.controller';
import { MarkdownArtifactService } from './markdown-artifact/markdown-artifact.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    DocumentRenderEntryController,
    DocumentSkillRenderEntryController,
    MarkdownArtifactController,
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
    MarkdownArtifactService,
  ],
  exports: [
    PreviewService,
    AIIdentifierService,
    DocumentStructureService,
    TemplateRepository,
    SkillRepository,
    RenderOutputRepository,
    TemplateWorkflowService,
    StudioSkillRenderDataService,
    MarkdownArtifactService,
  ],
})
export class DocumentRuntimeFacadeModule {}
