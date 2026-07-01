/**
 * Carbone Engine - Studio Workflow Controller
 */

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PreviewService } from '../../render/preview/preview.service';
import { AIIdentifierService } from '../workflow-authoring/ai-identifier.service';
import { DocumentStructureService } from '../workflow-authoring/document-structure.service';
import { TemplateRepository } from '../repository/template.repository';
import { SkillRepository } from '../repository/skill.repository';
import { RenderOutputRepository } from '../repository/render-output.repository';
import {
  DEFAULT_RENDER_PLAN_VERSION,
  TEMPLATE_WORKFLOW_SCHEMA_VERSION,
  TemplateAssetImportPayload,
  TemplateAssetManifest,
  TemplateResponse,
} from './studio.types';
import {
  WorkflowAnalyzeResult,
  WorkflowCompareResult,
  WorkflowRecognizeResult,
  WorkflowUnderstandResult,
  TemplateWorkflowService,
} from '../workflow-authoring/template-workflow.service';
import {
  TemplateAnalyzeDto,
  TemplateAssetExportDto,
  TemplateAssetImportDto,
  TemplateCompareDto,
  TemplateRenderDataDto,
  TemplateSaveDto,
  TemplateUnderstandDto,
} from './studio.dto';
import { createStudioControllerRuntime, isStudioPlainObject } from './utils/studio-runtime.helper';
import {
  analyzeStudioTemplateWorkflow,
  compareStudioTemplateWorkflow,
  recognizeStudioTemplateWorkflow,
  understandStudioTemplateWorkflow,
} from './utils/studio-workflow-analysis.helper';
import {
  exportStudioTemplateAsset,
  importStudioTemplateAsset,
  renderStudioTemplateData,
  saveStudioTemplateWorkflow,
} from './utils/studio-workflow-controller.helper';
import {
  createStudioSkillSupport,
  createStudioTemplateSupport,
  type StudioSkillSupport,
  type StudioTemplateSupport,
} from './utils/studio-controller-composition.helper';

@ApiTags('studio')
@Controller('studio')
export class StudioController {
  private readonly studio = createStudioControllerRuntime(StudioController.name);
  private readonly templateSupport: StudioTemplateSupport;
  private readonly skillSupport: StudioSkillSupport;

  constructor(
    private readonly previewService: PreviewService,
    private readonly aiIdentifierService: AIIdentifierService,
    private readonly documentStructureService: DocumentStructureService,
    private readonly templateRepository: TemplateRepository,
    private readonly skillRepository: SkillRepository,
    private readonly renderOutputRepository: RenderOutputRepository,
    private readonly templateWorkflowService: TemplateWorkflowService
  ) {
    this.templateSupport = createStudioTemplateSupport({
      templatesDir: this.studio.templatesDir,
      aiIdentifierService: this.aiIdentifierService,
      templateRepository: this.templateRepository,
      logger: this.studio.logger,
    });
    this.skillSupport = createStudioSkillSupport({
      skillRepository: this.skillRepository,
      templatesDir: this.studio.templatesDir,
      logger: this.studio.logger,
    });
  }

  /**
   * 获取模板信息
   */
  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template information' })
  async getTemplate(@Param('id') id: string): Promise<TemplateResponse> {
    return this.templateSupport.getTemplateMetaWithDbFallback(id);
  }

  /**
   * 获取模板变量列表
   */
  @Get('templates/:id/variables')
  @ApiOperation({ summary: 'Get template variables' })
  async getVariables(@Param('id') id: string): Promise<{ variables: string[] }> {
    const meta = await this.templateSupport.getTemplateMetaWithDbFallback(id);
    return { variables: meta.variables };
  }

  /**
   * 获取模板循环配置
   */
  @Get('templates/:id/loops')
  @ApiOperation({ summary: 'Get template loop configurations' })
  async getLoops(@Param('id') id: string): Promise<{ loops: Array<{ arrayPath: string }> }> {
    const meta = await this.templateSupport.getTemplateMetaWithDbFallback(id);
    return { loops: meta.loops };
  }

  @Post('template/analyze')
  @ApiOperation({ summary: 'Analyze template document IR with optional sample document' })
  @ApiBody({ type: TemplateAnalyzeDto })
  async analyzeTemplateWorkflow(@Body() dto: TemplateAnalyzeDto): Promise<WorkflowAnalyzeResult> {
    return analyzeStudioTemplateWorkflow(
      {
        isPlainObject: isStudioPlainObject,
        templateWorkflowService: this.templateWorkflowService,
      },
      dto
    );
  }

  @Post('template/compare')
  @ApiOperation({
    summary: 'Compare template structure with sample document and build candidate fields',
  })
  @ApiBody({ type: TemplateCompareDto })
  async compareTemplateWorkflow(@Body() dto: TemplateCompareDto): Promise<WorkflowCompareResult> {
    return compareStudioTemplateWorkflow(
      {
        isPlainObject: isStudioPlainObject,
        templateWorkflowService: this.templateWorkflowService,
      },
      dto
    );
  }

  @Post('template/understand')
  @ApiOperation({ summary: 'Understand template and sample document before field recognition' })
  @ApiBody({ type: TemplateUnderstandDto })
  async understandTemplateWorkflow(
    @Body() dto: TemplateUnderstandDto
  ): Promise<WorkflowUnderstandResult> {
    return understandStudioTemplateWorkflow(
      {
        isPlainObject: isStudioPlainObject,
        templateWorkflowService: this.templateWorkflowService,
      },
      dto
    );
  }

  @Post('template/recognize')
  @ApiOperation({ summary: 'Recognize workflow fields from template and sample document' })
  @ApiBody({ type: TemplateAnalyzeDto })
  async recognizeTemplateWorkflow(
    @Body() dto: TemplateAnalyzeDto
  ): Promise<WorkflowRecognizeResult> {
    return recognizeStudioTemplateWorkflow(
      {
        isPlainObject: isStudioPlainObject,
        templateWorkflowService: this.templateWorkflowService,
        getSkillWithDbFallback: this.skillSupport.getSkillWithDbFallback,
      },
      dto
    );
  }

  @Post('template/save')
  @ApiOperation({ summary: 'Save template field specs and compiled binding plan' })
  @ApiBody({ type: TemplateSaveDto })
  async saveTemplateWorkflow(@Body() dto: TemplateSaveDto): Promise<{
    templateId: string;
    version: number;
    bindingPlanVersion: number;
    status: string;
    updatedAt: string;
    templateAssetManifest?: TemplateAssetManifest;
  }> {
    return saveStudioTemplateWorkflow(
      {
        templatesDir: this.studio.templatesDir,
        templateWorkflowService: this.templateWorkflowService,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
      },
      dto
    ) as Promise<{
      templateId: string;
      version: number;
      bindingPlanVersion: number;
      status: string;
      updatedAt: string;
      templateAssetManifest?: TemplateAssetManifest;
    }>;
  }

  @Post('template/export')
  @ApiOperation({ summary: 'Export template asset manifest with optional binary' })
  @ApiBody({ type: TemplateAssetExportDto })
  async exportTemplateAsset(
    @Body() dto: TemplateAssetExportDto
  ): Promise<TemplateAssetImportPayload> {
    return exportStudioTemplateAsset(
      {
        templatesDir: this.studio.templatesDir,
        getTemplateMetaWithDbFallback: this.templateSupport.getTemplateMetaWithDbFallback,
      },
      dto
    );
  }

  @Post('template/import')
  @ApiOperation({ summary: 'Import template asset manifest with optional binary' })
  @ApiBody({ type: TemplateAssetImportDto })
  async importTemplateAsset(@Body() dto: TemplateAssetImportDto): Promise<TemplateResponse> {
    return importStudioTemplateAsset(
      {
        templatesDir: this.studio.templatesDir,
        syncTemplateMetaToDb: this.templateSupport.syncTemplateMetaToDb,
        getTemplateMeta: this.templateSupport.getTemplateMeta,
        resolveRenderPlanVersion: (renderPlan, explicitVersion) =>
          Number(explicitVersion || renderPlan?.version || DEFAULT_RENDER_PLAN_VERSION),
        isPlainObject: isStudioPlainObject,
      },
      dto,
      TEMPLATE_WORKFLOW_SCHEMA_VERSION
    );
  }

  @Post('template/render-data')
  @ApiOperation({ summary: 'Generate render data from user input and saved template field specs' })
  @ApiBody({ type: TemplateRenderDataDto })
  async renderTemplateData(@Body() dto: TemplateRenderDataDto): Promise<{
    data: Record<string, unknown>;
    sourceTrace: Record<string, unknown>;
    warnings: string[];
    missingFields: string[];
    needsReviewFields: string[];
  }> {
    return (await renderStudioTemplateData(
      {
        getTemplateMetaWithDbFallback: this.templateSupport.getTemplateMetaWithDbFallback,
        templateWorkflowService: this.templateWorkflowService,
      },
      dto
    )) as {
      data: Record<string, unknown>;
      sourceTrace: Record<string, unknown>;
      warnings: string[];
      missingFields: string[];
      needsReviewFields: string[];
    };
  }
}
