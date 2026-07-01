import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RenderResponse } from '../../render/contracts';
import { PreviewService } from '../../render/preview/preview.service';
import { StudioRenderController } from '../../render/resolved-render/studio-render.controller';
import { RenderOutputRepository } from '../../template/repository/render-output.repository';
import { SkillRepository } from '../../template/repository/skill.repository';
import { TemplateRepository } from '../../template/repository/template.repository';
import { AIIdentifierService } from '../../template/workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from '../../template/workflow-authoring/document-structure.service';
import { TemplateWorkflowService } from '../../template/workflow-authoring/template-workflow.service';
import { RenderResolvedDto } from './document-runtime-facade.dto';

@ApiTags('document-runtime-facade')
@Controller('studio')
export class DocumentRenderEntryController extends StudioRenderController {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService
  ) {
    super(
      previewService as any,
      aiIdentifierService as any,
      documentStructureService as any,
      templateRepository as any,
      skillRepository as any,
      renderOutputRepository as any,
      templateWorkflowService as any
    );
  }

  @Post('render-resolved')
  @ApiOperation({
    summary: 'Render document from the document-domain runtime facade',
    description:
      '文档能力域运行时正式入口，负责解析模板与技能上下文并执行统一文档渲染。',
  })
  @ApiBody({ type: RenderResolvedDto })
  override async renderResolved(@Body() dto: RenderResolvedDto): Promise<RenderResponse> {
    return super.renderResolved(dto);
  }
}
