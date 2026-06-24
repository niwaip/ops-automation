/**
 * Carbone Engine - Studio Render Controller
 */

import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService } from './ai-identifier.service';
import { DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import { buildDocumentRenderArtifacts } from './document-artifact.helper';
import { RenderResponse } from './studio.types';
import { TemplateWorkflowService } from './template-workflow.service';
import { PreviewDto, RenderResolvedDto, ValidateDto } from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';
import { applyDirectRenderPaths } from './utils/direct-render-path.helper';

@ApiTags('studio')
@Controller('studio')
export class StudioRenderController extends StudioControllerBase {
  // #region debug-point B:studio-render
  private debugReport(hypothesisId: string, msg: string, data: Record<string, unknown> = {}): void {
    const fs = require('fs');
    let url = 'http://127.0.0.1:7777/event';
    let sessionId = 'signing-date-render';
    try {
      const env = fs.readFileSync('.dbg/signing-date-render.env', 'utf8');
      url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || url;
      sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || sessionId;
    } catch {}
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        runId: 'pre-fix',
        hypothesisId,
        location: 'studio-render.controller.ts',
        msg: `[DEBUG] ${msg}`,
        data,
        ts: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

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
   * 基于已解析上下文渲染文档
   * 允许同时携带 templateId 和 skillId，并校验两者是否指向同一模板
   */
  @Post('render-resolved')
  @Header('X-Document-Render-Entry', 'unified-runtime')
  @ApiOperation({
    summary: 'Render document with resolved template and skill context',
    description:
      '正式文档运行时统一入口。Capability Runtime、AI tool、Temporal Activity 等正式调用方应收口到该接口。',
  })
  @ApiBody({ type: RenderResolvedDto })
  async renderResolved(@Body() dto: RenderResolvedDto): Promise<RenderResponse> {
    const resolved = await this.resolveRenderTarget({
      templateId: dto.templateId,
      skillId: dto.skillId,
      publishedSkillId: dto.publishedSkillId,
    });

    return this.renderResolvedDocument({
      templateId: resolved.templateId,
      skillId: resolved.skillId,
      publishedSkillId: resolved.publishedSkillId,
      data: dto.data || {},
      workflowInputParams: dto.workflowInputParams,
      workflowInputPolicy: dto.workflowInputPolicy,
      outputFormat: dto.outputFormat,
      outputName: dto.outputName,
      sourceLanguage: dto.sourceLanguage,
      targetLanguages: dto.targetLanguages,
      prepareLocalizedRenderData: dto.prepareLocalizedRenderData,
    });
  }

  private async resolveRenderTarget(input: {
    templateId?: string;
    skillId?: string;
    publishedSkillId?: string;
  }): Promise<{
    templateId: string;
    skillId?: string;
    publishedSkillId?: string;
  }> {
    const requestedTemplateId =
      typeof input.templateId === 'string' && input.templateId.trim()
        ? input.templateId.trim()
        : undefined;
    const requestedSkillId =
      typeof input.skillId === 'string' && input.skillId.trim() ? input.skillId.trim() : undefined;
    const publishedSkillId =
      typeof input.publishedSkillId === 'string' && input.publishedSkillId.trim()
        ? input.publishedSkillId.trim()
        : undefined;

    if (!requestedTemplateId && !requestedSkillId) {
      throw new HttpException(
        'Missing render target: require templateId or skillId',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!requestedSkillId) {
      return {
        templateId: requestedTemplateId as string,
        publishedSkillId,
      };
    }

    const skillMeta = await this.getSkillWithDbFallback(requestedSkillId);
    if (!skillMeta) {
      if (requestedTemplateId) {
        return {
          templateId: requestedTemplateId,
          publishedSkillId,
        };
      }
      throw new HttpException(`Skill not found: ${requestedSkillId}`, HttpStatus.NOT_FOUND);
    }

    const resolvedTemplateId =
      typeof skillMeta.templateId === 'string' && skillMeta.templateId.trim()
        ? skillMeta.templateId.trim()
        : undefined;
    if (!resolvedTemplateId) {
      throw new HttpException(
        `Skill ${requestedSkillId} is not bound to a template`,
        HttpStatus.BAD_REQUEST
      );
    }

    if (requestedTemplateId && requestedTemplateId !== resolvedTemplateId) {
      throw new HttpException(
        `Skill ${requestedSkillId} resolves to template ${resolvedTemplateId}, but received templateId ${requestedTemplateId}`,
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      templateId: resolvedTemplateId,
      skillId: requestedSkillId,
      publishedSkillId,
    };
  }

  private async renderResolvedDocument(input: {
    templateId: string;
    data: Record<string, any>;
    workflowInputParams?: Record<string, unknown>;
    workflowInputPolicy?: Record<string, unknown>;
    outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
    skillId?: string;
    publishedSkillId?: string;
    outputName?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
    prepareLocalizedRenderData?: boolean;
  }): Promise<RenderResponse> {
    const meta = await this.getTemplateMetaWithDbFallback(input.templateId);
    const workflow = this.readWorkflowConfig(meta as Record<string, any>);
    const templatePath = path.join(this.templatesDir, `${input.templateId}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      let renderInputData = input.data || {};
      const sourceLanguage = input.sourceLanguage || workflow.sourceLanguage || 'zh';
      const targetLanguages = Array.isArray(input.targetLanguages)
        ? input.targetLanguages
        : workflow.targetLanguages || [];

      if (input.prepareLocalizedRenderData === true) {
        renderInputData = applyDirectRenderPaths(input.data || {}, input.workflowInputParams);
      }

      const normalizedData = this.normalizeRenderData(renderInputData);
      // #region debug-point B:normalized-data
      this.debugReport('B', 'render-resolved normalized data prepared', {
        templateId: input.templateId,
        prepareLocalizedRenderData: input.prepareLocalizedRenderData === true,
        sourceLanguage,
        targetLanguages,
        signingDateCnType: typeof normalizedData?.contract?.signingDate_cn,
        signingDateJpType: typeof normalizedData?.contract?.signingDate_jp,
        signingDateCnValue: normalizedData?.contract?.signingDate_cn ?? null,
        signingDateJpValue: normalizedData?.contract?.signingDate_jp ?? null,
        itemRowCount: Array.isArray(normalizedData?.items) ? normalizedData.items.length : 0,
      });
      // #endregion

      const templateBuffer = fs.readFileSync(templatePath);
      const config = meta.templateConfig || {};
      const markedBuffer = await this.documentStructureService.applyConfigToDocx(
        templateBuffer,
        config
      );
      const outputBuffer = await this.engine.render(markedBuffer, normalizedData, meta.fileName);

      const outputId = uuidv4();
      const outputFormat = input.outputFormat || meta.format;
      const outputFileName = this.generateOutputFileName(
        input.outputName || meta.fileName,
        outputFormat
      );
      const outputPath = path.join(this.outputsDir, `${outputId}.${outputFormat}`);
      fs.writeFileSync(outputPath, outputBuffer);

      const outputMeta = {
        id: outputId,
        templateId: input.templateId,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(input.publishedSkillId ? { publishedSkillId: input.publishedSkillId } : {}),
        ...(input.outputName ? { outputName: input.outputName } : {}),
        ...(sourceLanguage ? { sourceLanguage } : {}),
        ...(targetLanguages.length > 0 ? { targetLanguages } : {}),
        ...(input.prepareLocalizedRenderData === true ? { prepareLocalizedRenderData: true } : {}),
        fileName: outputFileName,
        format: outputFormat,
        size: outputBuffer.length,
        params: renderInputData,
        renderedAt: new Date().toISOString(),
      };
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);
      fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
      await this.syncRenderOutputToDb(outputMeta, outputPath);

      return {
        downloadUrl: `/studio/download/${outputId}`,
        fileName: outputFileName,
        format: outputFormat,
        size: outputBuffer.length,
        artifacts: buildDocumentRenderArtifacts({
          outputId,
          downloadUrl: `/studio/download/${outputId}`,
          fileName: outputFileName,
          format: outputFormat,
          sizeBytes: outputBuffer.length,
          templateId: input.templateId,
          skillId: input.skillId,
          publishedSkillId: input.publishedSkillId,
        }),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      // #region debug-point B:render-resolved-error
      this.logger.error(
        `render-resolved failed for template=${input.templateId}: ${message}`,
        stack
      );
      this.debugReport('B', 'render-resolved failed', {
        templateId: input.templateId,
        skillId: input.skillId || null,
        publishedSkillId: input.publishedSkillId || null,
        sourceLanguage: input.sourceLanguage || null,
        targetLanguages: Array.isArray(input.targetLanguages) ? input.targetLanguages : [],
        prepareLocalizedRenderData: input.prepareLocalizedRenderData === true,
        inputKeyCount:
          input.data && typeof input.data === 'object' ? Object.keys(input.data).length : 0,
        inputKeysSample:
          input.data && typeof input.data === 'object' ? Object.keys(input.data).slice(0, 15) : [],
        workflowInputParamKeys:
          input.workflowInputParams && typeof input.workflowInputParams === 'object'
            ? Object.keys(input.workflowInputParams).slice(0, 15)
            : [],
        workflowInputPolicyKeys:
          input.workflowInputPolicy && typeof input.workflowInputPolicy === 'object'
            ? Object.keys(input.workflowInputPolicy).slice(0, 15)
            : [],
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: message,
      });
      // #endregion
      throw new HttpException(
        `Failed to render resolved document: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 预览模板（使用示例数据）
   */
  @Post('preview')
  @ApiOperation({ summary: 'Preview template with sample data' })
  @ApiBody({ type: PreviewDto })
  async previewTemplate(
    @Body() dto: PreviewDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ preview: StreamableFile; sampleData: any }> {
    const meta = this.getTemplateMeta(dto.templateId);
    const templatePath = path.join(this.templatesDir, `${dto.templateId}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      const templateBuffer = fs.readFileSync(templatePath);
      const result = await this.engine.preview(templateBuffer, meta.fileName, {
        maxRows: dto.maxRows || 3,
      });

      res.setHeader('Content-Type', this.getContentType(meta.format));
      res.setHeader('Content-Disposition', `inline; filename="preview_${meta.fileName}"`);

      return {
        preview: new StreamableFile(result.buffer),
        sampleData: result.sampleData,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to preview template: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 验证模板配置内容（不需要templateId）
   */
  @Post('validate-content')
  @ApiOperation({ summary: 'Validate template configuration content' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Template configuration JSON string' },
      },
    },
  })
  async validateTemplateContent(@Body() body: { template: string }): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const config = JSON.parse(body.template || '{}');
      const errors: string[] = [];
      const warnings: string[] = [];

      // 验证基本结构
      if (!config.templateType) {
        warnings.push('未指定模板类型');
      }

      // 验证变量映射
      if (config.variableMappings) {
        for (const [key, value] of Object.entries(config.variableMappings)) {
          if (!value || typeof value !== 'string') {
            errors.push(`变量映射 "${key}" 的值无效`);
          } else if (!value.startsWith('{d.')) {
            warnings.push(`变量映射 "${key}" 的值 "${value}" 建议使用 {d.xxx} 格式`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        errors: [message],
        warnings: [],
      };
    }
  }

  /**
   * 预览模板内容（无需保存模板ID）
   * 接收已替换变量的文档内容，生成预览
   */
  @Post('preview-content')
  @ApiOperation({ summary: 'Preview template content without saving' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentContent: { type: 'string', description: 'Document content with variables applied' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        format: { type: 'string', description: 'Document format (docx, xlsx, pptx)' },
      },
    },
  })
  async previewTemplateContent(
    @Body() body: { documentContent: string; templateConfig?: any; format?: string }
  ): Promise<{
    success: boolean;
    previewUrl?: string;
    sampleData?: any;
    error?: string;
  }> {
    try {
      // 从配置生成示例数据
      const config = body.templateConfig || {};
      let sampleData: any = {};

      if (config.variableMappings) {
        // 从变量映射生成示例数据
        for (const [key, path] of Object.entries(config.variableMappings)) {
          if (typeof path === 'string' && path.startsWith('{d.')) {
            // 提取路径：{d.xxx} -> xxx
            const pathMatch = path.match(/\{d\.(\w+)\}/);
            if (pathMatch) {
              sampleData[pathMatch[1]] = `示例_${pathMatch[1]}`;
            }
          }
        }
      }

      // 创建临时模板文件
      const tempId = uuidv4();
      const format = body.format || 'docx';
      const tempPath = path.join(this.templatesDir, `${tempId}.${format}`);

      // 解码文档内容（如果是base64）
      let templateBuffer: Buffer;
      if (body.documentContent.startsWith('base64:')) {
        templateBuffer = Buffer.from(body.documentContent.substring(7), 'base64');
      } else {
        templateBuffer = Buffer.from(body.documentContent, 'utf-8');
      }

      fs.writeFileSync(tempPath, templateBuffer);

      // 保存临时元数据
      const metaPath = path.join(this.templatesDir, `${tempId}.json`);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({
          id: tempId,
          format,
          fileName: `preview_${tempId}.${format}`,
          config,
          isTemp: true,
          createdAt: new Date().toISOString(),
        })
      );

      // 渲染预览
      const fileName = `preview_${tempId}.${format}`;
      const result = await this.engine.render(templateBuffer, sampleData, fileName);

      // 保存渲染结果
      const outputId = uuidv4();
      const outputPath = path.join(this.outputsDir, `${outputId}.${format}`);
      fs.writeFileSync(outputPath, Buffer.from(result));

      return {
        success: true,
        previewUrl: `/studio/preview-file/${outputId}`,
        sampleData,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * 验证模版并生成文档（使用编辑后的模版和保存的示例数据）
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate template and generate document with saved sample data' })
  @ApiBody({ type: ValidateDto })
  async validateData(@Body() dto: ValidateDto): Promise<{
    valid: boolean;
    missing: string[];
    downloadUrl?: string;
    fileName?: string;
    sampleData?: any;
    markedTemplateId?: string;
  }> {
    const meta = await this.getTemplateMetaWithDbFallback(dto.templateId);

    // 检查是否有保存的验证结果和示例数据
    const verifyResult = (meta as any).verifyResult;
    const savedSampleData = verifyResult?.sampleData;

    // 检查是否有编辑后的模版（markedTemplate）
    let templatePath = path.join(this.templatesDir, `${dto.templateId}.${meta.format}`);
    let templateBuffer: Buffer = fs.readFileSync(templatePath);
    let config = meta.templateConfig || {};
    let markedTemplateId =
      verifyResult?.markedTemplateId ||
      (meta as any).markedTemplateId ||
      (dto.data as any)?.markedTemplateId;

    if (markedTemplateId) {
      const markedMetaPath = path.join(this.templatesDir, `${markedTemplateId}.json`);
      if (fs.existsSync(markedMetaPath)) {
        const markedMeta = JSON.parse(fs.readFileSync(markedMetaPath, 'utf-8'));
        const markedTemplatePath = path.join(
          this.templatesDir,
          `${markedTemplateId}.${meta.format}`
        );
        if (fs.existsSync(markedTemplatePath)) {
          templateBuffer = fs.readFileSync(markedTemplatePath);
          templatePath = markedTemplatePath;
          // 使用marked模版的配置
          config = markedMeta.templateConfig || config;
        }
      }
    } else {
      // 没有markedTemplateId时，应用配置到原始模版
      if (config && Object.keys(config).length > 0) {
        // 确保配置路径规范化
        const normalizedConfig = this.aiIdentifierService.normalizeTemplateConfig(config);
        templateBuffer = Buffer.from(
          await this.documentStructureService.applyConfigToDocx(templateBuffer, normalizedConfig)
        );
        // 更新config引用，以便后续生成数据使用规范化后的路径
        config = normalizedConfig;
      }
    }

    // 解析模版获取变量
    const templateInfo = await this.engine.parseTemplateBuffer(templateBuffer, meta.fileName);

    // 使用保存的示例数据，如果没有则生成新的
    let sampleData = savedSampleData;
    if (!sampleData) {
      sampleData = await this.generateTemplateSampleData(meta, templateInfo, config, 8);
    }

    // 渲染文档
    try {
      const outputBuffer = await this.engine.render(templateBuffer, sampleData, meta.fileName);

      // 保存渲染结果
      const outputId = uuidv4();
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      const outputMeta = {
        id: outputId,
        templateId: dto.templateId,
        markedTemplateId: markedTemplateId,
        fileName: `validate_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData,
      };
      fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
      await this.syncRenderOutputToDb(outputMeta, outputPath);

      return {
        valid: true,
        missing: [],
        downloadUrl: `/studio/download/${outputId}`,
        fileName: `validate_${meta.fileName}`,
        sampleData: sampleData,
        markedTemplateId: markedTemplateId,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        missing: [],
        sampleData: sampleData,
      };
    }
  }

  /**
   * 从Office文档生成模板
   * 接收文档内容和建议列表，生成最终的模板文件
   */
  @Post('generate')
  @ApiOperation({ summary: 'Generate template from Office document with suggestions' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentContent: { type: 'string', description: 'Document content (base64 for binary)' },
        suggestions: { type: 'array', description: 'Applied suggestions' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        format: { type: 'string', description: 'Document format (docx, xlsx, pptx)' },
      },
    },
  })
  async generateTemplate(
    @Body()
    body: {
      documentContent: string;
      suggestions: any[];
      templateConfig?: any;
      format?: string;
    }
  ): Promise<{
    success: boolean;
    generatedTemplate?: string;
    templateId?: string;
    downloadUrl?: string;
    hasValidFile?: boolean;
    error?: string;
  }> {
    try {
      // 从建议列表提取变量映射
      const variableMappings: Record<string, string> = {};
      for (const suggestion of body.suggestions || []) {
        if (suggestion.applied && suggestion.originalText && suggestion.suggestedName) {
          variableMappings[suggestion.originalText] = suggestion.suggestedName;
        }
      }

      // 生成模板配置
      const format = body.format || 'docx';
      const templateConfig = body.templateConfig || {
        templateType: 'custom',
        variableMappings,
        outputPath: '',
        formatType: format,
      };

      // 创建模板ID和文件
      const templateId = uuidv4();
      const templateMetaPath = path.join(this.templatesDir, `${templateId}.json`);
      const templateFilePath = path.join(this.templatesDir, `${templateId}.${format}`);

      // 解码并保存模板文件
      let templateBuffer: Buffer;
      let isValidDocx = true;

      this.logger.debug(
        `generateTemplate received documentContent length: ${body.documentContent.length}`
      );
      this.logger.debug(`documentContent prefix: ${body.documentContent.substring(0, 20)}`);

      if (body.documentContent.startsWith('base64:')) {
        const base64Data = body.documentContent.substring(7);
        this.logger.debug(`base64 data length: ${base64Data.length}`);
        templateBuffer = Buffer.from(base64Data, 'base64');
        this.logger.debug(`decoded buffer length: ${templateBuffer.length}`);
      } else if (body.documentContent.startsWith('{')) {
        // JSON格式（Excel数据或OOXML）
        templateBuffer = Buffer.from(body.documentContent, 'utf-8');
        isValidDocx = false;
      } else {
        // 假设是base64编码的文档
        try {
          templateBuffer = Buffer.from(body.documentContent, 'base64');
        } catch {
          templateBuffer = Buffer.from(body.documentContent, 'utf-8');
          isValidDocx = false;
        }
      }

      // 验证是否是有效的docx文件（docx是zip格式，前4字节应该是PK）
      if (format === 'docx' && templateBuffer.length > 4) {
        const header = templateBuffer.slice(0, 4).toString();
        this.logger.debug(`file header: ${header}`);
        if (!header.startsWith('PK')) {
          this.logger.warn('Not a valid docx file (not PK header), but will save metadata');
          isValidDocx = false;
        }
      }

      let persistedTemplatePath = templateFilePath;

      // 只有有效文件才保存物理文件，否则只保存元数据
      if (isValidDocx && templateBuffer.length > 0) {
        fs.writeFileSync(templateFilePath, templateBuffer);
      } else {
        this.logger.debug('Saving metadata only (no valid docx file)');
        // 保存文本内容作为参考
        const textPath = path.join(this.templatesDir, `${templateId}_content.txt`);
        fs.writeFileSync(textPath, templateBuffer.toString('utf-8'));
        persistedTemplatePath = textPath;
      }

      // 保存模板配置
      const templateMeta = {
        id: templateId,
        format,
        fileName: `template_${templateId}.${format}`,
        config: templateConfig,
        templateConfig,
        suggestions: body.suggestions,
        hasValidFile: isValidDocx,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(templateMetaPath, JSON.stringify(templateMeta));
      await this.syncTemplateMetaToDb(templateId, templateMeta, persistedTemplatePath);

      return {
        success: true,
        templateId,
        generatedTemplate: JSON.stringify(templateConfig),
        downloadUrl: isValidDocx ? `/studio/download-template/${templateId}` : undefined,
        hasValidFile: isValidDocx,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * 下载渲染后的文档
   */
  @Get('download/:id')
  @ApiOperation({ summary: 'Download rendered document' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadDocument(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const metaPath = path.join(this.outputsDir, `${id}.json`);

    if (!fs.existsSync(metaPath)) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const filePath = path.join(this.outputsDir, `${id}.${meta.format}`);

    if (!fs.existsSync(filePath)) {
      throw new HttpException('Document file not found', HttpStatus.NOT_FOUND);
    }

    res.setHeader('Content-Type', this.getContentType(meta.format));
    // 使用RFC 5987编码处理中文文件名
    const encodedFileName = encodeURIComponent(meta.fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);

    const file = fs.createReadStream(filePath);
    return new StreamableFile(file);
  }

  /**
   * 下载注入后的模版文件
   */
  @Get('download-template/:id')
  @ApiOperation({ summary: 'Download marked template file' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadTemplate(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    if (!fs.existsSync(metaPath)) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const filePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(filePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    res.setHeader('Content-Type', this.getContentType(meta.format));
    // 使用RFC 5987编码处理中文文件名
    const encodedFileName = encodeURIComponent(meta.fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);

    const file = fs.createReadStream(filePath);
    return new StreamableFile(file);
  }

  /**
   * 获取模板HTML预览（用于前端iframe显示）
   */
  @Get('templates/:id/preview-html')
  @ApiOperation({ summary: 'Get template HTML preview for iframe display' })
  async getTemplateHtmlPreview(@Param('id') id: string): Promise<{ html: string; format: string }> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      const result = await this.previewService.generatePreview(templatePath, meta.format);
      return {
        html: result.html,
        format: result.format,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to generate preview: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 预览渲染文件（用于popup）
   */
  @Get('preview-file/:id')
  @ApiOperation({ summary: 'Preview rendered file for popup' })
  async previewRenderedFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response
  ): Promise<StreamableFile> {
    const metaPath = path.join(this.outputsDir, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
      throw new HttpException('Preview file not found', HttpStatus.NOT_FOUND);
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const filePath = path.join(this.outputsDir, `${id}.${meta.format}`);

    if (!fs.existsSync(filePath)) {
      throw new HttpException('File not found', HttpStatus.NOT_FOUND);
    }

    // 设置Content-Type
    res.setHeader('Content-Type', this.getContentType(meta.format));

    // 使用RFC 5987编码文件名以支持中文字符
    const encodedFileName = encodeURIComponent(meta.fileName);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedFileName}`);

    const file = fs.createReadStream(filePath);
    return new StreamableFile(file);
  }
}
