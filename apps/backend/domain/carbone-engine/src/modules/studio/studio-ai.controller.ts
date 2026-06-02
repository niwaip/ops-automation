/**
 * Carbone Engine - Studio AI Controller
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
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PreviewService } from './preview.service';
import { AIIdentifierService, AIIdentifyResponse } from './ai-identifier.service';
import { DocumentStructure, DocumentStructureService } from './document-structure.service';
import { TemplateRepository } from './template.repository';
import { SkillRepository } from './skill.repository';
import { RenderOutputRepository } from './render-output.repository';
import { TemplateWorkflowService } from './template-workflow.service';
import {
  AIIdentifyDto,
  AIVerifyDto,
  DirectAIIdentifyDto,
} from './studio.dto';
import { StudioControllerBase } from './studio.controller.base';

@ApiTags('studio')
@Controller('studio')
export class StudioAiController extends StudioControllerBase {
  constructor(
    previewService: PreviewService,
    aiIdentifierService: AIIdentifierService,
    documentStructureService: DocumentStructureService,
    templateRepository: TemplateRepository,
    skillRepository: SkillRepository,
    renderOutputRepository: RenderOutputRepository,
    templateWorkflowService: TemplateWorkflowService,
  ) {
    super(
      previewService,
      aiIdentifierService,
      documentStructureService,
      templateRepository,
      skillRepository,
      renderOutputRepository,
      templateWorkflowService,
    );
  }

  /**
   * AI自动识别模板变量（流式响应）
   */
  @Post('templates/:id/ai-identify-stream')
  @ApiOperation({ summary: 'AI identify potential variables with streaming response' })
  async aiIdentifyVariablesStream(
    @Param('id') id: string,
    @Body() dto: AIIdentifyDto,
    @Res() res: Response,
  ): Promise<void> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      res.status(404).json({ error: 'Template file not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      // 先获取文档结构（如果是DOCX）
      let documentStructure: DocumentStructure | undefined = undefined;
      if (meta.format === 'docx') {
        const buffer = fs.readFileSync(templatePath);
        documentStructure = await this.documentStructureService.parseDocx(buffer);
      }

      const elements = documentStructure?.elements || [];

      // 使用流式AI分析
      const config = await this.aiIdentifierService.analyzeWithAIStream(
        elements,
        dto.context,
        dto.manualMarkings,
        dto.markingSummary,
        (chunk: string) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      );

      if (!config) {
        res.write(`data: ${JSON.stringify({ error: 'AI分析失败，请检查AI服务是否正常' })}\n\n`);
        res.end();
        return;
      }

      // 生成变量建议和循环配置
      const suggestions = this.aiIdentifierService.generateVariableSuggestions?.(elements, config) || [];
      const loops = config.tableLoops || [];
      await this.cacheTemplateSuggestions(id, meta, {
        templateConfig: config,
        suggestions,
      });

      // 返回最终结果
      res.write(`data: ${JSON.stringify({
        done: true,
        templateConfig: config,
        suggestions,
        loops,
        images: config.imageLoops || [],
        combinedVariables: config.combinedVariables || [],
      })}\n\n`);
      res.end();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }

  /**
   * AI自动识别模板变量
   */
  @Post('templates/:id/ai-identify')
  @ApiOperation({ summary: 'AI identify potential variables in template' })
  @ApiBody({ type: AIIdentifyDto })
  async aiIdentifyVariables(
    @Param('id') id: string,
    @Body() dto: AIIdentifyDto
  ): Promise<AIIdentifyResponse> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      // 先获取文档结构（如果是DOCX）
      let documentStructure = undefined;
      if (meta.format === 'docx') {
        const buffer = fs.readFileSync(templatePath);
        documentStructure = await this.documentStructureService.parseDocx(buffer);
      }

      // 传递文档结构给AI分析服务
      const result = await this.aiIdentifierService.identifyVariables(
        templatePath,
        meta.format,
        dto.context,
        documentStructure,
        dto.manualMarkings,
        dto.markingSummary
      );
      await this.cacheTemplateSuggestions(id, meta, result);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to identify variables: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 直接AI识别文档内容 - 用于Office插件
   * 无需上传模板，直接对从Office获取的文档内容进行AI识别
   * 识别需要填充的空白部分，生成模板变量建议
   */
  @Post('direct-ai-identify')
  @ApiOperation({ summary: 'Direct AI identify variables from document content (for Office Add-in)' })
  @ApiBody({ type: DirectAIIdentifyDto })
  @ApiResponse({ status: 200, description: 'AI identification result with suggestions' })
  async directAIIdentify(
    @Body() dto: DirectAIIdentifyDto
  ): Promise<AIIdentifyResponse> {
    try {
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

      // 直接对文档内容进行AI分析
      const result = await this.aiIdentifierService.identifyFromContent(
        dto.documentContent,
        dto.documentType,
        dto.templateType || 'report',
        dto.context,
        dto.customRules,
        skill
      );
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to identify variables: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 多阶段AI识别文档内容 - 用于Office插件（新接口）
   * 使用三阶段AI处理流程：文档理解 -> 分段参数化 -> 整合确认
   * 通过Server-Sent Events实时报告处理进度
   * 支持传入下划线信息，提高空白识别准确度
   */
  @Post('direct-ai-identify-multistage')
  @ApiOperation({ summary: 'Multi-stage AI identify variables with real-time progress (for Office Add-in)' })
  @ApiBody({ type: DirectAIIdentifyDto })
  @ApiResponse({ status: 200, description: 'AI identification result with suggestions' })
  async directAIIdentifyMultistage(
    @Body() dto: DirectAIIdentifyDto
  ): Promise<AIIdentifyResponse> {
    try {
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

      // 调用多阶段AI识别服务（传入下划线和格式信息）
      const result = await this.aiIdentifierService.identifyFromContentMultiStage(
        dto.documentContent,
        dto.documentType,
        dto.templateType || 'contract',
        dto.context,
        // 进度回调 - 用于日志记录
        (progress) => {
          console.log(`[MultiStage Progress] ${progress.stageName}: ${progress.progress}% - ${progress.message}`);
        },
        dto.underlineInfo,    // 下划线信息
        dto.paragraphFormats, // 段落格式信息
        skill
      );
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to identify variables: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 多阶段AI识别 - SSE实时进度版本
   * 使用Server-Sent Events向前端实时推送处理进度
   */
  @Get('direct-ai-identify-progress')
  @ApiOperation({ summary: 'Multi-stage AI identify with SSE progress stream' })
  @ApiQuery({ name: 'documentContent', required: true, description: 'Document text content' })
  @ApiQuery({ name: 'documentType', required: true, description: 'Document type (docx/xlsx/pptx/text)' })
  @ApiQuery({ name: 'templateType', required: false, description: 'Template type (contract/report/etc)' })
  @ApiQuery({ name: 'context', required: false, description: 'Context information' })
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  async directAIIdentifyWithProgress(
    @Query('documentContent') documentContent: string,
    @Query('documentType') documentType: string,
    @Query('templateType') templateType: string,
    @Query('context') context: string,
    @Res() res: Response
  ): Promise<void> {
    // 发送SSE进度事件
    const sendProgress = (progress: any) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        stage: progress.stage,
        stageName: progress.stageName,
        progress: progress.progress,
        message: progress.message,
        currentSection: progress.currentSection
      })}\n\n`);
    };

    // 发送最终结果
    const sendResult = (result: AIIdentifyResponse) => {
      res.write(`data: ${JSON.stringify({
        type: 'result',
        data: result
      })}\n\n`);
      res.end();
    };

    // 发送错误
    const sendError = (error: string) => {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error
      })}\n\n`);
      res.end();
    };

    try {
      // 调用多阶段AI识别
      const result = await this.aiIdentifierService.identifyFromContentMultiStage(
        documentContent,
        documentType,
        templateType || 'contract',
        context,
        sendProgress  // 使用SSE发送进度
      );

      sendResult(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendError(message);
    }
  }


  /**
   * AI验证 - 利用模版自动生成验证报告
   */
  /**
   * AI验证模版（SSE流式输出）- POST请求用于fetch流式处理
   * 实时显示执行过程，生成示例数据并渲染文档
   */
  @Post('templates/:id/ai-verify-stream')
  @ApiOperation({ summary: 'AI verify template with SSE streaming (POST for fetch)' })
  @ApiBody({ type: AIVerifyDto })
  async aiVerifyTemplateStreamPost(
    @Param('id') id: string,
    @Body() dto: AIVerifyDto,
    @Res({ passthrough: false }) res: Response
  ): Promise<void> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      res.status(404).json({ error: 'Template file not found' });
      return;
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 发送进度事件的辅助函数
    const sendProgress = (step: string, progress: number, message: string) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', step, progress, message })}\n\n`);
    };

    const sendResult = (data: any) => {
      res.write(`data: ${JSON.stringify({ type: 'result', data })}\n\n`);
    };

    const sendError = (error: string) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    };

    try {
      // 步骤1: 准备验证环境
      sendProgress('prepare', 10, '准备验证环境...');

      // 解析测试数据
      let parsedTestData: any = {};
      if (dto.testData) {
        try {
          parsedTestData = JSON.parse(dto.testData);
        } catch {
          sendProgress('prepare', 15, '测试数据解析失败，使用空对象');
        }
      }

      sendProgress('prepare', 20, '获取模版配置...');

      // 获取模版配置
      const config = dto.templateConfig || meta.templateConfig || {};
      console.log('AI Verify config:', JSON.stringify(config, null, 2));
      console.log('dto.templateConfig exists:', !!dto.templateConfig);
      console.log('meta.templateConfig exists:', !!meta.templateConfig);

      // 步骤2: 调用AI生成验证报告
      sendProgress('ai_call', 30, '调用AI生成验证报告...');
      const aiResponse = await this.aiIdentifierService.verifyTemplate(
        templatePath,
        meta.format,
        dto.prompt || '生成一份示例报告用于验证模版配置',
        dto.testData || '',
        config
      );

      sendProgress('ai_call', 50, 'AI验证报告已生成');

      // 步骤3: 生成示例数据
      sendProgress('generate_data', 55, '根据模版配置生成示例数据...');
      const templateBuffer = fs.readFileSync(templatePath);

      // 应用模版配置标记
      const markedBuffer = await this.documentStructureService.applyConfigToDocx(templateBuffer, config);
      const templateInfo = await this.engine.parseTemplateBuffer(markedBuffer, meta.fileName);

      // 使用模版配置生成真实内容
      let sampleData = parsedTestData;
      if (!parsedTestData || Object.keys(parsedTestData).length === 0) {
        // 优先使用模版配置生成数据
        if (config && Object.keys(config).length > 0) {
          console.log('Generating sample data from config...');
          sampleData = this.engine.generateSampleDataFromConfig(config, config.tableLoops?.[0]?.dataRowCount || 5, true);
          console.log('Generated sampleData:', JSON.stringify(sampleData, null, 2));
        } else {
          // 否则使用模板变量生成
          console.log('Using fallback generateSampleData, config empty');
          sampleData = this.engine.generateSampleData(templateInfo, 5);
        }
      }

      sendProgress('generate_data', 65, '示例数据已生成');

      // 步骤4: 渲染文档
      sendProgress('render', 70, '渲染示例文档...');
      const outputBuffer = await this.engine.render(markedBuffer, sampleData, meta.fileName);
      sendProgress('render', 85, '文档渲染完成');

      // 步骤5: 保存注入后的模版（markedBuffer）供复用
      const markedTemplateId = uuidv4();
      const markedTemplatePath = path.join(this.templatesDir, `${markedTemplateId}.${meta.format}`);
      const markedMetaPath = path.join(this.templatesDir, `${markedTemplateId}.json`);

      fs.writeFileSync(markedTemplatePath, markedBuffer);
      const markedMeta = {
        id: markedTemplateId,
        originalTemplateId: id,
        fileName: `marked_${meta.fileName}`,
        format: meta.format,
        size: markedBuffer.length,
        variables: templateInfo.variables,
        loops: templateInfo.loops,
        createdAt: new Date().toISOString(),
        templateConfig: config,
        type: 'marked_template',  // 标记为注入后的模版
      };
      fs.writeFileSync(markedMetaPath, JSON.stringify(markedMeta));
      await this.syncTemplateMetaToDb(markedTemplateId, markedMeta, markedTemplatePath);

      // 步骤6: 先生成outputId，再保存验证结果
      const outputId = uuidv4();

      // 更新原始模版元数据，保存markedTemplateId和验证结果供Validate复用
      const originalMetaPath = path.join(this.templatesDir, `${id}.json`);
      if (fs.existsSync(originalMetaPath)) {
        const originalMeta = JSON.parse(fs.readFileSync(originalMetaPath, 'utf-8'));
        originalMeta.markedTemplateId = markedTemplateId;
        // 保存验证结果（报告、下载链接、示例数据等）
        originalMeta.verifyResult = {
          report: aiResponse.report,
          downloadUrl: `/studio/download/${outputId}`,
          previewUrl: `/studio/preview-file/${outputId}`,
          markedTemplateId: markedTemplateId,
          markedTemplateUrl: `/studio/download-template/${markedTemplateId}`,
          sampleData: sampleData,
          success: aiResponse.success,
          verifiedAt: new Date().toISOString()
        };
        fs.writeFileSync(originalMetaPath, JSON.stringify(originalMeta, null, 2));
        await this.syncTemplateMetaToDb(id, originalMeta);
      }

      sendProgress('save_marked', 88, '保存注入后的模版...');

      // 保存渲染结果文件
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      const outputMeta = {
        id: outputId,
        templateId: id,
        markedTemplateId: markedTemplateId,  // 关联注入后的模版
        fileName: `verify_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData,
      };
      fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
      await this.syncRenderOutputToDb(outputMeta, outputPath);

      sendProgress('save', 95, '保存渲染结果...');

      // 步骤7: 返回结果
      sendProgress('complete', 100, '验证完成');
      sendResult({
        report: aiResponse.report,
        downloadUrl: `/studio/download/${outputId}`,
        previewUrl: `/studio/preview-file/${outputId}`,
        markedTemplateId: markedTemplateId,  // 注入后的模版ID
        markedTemplateUrl: `/studio/download-template/${markedTemplateId}`,  // 下载注入后模版的URL
        sampleData: sampleData,
        success: aiResponse.success
      });

      res.end();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendError(message);
      res.end();
    }
  }

  /**
   * AI验证模版（SSE流式输出）- GET请求用于EventSource
   * 实时显示执行过程，生成示例数据并渲染文档
   */
  @Get('templates/:id/ai-verify-stream')
  @ApiOperation({ summary: 'AI verify template with SSE streaming (GET for EventSource)' })
  @ApiQuery({ name: 'testData', required: false, description: 'Test data JSON string' })
  @ApiQuery({ name: 'templateConfig', required: false, description: 'Template config JSON string' })
  @ApiQuery({ name: 'prompt', required: false, description: 'Verification prompt' })
  async aiVerifyTemplateStream(
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
    @Query('testData') testDataStr?: string,
    @Query('templateConfig') templateConfigStr?: string,
    @Query('prompt') prompt?: string
  ): Promise<void> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      res.status(404).json({ error: 'Template file not found' });
      return;
    }

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 发送进度事件的辅助函数
    const sendProgress = (step: string, progress: number, message: string) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', step, progress, message })}\n\n`);
    };

    const sendResult = (data: any) => {
      res.write(`data: ${JSON.stringify({ type: 'result', data })}\n\n`);
    };

    const sendError = (error: string) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    };

    try {
      // 步骤1: 准备验证环境
      sendProgress('prepare', 10, '准备验证环境...');

      // 解析测试数据
      let parsedTestData: any = {};
      if (testDataStr) {
        try {
          parsedTestData = JSON.parse(testDataStr);
        } catch {
          sendProgress('prepare', 15, '测试数据解析失败，使用空对象');
        }
      }

      sendProgress('prepare', 20, '获取模版配置...');

      // 解析模版配置
      let config: any = {};
      if (templateConfigStr) {
        try {
          config = JSON.parse(templateConfigStr);
        } catch {}
      }
      config = config || meta.templateConfig || {};

      // 步骤2: 调用AI生成验证报告
      sendProgress('ai_call', 30, '调用AI生成验证报告...');
      const aiResponse = await this.aiIdentifierService.verifyTemplate(
        templatePath,
        meta.format,
        prompt || '生成一份示例报告用于验证模版配置',
        testDataStr || '',
        config
      );

      sendProgress('ai_call', 50, 'AI验证报告已生成');

      // 步骤3: 生成示例数据
      sendProgress('generate_data', 55, '根据模版配置生成示例数据...');
      const templateBuffer = fs.readFileSync(templatePath);

      // 应用模版配置标记
      const markedBuffer = await this.documentStructureService.applyConfigToDocx(templateBuffer, config);
      const templateInfo = await this.engine.parseTemplateBuffer(markedBuffer, meta.fileName);

      // 使用模版配置生成真实内容
      let sampleData = parsedTestData;
      if (!parsedTestData || Object.keys(parsedTestData).length === 0) {
        // 优先使用模版配置生成数据
        if (config && Object.keys(config).length > 0) {
          console.log('Generating sample data from config...');
          sampleData = this.engine.generateSampleDataFromConfig(config, config.tableLoops?.[0]?.dataRowCount || 5, true);
          console.log('Generated sampleData:', JSON.stringify(sampleData, null, 2));
        } else {
          // 否则使用模板变量生成
          console.log('Using fallback generateSampleData, config empty');
          sampleData = this.engine.generateSampleData(templateInfo, 5);
        }
      }

      sendProgress('generate_data', 65, '示例数据已生成');

      // 步骤4: 渲染文档
      sendProgress('render', 70, '渲染示例文档...');
      const outputBuffer = await this.engine.render(markedBuffer, sampleData, meta.fileName);
      sendProgress('render', 85, '文档渲染完成');

      // 步骤5: 保存注入后的模版（markedBuffer）供复用
      const markedTemplateId = uuidv4();
      const markedTemplatePath = path.join(this.templatesDir, `${markedTemplateId}.${meta.format}`);
      const markedMetaPath = path.join(this.templatesDir, `${markedTemplateId}.json`);

      fs.writeFileSync(markedTemplatePath, markedBuffer);
      const markedMeta = {
        id: markedTemplateId,
        originalTemplateId: id,
        fileName: `marked_${meta.fileName}`,
        format: meta.format,
        size: markedBuffer.length,
        variables: templateInfo.variables,
        loops: templateInfo.loops,
        createdAt: new Date().toISOString(),
        templateConfig: config,
        type: 'marked_template',  // 标记为注入后的模版
      };
      fs.writeFileSync(markedMetaPath, JSON.stringify(markedMeta));
      await this.syncTemplateMetaToDb(markedTemplateId, markedMeta, markedTemplatePath);

      // 步骤6: 先生成outputId，再保存验证结果
      const outputId = uuidv4();

      // 更新原始模版元数据，保存markedTemplateId和验证结果供Validate复用
      const originalMetaPath = path.join(this.templatesDir, `${id}.json`);
      if (fs.existsSync(originalMetaPath)) {
        const originalMeta = JSON.parse(fs.readFileSync(originalMetaPath, 'utf-8'));
        originalMeta.markedTemplateId = markedTemplateId;
        // 保存验证结果（报告、下载链接、示例数据等）
        originalMeta.verifyResult = {
          report: aiResponse.report,
          downloadUrl: `/studio/download/${outputId}`,
          previewUrl: `/studio/preview-file/${outputId}`,
          markedTemplateId: markedTemplateId,
          markedTemplateUrl: `/studio/download-template/${markedTemplateId}`,
          sampleData: sampleData,
          success: aiResponse.success,
          verifiedAt: new Date().toISOString()
        };
        fs.writeFileSync(originalMetaPath, JSON.stringify(originalMeta, null, 2));
        await this.syncTemplateMetaToDb(id, originalMeta);
      }

      sendProgress('save_marked', 88, '保存注入后的模版...');

      // 保存渲染结果文件
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      const outputMeta = {
        id: outputId,
        templateId: id,
        markedTemplateId: markedTemplateId,  // 关联注入后的模版
        fileName: `verify_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData,
      };
      fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
      await this.syncRenderOutputToDb(outputMeta, outputPath);

      sendProgress('save', 95, '保存渲染结果...');

      // 步骤7: 返回结果
      sendProgress('complete', 100, '验证完成');
      sendResult({
        report: aiResponse.report,
        downloadUrl: `/studio/download/${outputId}`,
        previewUrl: `/studio/preview-file/${outputId}`,
        markedTemplateId: markedTemplateId,  // 注入后的模版ID
        markedTemplateUrl: `/studio/download-template/${markedTemplateId}`,  // 下载注入后模版的URL
        sampleData: sampleData,
        success: aiResponse.success
      });

      res.end();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendError(message);
      res.end();
    }
  }

  // 保持原有的同步验证端点
  @Post('templates/:id/ai-verify')
  @ApiOperation({ summary: 'AI verify template by generating sample report' })
  @ApiBody({ type: AIVerifyDto })
  async aiVerifyTemplate(
    @Param('id') id: string,
    @Body() dto: AIVerifyDto
  ): Promise<{ report: string; success: boolean; downloadUrl?: string; previewUrl?: string }> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      // 调用AI验证服务
      const result = await this.aiIdentifierService.verifyTemplate(
        templatePath,
        meta.format,
        dto.prompt || '生成一份示例报告用于验证模版配置',
        dto.testData,
        dto.templateConfig
      );

      // 生成示例数据并渲染文档
      const templateBuffer = fs.readFileSync(templatePath);
      const config = dto.templateConfig || meta.templateConfig || {};
      const markedBuffer = await this.documentStructureService.applyConfigToDocx(templateBuffer, config);
      const templateInfo = await this.engine.parseTemplateBuffer(markedBuffer, meta.fileName);

      let sampleData = {};
      if (dto.testData) {
        try {
          sampleData = JSON.parse(dto.testData);
        } catch {}
      }

      if (!sampleData || Object.keys(sampleData).length === 0) {
        sampleData = this.engine.generateSampleData(templateInfo, 5);
      }

      const outputBuffer = await this.engine.render(markedBuffer, sampleData, meta.fileName);

      const outputId = uuidv4();
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      fs.writeFileSync(outputMetaPath, JSON.stringify({
        id: outputId,
        templateId: id,
        fileName: `verify_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData
      }));

      return {
        ...result,
        downloadUrl: `/studio/download/${outputId}`,
        previewUrl: `/studio/preview-file/${outputId}`
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to verify template: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }


  /**
   * 生成AI使用指南Skill
   * 根据模板配置和变量映射，生成指导AI进行数据解析和参数化的skill文档
   */
  @Post('generate-skill')
  @ApiOperation({ summary: 'Generate AI skill guide for template parameterization' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Template ID (optional if using suggestions)' },
        suggestions: { type: 'array', description: 'Applied AI suggestions' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        templateType: { type: 'string', description: 'Template type: contract, invoice, report, etc.' },
        documentDescription: { type: 'string', description: 'Document usage description' },
      },
    },
  })
  async generateAISkill(
    @Body() body: {
      templateId?: string;
      suggestions?: any[];
      templateConfig?: any;
      templateType?: string;
      documentDescription?: string;
    },
  ): Promise<{
    success: boolean;
    skill?: any;
    skillId?: string;
    error?: string;
  }> {
    try {
      const templateMeta = body.templateId ? this.getTemplateMeta(body.templateId) : undefined;
      const suggestions = this.mergeSkillGuideSuggestions(
        templateMeta?.suggestions,
        body.suggestions,
      );
      const templateType = body.templateType || 'custom';
      const templateConfig = this.mergeSkillGuideTemplateConfig(
        templateMeta?.templateConfig,
        body.templateConfig,
      );
      this.logger.log(
        `[skill-debug] generate-skill templateId=${body.templateId || 'none'} incomingSuggestions=${Array.isArray(body.suggestions) ? body.suggestions.length : 0} cachedSuggestions=${Array.isArray(templateMeta?.suggestions) ? templateMeta!.suggestions!.length : 0} mergedSuggestions=${suggestions.length} templateType=${templateType}`,
      );
      this.logger.log(
        `[skill-debug] mergedSuggestionNames=${suggestions
          .map((suggestion) => String(suggestion?.suggestedName || suggestion?.details?.variableName || '').trim())
          .filter(Boolean)
          .join(', ') || 'none'}`,
      );

      // 调用服务层方法生成skill
      const skill = await this.aiIdentifierService.generateAISkillGuide(
        suggestions,
        templateConfig,
        templateType,
        body.documentDescription
      );
      this.logger.log(
        `[skill-debug] generatedSkillParameters=${Array.isArray(skill?.parameters) ? skill.parameters.length : 0}`,
      );

      // 保存skill文件
      const skillId = skill.id;
      const skillPath = path.join(this.templatesDir, `skill_${skillId}.json`);
      fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
      await this.syncSkillToDb(skill as Record<string, unknown>, body.templateId);

      // 如果有templateId，关联skill到模板
      if (body.templateId) {
        const metaPath = path.join(this.templatesDir, `${body.templateId}.json`);
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          meta.skillId = skillId;
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
          await this.syncTemplateMetaToDb(body.templateId, meta);
        }
      }

      return {
        success: true,
        skill,
        skillId,
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
   * 使用AI Skill进行参数化预览
   * 根据skill指导，模拟数据并生成预览文档
   */
  @Post('preview-with-skill')
  @ApiOperation({ summary: 'Preview template using AI skill guide' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Template ID' },
        skillId: { type: 'string', description: 'AI Skill ID' },
        skill: { type: 'object', description: 'AI Skill object (if no skillId)' },
        simulatedData: { type: 'object', description: 'Simulated data (optional, will generate if not provided)' },
      },
    },
  })
  async previewWithSkill(
    @Body() body: {
      templateId?: string;
      skillId?: string;
      skill?: any;
      simulatedData?: any;
    },
  ): Promise<{
    success: boolean;
    previewUrl?: string;
    downloadUrl?: string;
    generatedData?: any;
    skillUsed?: any;
    error?: string;
    debugLogs?: string[];
  }> {
    const debugLogs: string[] = [];
    const addLog = (msg: string) => {
      console.log(msg);
      debugLogs.push(msg);
    };

    try {
      addLog('[步骤1] 开始预览验证流程');
      addLog(`[步骤1] 请求参数: templateId=${body.templateId}, skillId=${body.skillId}, hasSkill=${!!body.skill}`);

      // 获取skill
      let skill = body.skill;
      if (body.skillId && !skill) {
        skill = await this.getSkillWithDbFallback(body.skillId);
        if (skill) {
          addLog(`[步骤2] 从存储加载skill: ${body.skillId}`);
        }
      }

      if (!skill) {
        addLog('[错误] Skill not found');
        return { success: false, error: 'Skill not found', debugLogs };
      }

      addLog(`[步骤2] Skill信息: id=${skill.id}, parameters数量=${skill.parameters?.length || 0}`);
      if (skill.parameters) {
        addLog(`[步骤2] Skill参数列表: ${JSON.stringify(skill.parameters.map((p: any) => ({name: p.name, example: p.example})))}`);
      }

      // 生成模拟数据（如果没有提供）
      let simulatedData = body.simulatedData;
      if (!simulatedData) {
        addLog('[步骤3] 开始生成模拟数据...');
        const seedData = this.buildHydratedSkillSampleData(skill);
        if (seedData) {
          simulatedData = seedData;
          addLog('[步骤3] 使用 skill.dataExampleJson 作为模拟数据');
        } else {
          simulatedData = this.generateSimulatedData(skill);
          addLog('[步骤3] skill.dataExampleJson 不可用，回退到 generateSimulatedData');
        }
        addLog(`[步骤3] 生成的数据结构: ${JSON.stringify(simulatedData, null, 2)}`);
      } else {
        addLog(`[步骤3] 使用提供的模拟数据: ${JSON.stringify(simulatedData)}`);
      }

      simulatedData = this.normalizeRenderData(simulatedData || {});
      addLog(`[步骤3] 归一化后的数据结构: ${JSON.stringify(simulatedData, null, 2)}`);

      // 获取模板
      let templateBuffer: Buffer | undefined;
      let templateId = body.templateId || skill.templateId;
      let format = 'docx';

      addLog(`[步骤4] 查找模板: templateId=${templateId}`);

      if (templateId) {
        const meta = this.getTemplateMeta(templateId);
        format = meta.format || 'docx';
        const templatePath = path.join(this.templatesDir, `${templateId}.${format}`);
        addLog(`[步骤4] 模板路径: ${templatePath}`);
        if (fs.existsSync(templatePath)) {
          templateBuffer = fs.readFileSync(templatePath);
          addLog(`[步骤4] 模板加载成功, 大小: ${templateBuffer.length} bytes`);
        } else {
          addLog(`[错误] 模板文件不存在: ${templatePath}`);
        }
      }

      if (!templateBuffer) {
        addLog('[错误] Template not found');
        return { success: false, error: 'Template not found', debugLogs };
      }

      // 渲染预览
      addLog('[步骤5] 开始渲染预览...');
      const outputId = uuidv4();
      const outputBuffer = await this.engine.render(templateBuffer, simulatedData, `preview_${outputId}.${format}`);
      addLog(`[步骤5] 渲染完成, 输出大小: ${outputBuffer.length} bytes`);

      // 保存输出
      const outputPath = path.join(this.outputsDir, `${outputId}.${format}`);
      fs.writeFileSync(outputPath, Buffer.from(outputBuffer));
      addLog(`[步骤6] 输出保存到: ${outputPath}`);

      // 保存输出元数据
      const outputMeta = {
        id: outputId,
        templateId,
        skillId: skill.id,
        format,
        fileName: `preview_${outputId}.${format}`,
        createdAt: new Date().toISOString(),
        simulatedData,
        debugLogs,
      };
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);
      fs.writeFileSync(outputMetaPath, JSON.stringify(outputMeta));
      await this.syncRenderOutputToDb(outputMeta, outputPath);

      addLog('[完成] 预览验证成功!');

      return {
        success: true,
        previewUrl: `/studio/preview-file/${outputId}`,
        downloadUrl: `/studio/download/${outputId}`,
        generatedData: simulatedData,
        skillUsed: skill,
        debugLogs,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog(`[异常] ${message}`);
      if (error instanceof Error && error.stack) {
        addLog(`[异常堆栈] ${error.stack}`);
      }
      return {
        success: false,
        error: message,
        debugLogs,
      };
    }
  }

  /**
   * 已下线的旧参数生成入口
   * 文档参数识别已统一收敛到 planner -> execution -> waiting_input 主链路
   */
  @Post('generate-parameters')
  @ApiOperation({ summary: 'Deprecated legacy generate-parameters endpoint (disabled)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: '用户描述/元数据内容' },
        skill: { type: 'object', description: 'AI Skill guide' },
        skillId: { type: 'string', description: 'AI Skill ID (if skill not provided)' },
      },
    },
  })
  async generateParameters(
    @Body() _body: {
      description: string;
      skill?: any;
      skillId?: string;
    },
  ): Promise<never> {
    throw new HttpException(
      {
        success: false,
        error:
          'generate-parameters 已下线。请改用统一文档主链路：skill match -> planner -> execution -> waiting_input -> render。',
      },
      HttpStatus.GONE,
    );
  }


  /**
   * 下载AI Skill文件
   */
  @Get('download-skill/:id')
  @ApiOperation({ summary: 'Download AI skill file' })
  @Header('Content-Type', 'application/json')
  async downloadSkill(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const skill = await this.getSkillWithDbFallback(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }

  /**
   * 获取AI Skill
   */
  @Get('skill/:id')
  @ApiOperation({ summary: 'Get AI skill by ID' })
  async getSkill(@Param('id') id: string): Promise<any> {
    const skill = await this.getSkillWithDbFallback(id);
    if (!skill) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return skill;
  }
}
