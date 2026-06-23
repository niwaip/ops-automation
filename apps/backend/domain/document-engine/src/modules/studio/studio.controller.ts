/**
 * Carbone Engine - Studio Workflow Controller
 */

import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import {
  TEMPLATE_WORKFLOW_SCHEMA_VERSION,
  TemplateAssetImportPayload,
  TemplateAssetManifest,
  TemplateResponse,
} from './studio.types';
import {
  WorkflowAnalyzeResult,
  WorkflowCompareResult,
  WorkflowRecognizeResult,
  WorkflowSaveResult,
  WorkflowUnderstandResult,
  TemplateWorkflowService,
} from './template-workflow.service';
import {
  TemplateAnalyzeDto,
  TemplateAssetExportDto,
  TemplateAssetImportDto,
  TemplateCompareDto,
  TemplateRenderDataDto,
  TemplateSaveDto,
  TemplateUnderstandDto,
} from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';

export * from './studio.dto';

@ApiTags('studio')
@Controller('studio')
export class StudioController extends StudioControllerBase {
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
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService
    );
  }

  /**
   * 获取模板信息
   */
  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template information' })
  async getTemplate(@Param('id') id: string): Promise<TemplateResponse> {
    return this.getTemplateMetaWithDbFallback(id);
  }

  /**
   * 获取模板变量列表
   */
  @Get('templates/:id/variables')
  @ApiOperation({ summary: 'Get template variables' })
  async getVariables(@Param('id') id: string): Promise<{ variables: string[] }> {
    const meta = await this.getTemplateMetaWithDbFallback(id);
    return { variables: meta.variables };
  }

  /**
   * 获取模板循环配置
   */
  @Get('templates/:id/loops')
  @ApiOperation({ summary: 'Get template loop configurations' })
  async getLoops(@Param('id') id: string): Promise<{ loops: Array<{ arrayPath: string }> }> {
    const meta = await this.getTemplateMetaWithDbFallback(id);
    return { loops: meta.loops };
  }

  @Post('template/analyze')
  @ApiOperation({ summary: 'Analyze template document IR with optional sample document' })
  @ApiBody({ type: TemplateAnalyzeDto })
  async analyzeTemplateWorkflow(@Body() dto: TemplateAnalyzeDto): Promise<WorkflowAnalyzeResult> {
    if (!this.isPlainObject(dto.templateDocumentIr)) {
      throw new HttpException('templateDocumentIr 不能为空', HttpStatus.BAD_REQUEST);
    }

    const result = this.templateWorkflowService.analyzeTemplate(
      dto.templateDocumentIr,
      dto.sampleDocument,
      dto.sourceLanguage || 'zh',
      dto.targetLanguages || [],
      dto.termAssets
    );

    return result;
  }

  @Post('template/compare')
  @ApiOperation({
    summary: 'Compare template structure with sample document and build candidate fields',
  })
  @ApiBody({ type: TemplateCompareDto })
  async compareTemplateWorkflow(@Body() dto: TemplateCompareDto): Promise<WorkflowCompareResult> {
    if (!this.isPlainObject(dto.templateDocumentIr)) {
      throw new HttpException('templateDocumentIr 不能为空', HttpStatus.BAD_REQUEST);
    }

    return this.templateWorkflowService.compareTemplate(
      dto.templateDocumentIr,
      dto.sampleDocument,
      dto.sourceLanguage || 'zh',
      dto.targetLanguages || [],
      dto.termAssets,
      dto.workflowId
    );
  }

  @Post('template/understand')
  @ApiOperation({ summary: 'Understand template and sample document before field recognition' })
  @ApiBody({ type: TemplateUnderstandDto })
  async understandTemplateWorkflow(
    @Body() dto: TemplateUnderstandDto
  ): Promise<WorkflowUnderstandResult> {
    if (!this.isPlainObject(dto.templateDocumentIr)) {
      throw new HttpException('templateDocumentIr 不能为空', HttpStatus.BAD_REQUEST);
    }

    return this.templateWorkflowService.understandTemplate(
      dto.templateDocumentIr,
      dto.sampleDocument,
      dto.sourceLanguage || 'zh',
      dto.targetLanguages || [],
      dto.termAssets,
      dto.candidateFields
    );
  }

  @Post('template/recognize')
  @ApiOperation({ summary: 'Recognize workflow fields from template and sample document' })
  @ApiBody({ type: TemplateAnalyzeDto })
  async recognizeTemplateWorkflow(
    @Body() dto: TemplateAnalyzeDto
  ): Promise<WorkflowRecognizeResult> {
    if (!this.isPlainObject(dto.templateDocumentIr)) {
      throw new HttpException('templateDocumentIr 不能为空', HttpStatus.BAD_REQUEST);
    }

    let skill = dto.skill;
    if (!skill && dto.skillId) {
      const skillPath = path.join(this.templatesDir, `skill_${dto.skillId}.json`);
      if (fs.existsSync(skillPath)) {
        try {
          skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
        } catch (e) {
          this.logger.warn(`Failed to parse skill file: ${skillPath}`);
        }
      }
    }

    return this.templateWorkflowService.recognizeTemplate(
      dto.templateDocumentIr,
      dto.sampleDocument,
      dto.sourceLanguage || 'zh',
      dto.targetLanguages || [],
      dto.termAssets,
      dto.candidateFields,
      dto.prefetchedUnderstanding,
      skill
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
    if (!Array.isArray(dto.templateFieldSpecs) || dto.templateFieldSpecs.length === 0) {
      throw new HttpException('TPL_001: templateFieldSpecs 不能为空', HttpStatus.BAD_REQUEST);
    }

    const templateId = dto.templateId || uuidv4();
    const metaPath = path.join(this.templatesDir, `${templateId}.json`);
    const existingMeta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      : undefined;

    const format = String(existingMeta?.format || 'docx');
    const workflowResult: WorkflowSaveResult =
      this.templateWorkflowService.compileAndPersistTemplate(
        templateId,
        dto.templateMeta,
        dto.templateFieldSpecs,
        dto.saveMode,
        format
      );

    const nextMeta = this.buildWorkflowMetaDocument(templateId, dto, workflowResult, existingMeta);

    fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2));
    await this.syncTemplateMetaToDb(
      templateId,
      nextMeta as Record<string, any> & { format: string },
      fs.existsSync(path.join(this.templatesDir, `${templateId}.${nextMeta.format}`))
        ? path.join(this.templatesDir, `${templateId}.${nextMeta.format}`)
        : metaPath
    );

    return {
      templateId: workflowResult.templateId,
      version: workflowResult.version,
      bindingPlanVersion: workflowResult.bindingPlanVersion,
      status: workflowResult.status,
      updatedAt: workflowResult.updatedAt,
      templateAssetManifest: workflowResult.templateAssetManifest,
    };
  }

  @Post('template/export')
  @ApiOperation({ summary: 'Export template asset manifest with optional binary' })
  @ApiBody({ type: TemplateAssetExportDto })
  async exportTemplateAsset(
    @Body() dto: TemplateAssetExportDto
  ): Promise<TemplateAssetImportPayload> {
    const meta = await this.getTemplateMetaWithDbFallback(dto.templateId);
    const workflow = this.readWorkflowConfig(meta as Record<string, any>);
    if (!workflow.templateAssetManifest) {
      throw new HttpException('TPL_003: 当前模板缺少可导出的模板资产清单', HttpStatus.BAD_REQUEST);
    }

    let templateBinary: string | undefined;
    if (dto.includeBinary) {
      const templatePath = path.join(this.templatesDir, `${dto.templateId}.${meta.format}`);
      if (!fs.existsSync(templatePath)) {
        throw new HttpException(
          'TPL_004: 模板二进制文件不存在，无法导出完整资产包',
          HttpStatus.BAD_REQUEST
        );
      }
      templateBinary = fs.readFileSync(templatePath).toString('base64');
    }

    return {
      manifest: workflow.templateAssetManifest,
      templateBinary,
    };
  }

  @Post('template/import')
  @ApiOperation({ summary: 'Import template asset manifest with optional binary' })
  @ApiBody({ type: TemplateAssetImportDto })
  async importTemplateAsset(@Body() dto: TemplateAssetImportDto): Promise<TemplateResponse> {
    if (!this.isPlainObject(dto?.manifest)) {
      throw new HttpException('TPL_005: manifest 不能为空', HttpStatus.BAD_REQUEST);
    }

    const manifest = dto.manifest;
    const templateId = String(manifest.templateId || uuidv4()).trim() || uuidv4();
    const format = String(manifest.format || 'docx');
    const renderPlan = manifest.renderPlan;
    const metaPath = path.join(this.templatesDir, `${templateId}.json`);
    const filePath = path.join(this.templatesDir, `${templateId}.${format}`);
    const existingMeta = fs.existsSync(metaPath)
      ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      : undefined;

    if (dto.templateBinary) {
      fs.writeFileSync(filePath, Buffer.from(dto.templateBinary, 'base64'));
    }

    const nextMeta = {
      ...(existingMeta || {}),
      id: templateId,
      type: existingMeta?.type || 'template',
      format,
      fileName: String(
        manifest.fileName || existingMeta?.fileName || `imported-${templateId}.${format}`
      ),
      hasValidFile: dto.templateBinary ? true : (existingMeta?.hasValidFile ?? false),
      variables: Array.isArray(renderPlan?.bindings)
        ? renderPlan.bindings.map((binding) => binding.variablePath)
        : [],
      loops: existingMeta?.loops || [],
      templateConfig: {
        ...(this.isPlainObject(existingMeta?.templateConfig) ? existingMeta.templateConfig : {}),
        templateWorkflow: {
          workflowVersion: TEMPLATE_WORKFLOW_SCHEMA_VERSION,
          templateFieldSpecs: Array.isArray(manifest.templateFieldSpecs)
            ? manifest.templateFieldSpecs
            : [],
          carboneBindingPlan: renderPlan,
          renderPlan,
          languageProfile: manifest.languageProfile,
          termAssets: manifest.termAssets,
          status: 'ready',
          version: this.resolveRenderPlanVersion(renderPlan),
          bindingPlanVersion: this.resolveRenderPlanVersion(renderPlan, manifest.renderPlanVersion),
        },
        templateAssetManifest: manifest,
      },
      configSavedAt: String(manifest.metadata?.generatedAt || new Date().toISOString()),
      createdAt:
        existingMeta?.createdAt ||
        String(manifest.metadata?.generatedAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2));
    await this.syncTemplateMetaToDb(
      templateId,
      nextMeta as Record<string, any> & { format: string },
      fs.existsSync(filePath) ? filePath : metaPath
    );

    return this.getTemplateMeta(templateId);
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
    const meta = await this.getTemplateMetaWithDbFallback(dto.templateId);
    const workflow = this.readWorkflowConfig(meta as Record<string, any>);
    if (workflow.templateFieldSpecs.length === 0) {
      throw new HttpException(
        'TPL_002: 当前模板尚未保存 TemplateFieldSpec',
        HttpStatus.BAD_REQUEST
      );
    }

    return (await this.templateWorkflowService.renderData(
      dto.userInput,
      workflow.templateFieldSpecs,
      workflow.carboneBindingPlan,
      dto.sourceLanguage || workflow.sourceLanguage || 'zh',
      dto.targetLanguages || workflow.targetLanguages || [],
      dto.userOverrides,
      dto.termAssets || workflow.termAssets
    )) as {
      data: Record<string, unknown>;
      sourceTrace: Record<string, unknown>;
      warnings: string[];
      missingFields: string[];
      needsReviewFields: string[];
    };
  }
}
