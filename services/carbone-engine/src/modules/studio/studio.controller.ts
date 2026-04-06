/**
 * Carbone Engine - Studio Controller
 * 可视化编辑器API接口
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus,
  StreamableFile,
  Header,
  Res,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CarboneEngine } from '../../lib/engine';
import { PreviewService } from './preview.service';
import { AIIdentifierService, AIIdentifyResponse } from './ai-identifier.service';
import { DocumentStructureService, DocumentStructure } from './document-structure.service';

// DTOs with proper initialization
export class UploadTemplateDto {
  fileName!: string;
}

export class ParseTemplateDto {
  templateId!: string;
}

export class RenderDto {
  templateId!: string;
  data!: Record<string, any>;
  outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
}

export class PreviewDto {
  templateId!: string;
  maxRows?: number;
}

export class AIIdentifyDto {
  templateId!: string;
  context?: string;
  manualMarkings?: Record<string, string>;  // 用户手动标记：{ 元素索引: 'param'|'loop'|'static' }
  markingSummary?: string;  // 标记摘要文本
}

export class SaveMarkingsDto {
  templateId!: string;
  markings!: Array<{
    index?: number;      // 元素索引
    type?: string;       // 标记类型：param|loop|static
    path?: string;       // 变量路径（可选）
    text?: string;       // 文本内容（可选）
    formatters?: string[];
  }>;
  ignoredElements?: number[];  // 被忽略的元素索引列表
  elementGroups?: Record<string, number[]>;  // 元素分组
  ignoredGroups?: string[];  // 被忽略的分组ID列表
}

export class SaveTemplateConfigDto {
  templateId!: string;
  templateConfig!: any;  // TemplateConfig from AI analysis
}

export class ValidateDto {
  templateId!: string;
  data!: Record<string, any>;
}

export class AIVerifyDto {
  templateId!: string;
  prompt?: string;
  testData?: string;
  templateConfig?: any;
}

export interface TemplateResponse {
  id: string;
  fileName: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
  markings?: Array<{ path: string; text: string; formatters?: string[] }>;
  ignoredElements?: number[];  // 被忽略的元素索引列表
  elementGroups?: Record<string, number[]>;  // 元素分组
  ignoredGroups?: string[];  // 被忽略的分组ID列表
  savedAt?: string;
  templateConfig?: any;  // AI-generated template configuration
  configSavedAt?: string;
}

export interface RenderResponse {
  downloadUrl: string;
  fileName: string;
  format: string;
}

export interface ValidateResponse {
  valid: boolean;
  missing: string[];
}

// Extended TemplateInfo for validation
interface TemplateInfoForValidation {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

@ApiTags('studio')
@Controller('studio')
export class StudioController {
  private engine: CarboneEngine;
  private templatesDir: string;
  private outputsDir: string;

  constructor(
    private readonly previewService: PreviewService,
    private readonly aiIdentifierService: AIIdentifierService,
    private readonly documentStructureService: DocumentStructureService
  ) {
    this.engine = new CarboneEngine();
    this.templatesDir = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');
    this.outputsDir = process.env.OUTPUTS_DIR || path.join(process.cwd(), 'outputs');

    // 创建目录
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputsDir)) {
      fs.mkdirSync(this.outputsDir, { recursive: true });
    }
  }

  /**
   * 上传模板文件
   */
  @Post('upload')
  @ApiOperation({ summary: 'Upload template file (docx/xlsx/pptx/html)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemplate(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ): Promise<TemplateResponse> {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // 修复中文文件名编码问题 (multer默认使用latin1编码)
    let fileName = file.originalname;
    try {
      fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch {
      // 如果转换失败，使用原始文件名
    }

    // 验证文件格式
    const validFormats = ['.docx', '.xlsx', '.pptx', '.html', '.htm'];
    const ext = path.extname(fileName).toLowerCase();
    if (!validFormats.includes(ext)) {
      throw new HttpException(
        `Invalid file format. Supported: ${validFormats.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      // 解析模板
      const info = await this.engine.parseTemplateBuffer(file.buffer, fileName);

      // 保存模板文件
      const templateId = uuidv4();
      const templatePath = path.join(this.templatesDir, `${templateId}${ext}`);
      fs.writeFileSync(templatePath, file.buffer);

      // 保存元数据
      const metaPath = path.join(this.templatesDir, `${templateId}.json`);
      fs.writeFileSync(metaPath, JSON.stringify({
        id: templateId,
        fileName: fileName,
        format: info.format,
        size: info.size,
        variables: info.variables,
        loops: info.loops,
        uploadedAt: new Date().toISOString()
      }));

      return {
        id: templateId,
        fileName: fileName,
        format: info.format,
        size: info.size,
        variables: info.variables,
        loops: info.loops
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to parse template: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * 获取模板信息
   */
  @Get('templates/:id')
  @ApiOperation({ summary: 'Get template information' })
  async getTemplate(@Param('id') id: string): Promise<TemplateResponse> {
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    if (!fs.existsSync(metaPath)) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    return meta;
  }

  /**
   * 获取模板变量列表
   */
  @Get('templates/:id/variables')
  @ApiOperation({ summary: 'Get template variables' })
  async getVariables(@Param('id') id: string): Promise<{ variables: string[] }> {
    const meta = this.getTemplateMeta(id);
    return { variables: meta.variables };
  }

  /**
   * 获取模板循环配置
   */
  @Get('templates/:id/loops')
  @ApiOperation({ summary: 'Get template loop configurations' })
  async getLoops(@Param('id') id: string): Promise<{ loops: Array<{ arrayPath: string }> }> {
    const meta = this.getTemplateMeta(id);
    return { loops: meta.loops };
  }

  /**
   * 渲染模板
   */
  @Post('render')
  @ApiOperation({ summary: 'Render template with data' })
  @ApiBody({ type: RenderDto })
  async renderTemplate(@Body() dto: RenderDto): Promise<RenderResponse> {
    const meta = this.getTemplateMeta(dto.templateId);
    const templatePath = path.join(this.templatesDir, `${dto.templateId}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      // 验证数据
      const validation = this.engine.validateData(meta as TemplateInfoForValidation, dto.data);
      if (!validation.valid) {
        console.warn(`Missing data for variables: ${validation.missing.join(', ')}`);
      }

      // 渲染模板
      const templateBuffer = fs.readFileSync(templatePath);
      const config = meta.templateConfig || {};
      const markedBuffer = await this.documentStructureService.applyConfigToDocx(templateBuffer, config);
      const outputBuffer = await this.engine.render(markedBuffer, dto.data, meta.fileName);

      // 保存输出文件
      const outputId = uuidv4();
      const outputFormat = dto.outputFormat || meta.format;
      const outputFileName = this.generateOutputFileName(meta.fileName, outputFormat);
      const outputPath = path.join(this.outputsDir, `${outputId}.${outputFormat}`);
      fs.writeFileSync(outputPath, outputBuffer);

      // 保存输出元数据
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);
      fs.writeFileSync(outputMetaPath, JSON.stringify({
        id: outputId,
        templateId: dto.templateId,
        fileName: outputFileName,
        format: outputFormat,
        size: outputBuffer.length,
        renderedAt: new Date().toISOString()
      }));

      return {
        downloadUrl: `/studio/download/${outputId}`,
        fileName: outputFileName,
        format: outputFormat
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to render template: ${message}`,
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
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ preview: StreamableFile; sampleData: any }> {
    const meta = this.getTemplateMeta(dto.templateId);
    const templatePath = path.join(this.templatesDir, `${dto.templateId}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      const templateBuffer = fs.readFileSync(templatePath);
      const result = await this.engine.preview(templateBuffer, meta.fileName, {
        maxRows: dto.maxRows || 3
      });

      res.setHeader('Content-Type', this.getContentType(meta.format));
      res.setHeader('Content-Disposition', `inline; filename="preview_${meta.fileName}"`);

      return {
        preview: new StreamableFile(result.buffer),
        sampleData: result.sampleData
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
   * 验证数据完整性
   */
  @Post('validate')
  @ApiOperation({ summary: 'Validate data against template' })
  @ApiBody({ type: ValidateDto })
  async validateData(@Body() dto: ValidateDto): Promise<ValidateResponse> {
    const meta = this.getTemplateMeta(dto.templateId);
    return this.engine.validateData(meta as TemplateInfoForValidation, dto.data);
  }

  /**
   * 下载渲染后的文档
   */
  @Get('download/:id')
  @ApiOperation({ summary: 'Download rendered document' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadDocument(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
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
   * 获取可用格式化器列表
   */
  @Get('formatters')
  @ApiOperation({ summary: 'Get available formatters' })
  async getFormatters(): Promise<{ formatters: string[] }> {
    return { formatters: this.engine.getAvailableFormatters() };
  }

  /**
   * 列出所有模板
   */
  @Get('templates')
  @ApiOperation({ summary: 'List all templates' })
  async listTemplates(): Promise<{ templates: TemplateResponse[] }> {
    const templates: TemplateResponse[] = [];

    const files = fs.readdirSync(this.templatesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const meta = JSON.parse(fs.readFileSync(path.join(this.templatesDir, file), 'utf-8'));
        templates.push(meta);
      }
    }

    return { templates };
  }

  /**
   * 删除模板
   */
  @Post('templates/:id/delete')
  @ApiOperation({ summary: 'Delete template' })
  async deleteTemplate(@Param('id') id: string): Promise<{ success: boolean }> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    return { success: true };
  }

  /**
   * 获取模板源文件预览
   */
  @Get('templates/:id/preview-source')
  @ApiOperation({ summary: 'Get template source preview' })
  async getTemplateSourcePreview(@Param('id') id: string): Promise<{
    content: string;
    format: string;
    type: 'xml' | 'html';
  }> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    try {
      const JSZip = require('jszip');
      const buffer = fs.readFileSync(templatePath);
      const zip = await JSZip.loadAsync(buffer);

      // 根据格式获取主要内容
      let mainXmlPath = '';
      switch (meta.format) {
        case 'docx':
          mainXmlPath = 'word/document.xml';
          break;
        case 'xlsx':
          mainXmlPath = 'xl/worksheets/sheet1.xml';
          break;
        case 'pptx':
          mainXmlPath = 'ppt/slides/slide1.xml';
          break;
        case 'html':
          // HTML直接读取文件内容
          const htmlContent = buffer.toString('utf-8');
          return {
            content: htmlContent,
            format: meta.format,
            type: 'html'
          };
        default:
          throw new HttpException('Unsupported format', HttpStatus.BAD_REQUEST);
      }

      const file = zip.file(mainXmlPath);
      if (!file) {
        throw new HttpException('Main content not found in template', HttpStatus.NOT_FOUND);
      }

      const content = await file.async('text');

      return {
        content,
        format: meta.format,
        type: 'xml'
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to read template: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
        format: result.format
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
   * 保存模板标记配置
   */
  @Post('templates/:id/markings')
  @ApiOperation({ summary: 'Save template markings' })
  @ApiBody({ type: SaveMarkingsDto })
  async saveMarkings(
    @Param('id') id: string,
    @Body() dto: SaveMarkingsDto
  ): Promise<{ success: boolean; savedAt: string }> {
    const meta = this.getTemplateMeta(id);
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    // 更新元数据中的标记信息
    const updatedMeta = {
      ...meta,
      markings: dto.markings,
      ignoredElements: dto.ignoredElements || [],
      elementGroups: dto.elementGroups || {},
      ignoredGroups: dto.ignoredGroups || [],
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));

    return {
      success: true,
      savedAt: updatedMeta.savedAt
    };
  }

  /**
   * 获取模板标记配置
   */
  @Get('templates/:id/markings')
  @ApiOperation({ summary: 'Get template markings' })
  async getMarkings(@Param('id') id: string): Promise<{
    markings: Array<{ path: string; text: string; formatters?: string[] }>;
    ignoredElements?: number[];
    elementGroups?: Record<string, number[]>;
    ignoredGroups?: string[];
    savedAt?: string;
  }> {
    const meta = this.getTemplateMeta(id);
    return {
      markings: meta.markings || [],
      ignoredElements: meta.ignoredElements || [],
      elementGroups: meta.elementGroups || {},
      ignoredGroups: meta.ignoredGroups || [],
      savedAt: meta.savedAt
    };
  }

  /**
   * 保存AI生成的模板配置
   */
  @Post('templates/:id/config')
  @ApiOperation({ summary: 'Save AI-generated template configuration' })
  @ApiBody({ type: SaveTemplateConfigDto })
  async saveTemplateConfig(
    @Param('id') id: string,
    @Body() dto: SaveTemplateConfigDto
  ): Promise<{ success: boolean; savedAt: string }> {
    const meta = this.getTemplateMeta(id);
    const metaPath = path.join(this.templatesDir, `${id}.json`);

    // 更新元数据中的模板配置信息
    const updatedMeta = {
      ...meta,
      templateConfig: dto.templateConfig,
      configSavedAt: new Date().toISOString()
    };

    fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));

    return {
      success: true,
      savedAt: updatedMeta.configSavedAt
    };
  }

  /**
   * 获取AI生成的模板配置
   */
  @Get('templates/:id/config')
  @ApiOperation({ summary: 'Get AI-generated template configuration' })
  async getTemplateConfig(@Param('id') id: string): Promise<{
    templateConfig?: any;
    configSavedAt?: string;
  }> {
    const meta = this.getTemplateMeta(id);
    return {
      templateConfig: meta.templateConfig || null,
      configSavedAt: meta.configSavedAt
    };
  }

  /**
   * 获取文档结构化元素
   */
  @Get('templates/:id/structure')
  @ApiOperation({ summary: 'Get document structure elements for element-level selection' })
  async getDocumentStructure(@Param('id') id: string): Promise<DocumentStructure> {
    const meta = this.getTemplateMeta(id);
    const templatePath = path.join(this.templatesDir, `${id}.${meta.format}`);

    if (!fs.existsSync(templatePath)) {
      throw new HttpException('Template file not found', HttpStatus.NOT_FOUND);
    }

    if (meta.format !== 'docx') {
      throw new HttpException('Structure parsing is only supported for DOCX files', HttpStatus.BAD_REQUEST);
    }

    try {
      const buffer = fs.readFileSync(templatePath);
      return await this.documentStructureService.parseDocx(buffer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(
        `Failed to parse document structure: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
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
          sampleData = this.engine.generateSampleDataFromConfig(config, config.tableLoops?.[0]?.dataRowCount || 5);
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

      // 步骤5: 保存渲染结果
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

      sendProgress('save', 95, '保存渲染结果...');

      // 步骤6: 返回结果
      sendProgress('complete', 100, '验证完成');
      sendResult({
        report: aiResponse.report,
        downloadUrl: `/studio/download/${outputId}`,
        previewUrl: `/studio/preview-file/${outputId}`,
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
          sampleData = this.engine.generateSampleDataFromConfig(config, config.tableLoops?.[0]?.dataRowCount || 5);
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

      // 步骤5: 保存渲染结果
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

      sendProgress('save', 95, '保存渲染结果...');

      // 步骤6: 返回结果
      sendProgress('complete', 100, '验证完成');
      sendResult({
        report: aiResponse.report,
        downloadUrl: `/studio/download/${outputId}`,
        previewUrl: `/studio/preview-file/${outputId}`,
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

  // Helper methods
  private getTemplateMeta(id: string): TemplateResponse {
    const metaPath = path.join(this.templatesDir, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
      throw new HttpException('Template not found', HttpStatus.NOT_FOUND);
    }
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  }

  private generateOutputFileName(templateName: string, format: string): string {
    const baseName = templateName.replace(/\.[^/.]+$/, '');
    return `${baseName}_${Date.now()}.${format}`;
  }

  private getContentType(format: string): string {
    switch (format) {
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      case 'pdf':
        return 'application/pdf';
      case 'html':
        return 'text/html';
      default:
        return 'application/octet-stream';
    }
  }
}