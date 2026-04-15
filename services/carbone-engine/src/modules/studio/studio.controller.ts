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

/**
 * 直接AI识别DTO - 用于Office插件直接提交文档内容
 * 无需先上传模板，直接对文档内容进行AI识别
 */
export class DirectAIIdentifyDto {
  documentContent!: string;           // 文档文本内容（从Office获取）
  documentType!: 'docx' | 'xlsx' | 'pptx' | 'text';  // 文档类型
  templateType?: string;              // 模板类型：report, invoice, contract, certificate 等
  context?: string;                   // 上下文信息（如文档用途描述）
  customRules?: Array<{               // 自定义识别规则
    pattern: string;
    targetPath: string;
    description?: string;
  }>;
  underlineInfo?: Array<{             // 下划线信息（从Word JS API获取）
    text: string;                     // 带下划线的文本
    underlineType: string;            // 下划线类型
    paragraphIndex?: number;          // 段落索引（用于精确定位）
    paragraphText: string;            // 所在段落完整文本
    position: { start: number; end: number };  // 在段落中的位置
  }>;
  paragraphFormats?: Array<{          // 段落格式信息
    text: string;
    index: number;
    format: {
      fontSize?: number;
      isBold?: boolean;
      alignment?: string;
      isTitle?: boolean;
    };
  }>;
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
  markedTemplateId?: string;  // 编辑后的模版ID
  verifyResult?: {  // AI验证结果
    report?: string;
    downloadUrl?: string;
    previewUrl?: string;
    markedTemplateId?: string;
    markedTemplateUrl?: string;
    sampleData?: any;
    success?: boolean;
    verifiedAt?: string;
  };
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
    return this.getTemplateMeta(id);
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
  async validateTemplateContent(
    @Body() body: { template: string },
  ): Promise<{
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
    @Body() body: {
      documentContent: string;
      templateConfig?: any;
      format?: string;
    },
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
      fs.writeFileSync(metaPath, JSON.stringify({
        id: tempId,
        format,
        fileName: `preview_${tempId}.${format}`,
        config,
        isTemp: true,
        createdAt: new Date().toISOString(),
      }));

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
    const meta = this.getTemplateMeta(dto.templateId);

    // 检查是否有保存的验证结果和示例数据
    const verifyResult = (meta as any).verifyResult;
    const savedSampleData = verifyResult?.sampleData;

    // 检查是否有编辑后的模版（markedTemplate）
    let templatePath = path.join(this.templatesDir, `${dto.templateId}.${meta.format}`);
    let templateBuffer: Buffer = fs.readFileSync(templatePath);
    let config = meta.templateConfig || {};
    let markedTemplateId = (meta as any).markedTemplateId || (dto.data as any)?.markedTemplateId;

    if (markedTemplateId) {
      const markedMetaPath = path.join(this.templatesDir, `${markedTemplateId}.json`);
      if (fs.existsSync(markedMetaPath)) {
        const markedMeta = JSON.parse(fs.readFileSync(markedMetaPath, 'utf-8'));
        const markedTemplatePath = path.join(this.templatesDir, `${markedTemplateId}.${meta.format}`);
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
        templateBuffer = Buffer.from(await this.documentStructureService.applyConfigToDocx(templateBuffer, normalizedConfig));
        // 更新config引用，以便后续生成数据使用规范化后的路径
        config = normalizedConfig;
      }
    }

    // 解析模版获取变量
    const templateInfo = await this.engine.parseTemplateBuffer(templateBuffer, meta.fileName);

    // 使用保存的示例数据，如果没有则生成新的
    let sampleData = savedSampleData;
    if (!sampleData) {
      // 使用模版配置生成模拟数据
      if (config && Object.keys(config).length > 0) {
        sampleData = this.engine.generateSampleDataFromConfig(config, config.tableLoops?.[0]?.dataRowCount || 8, true);
      } else {
        sampleData = this.engine.generateSampleData(templateInfo, 8);
      }
    }

    // 渲染文档
    try {
      const outputBuffer = await this.engine.render(templateBuffer, sampleData, meta.fileName);

      // 保存渲染结果
      const outputId = uuidv4();
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      fs.writeFileSync(outputMetaPath, JSON.stringify({
        id: outputId,
        templateId: dto.templateId,
        markedTemplateId: markedTemplateId,
        fileName: `validate_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData
      }));

      return {
        valid: true,
        missing: [],
        downloadUrl: `/studio/download/${outputId}`,
        fileName: `validate_${meta.fileName}`,
        sampleData: sampleData,
        markedTemplateId: markedTemplateId
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        valid: false,
        missing: [],
        sampleData: sampleData
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
    @Body() body: {
      documentContent: string;
      suggestions: any[];
      templateConfig?: any;
      format?: string;
    },
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

      console.log('generateTemplate received documentContent length:', body.documentContent.length);
      console.log('documentContent prefix:', body.documentContent.substring(0, 20));

      if (body.documentContent.startsWith('base64:')) {
        const base64Data = body.documentContent.substring(7);
        console.log('base64 data length:', base64Data.length);
        templateBuffer = Buffer.from(base64Data, 'base64');
        console.log('decoded buffer length:', templateBuffer.length);
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
        console.log('file header:', header);
        if (!header.startsWith('PK')) {
          console.warn('Not a valid docx file (not PK header), but will save metadata');
          isValidDocx = false;
        }
      }

      // 只有有效文件才保存物理文件，否则只保存元数据
      if (isValidDocx && templateBuffer.length > 0) {
        fs.writeFileSync(templateFilePath, templateBuffer);
      } else {
        console.log('Saving metadata only (no valid docx file)');
        // 保存文本内容作为参考
        const textPath = path.join(this.templatesDir, `${templateId}_content.txt`);
        fs.writeFileSync(textPath, templateBuffer.toString('utf-8'));
      }

      // 保存模板配置
      fs.writeFileSync(templateMetaPath, JSON.stringify({
        id: templateId,
        format,
        fileName: `template_${templateId}.${format}`,
        config: templateConfig,
        suggestions: body.suggestions,
        hasValidFile: isValidDocx,
        createdAt: new Date().toISOString(),
      }));

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
   * 下载注入后的模版文件
   */
  @Get('download-template/:id')
  @ApiOperation({ summary: 'Download marked template file' })
  @Header('Content-Type', 'application/octet-stream')
  async downloadTemplate(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
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
      // 直接对文档内容进行AI分析
      const result = await this.aiIdentifierService.identifyFromContent(
        dto.documentContent,
        dto.documentType,
        dto.templateType || 'report',
        dto.context,
        dto.customRules
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
        dto.paragraphFormats  // 段落格式信息
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
      fs.writeFileSync(markedMetaPath, JSON.stringify({
        id: markedTemplateId,
        originalTemplateId: id,
        fileName: `marked_${meta.fileName}`,
        format: meta.format,
        size: markedBuffer.length,
        variables: templateInfo.variables,
        loops: templateInfo.loops,
        createdAt: new Date().toISOString(),
        templateConfig: config,
        type: 'marked_template'  // 标记为注入后的模版
      }));

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
      }

      sendProgress('save_marked', 88, '保存注入后的模版...');

      // 保存渲染结果文件
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      fs.writeFileSync(outputMetaPath, JSON.stringify({
        id: outputId,
        templateId: id,
        markedTemplateId: markedTemplateId,  // 关联注入后的模版
        fileName: `verify_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData
      }));

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
      fs.writeFileSync(markedMetaPath, JSON.stringify({
        id: markedTemplateId,
        originalTemplateId: id,
        fileName: `marked_${meta.fileName}`,
        format: meta.format,
        size: markedBuffer.length,
        variables: templateInfo.variables,
        loops: templateInfo.loops,
        createdAt: new Date().toISOString(),
        templateConfig: config,
        type: 'marked_template'  // 标记为注入后的模版
      }));

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
      }

      sendProgress('save_marked', 88, '保存注入后的模版...');

      // 保存渲染结果文件
      const outputPath = path.join(this.outputsDir, `${outputId}.${meta.format}`);
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);

      fs.writeFileSync(outputPath, outputBuffer);
      fs.writeFileSync(outputMetaPath, JSON.stringify({
        id: outputId,
        templateId: id,
        markedTemplateId: markedTemplateId,  // 关联注入后的模版
        fileName: `verify_${meta.fileName}`,
        format: meta.format,
        createdAt: new Date().toISOString(),
        sampleData: sampleData
      }));

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
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

    // 规范化模版配置中的变量路径（使用参数对照表）
    if (meta.templateConfig) {
      meta.templateConfig = this.aiIdentifierService.normalizeTemplateConfig(meta.templateConfig);
    }

    // 如果 config.variables 是对象而非数组，从 suggestions 中提取变量列表
    if (!meta.variables || !Array.isArray(meta.variables)) {
      if (meta.suggestions && Array.isArray(meta.suggestions)) {
        meta.variables = meta.suggestions
          .filter((s: any) => s.applied && s.suggestedName)
          .map((s: any) => s.suggestedName);
      } else {
        meta.variables = [];
      }
    }

    return meta;
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
      const suggestions = body.suggestions || [];
      const templateType = body.templateType || 'custom';
      const templateConfig = body.templateConfig || {};

      // 调用服务层方法生成skill
      const skill = await this.aiIdentifierService.generateAISkillGuide(
        suggestions,
        templateConfig,
        templateType,
        body.documentDescription
      );

      // 保存skill文件
      const skillId = skill.id;
      const skillPath = path.join(this.templatesDir, `skill_${skillId}.json`);
      fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));

      // 如果有templateId，关联skill到模板
      if (body.templateId) {
        const metaPath = path.join(this.templatesDir, `${body.templateId}.json`);
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          meta.skillId = skillId;
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
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
        const skillPath = path.join(this.templatesDir, `skill_${body.skillId}.json`);
        if (fs.existsSync(skillPath)) {
          skill = JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
          addLog(`[步骤2] 从文件加载skill: ${skillPath}`);
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
        simulatedData = this.generateSimulatedData(skill);
        addLog(`[步骤3] 生成的数据结构: ${JSON.stringify(simulatedData, null, 2)}`);
      } else {
        addLog(`[步骤3] 使用提供的模拟数据: ${JSON.stringify(simulatedData)}`);
      }

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
      const outputMetaPath = path.join(this.outputsDir, `${outputId}.json`);
      fs.writeFileSync(outputMetaPath, JSON.stringify({
        id: outputId,
        templateId,
        skillId: skill.id,
        format,
        fileName: `preview_${outputId}.${format}`,
        createdAt: new Date().toISOString(),
        simulatedData,
        debugLogs,
      }));

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
   * 保存完整模板（包含模板文件和AI Skill）
   */
  @Post('save-template-full')
  @ApiOperation({ summary: 'Save template with AI skill' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'Existing template ID (optional, reuse from preview)' },
        documentContent: { type: 'string', description: 'Document content (base64)' },
        suggestions: { type: 'array', description: 'Applied suggestions' },
        templateConfig: { type: 'object', description: 'Template configuration' },
        skill: { type: 'object', description: 'AI Skill guide' },
        skillId: { type: 'string', description: 'Existing skill ID to associate' },
        format: { type: 'string', description: 'Document format' },
        templateName: { type: 'string', description: 'Template name' },
      },
    },
  })
  async saveTemplateFull(
    @Body() body: {
      templateId?: string;  // 支持复用已有的模版ID
      documentContent?: string;  // 如果使用已有模版ID，可以不传
      suggestions?: any[];
      templateConfig?: any;
      skill?: any;
      skillId?: string;
      format?: string;
      templateName?: string;
    },
  ): Promise<{
    success: boolean;
    templateId?: string;
    skillId?: string;
    downloadUrl?: string;
    skillDownloadUrl?: string;
    error?: string;
  }> {
    try {
      // 支持复用已有的模版ID（从预览生成的模版）
      let templateId = body.templateId;
      const format = body.format || 'docx';
      let isNewTemplate = false;

      // 如果传入了模版ID，检查是否存在
      if (templateId) {
        const existingMetaPath = path.join(this.templatesDir, `${templateId}.json`);
        if (fs.existsSync(existingMetaPath)) {
          // 模版已存在，复用
          console.log(`复用已有模版: ${templateId}`);
        } else {
          // 模版不存在，需要生成新的
          templateId = uuidv4();
          isNewTemplate = true;
        }
      } else {
        // 没有传入模版ID，生成新的
        templateId = uuidv4();
        isNewTemplate = true;
      }

      const templateName = body.templateName || `template_${templateId}`;

      // 如果是新模版，保存模板文件
      if (isNewTemplate && body.documentContent) {
        const templatePath = path.join(this.templatesDir, `${templateId}.${format}`);
        let templateBuffer: Buffer;
        if (body.documentContent.startsWith('base64:')) {
          templateBuffer = Buffer.from(body.documentContent.substring(7), 'base64');
        } else {
          try {
            templateBuffer = Buffer.from(body.documentContent, 'base64');
          } catch {
            templateBuffer = Buffer.from(body.documentContent, 'utf-8');
          }
        }
        fs.writeFileSync(templatePath, templateBuffer);
      }

      // 处理skill
      let skillId = body.skillId;
      if (body.skill && !skillId) {
        skillId = uuidv4();
        const skill = {
          ...body.skill,
          id: skillId,
          templateId,
          updatedAt: new Date().toISOString(),
        };
        const skillPath = path.join(this.templatesDir, `skill_${skillId}.json`);
        fs.writeFileSync(skillPath, JSON.stringify(skill, null, 2));
      }

      // 保存或更新模板元数据
      const templateConfig = body.templateConfig || {};
      const metaPath = path.join(this.templatesDir, `${templateId}.json`);

      // 如果是复用已有模版，读取现有元数据并更新
      let existingMeta: any = {};
      if (!isNewTemplate && fs.existsSync(metaPath)) {
        existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      }

      fs.writeFileSync(metaPath, JSON.stringify({
        ...existingMeta,
        id: templateId,
        format,
        fileName: `${templateName}.${format}`,
        config: templateConfig,
        suggestions: body.suggestions || [],
        skillId,
        updatedAt: new Date().toISOString(),
        createdAt: existingMeta.createdAt || new Date().toISOString(),
      }));

      return {
        success: true,
        templateId,
        skillId,
        downloadUrl: `/studio/download-template/${templateId}`,
        skillDownloadUrl: skillId ? `/studio/download-skill/${skillId}` : undefined,
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
   * 下载AI Skill文件
   */
  @Get('download-skill/:id')
  @ApiOperation({ summary: 'Download AI skill file' })
  @Header('Content-Type', 'application/json')
  async downloadSkill(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const skillPath = path.join(this.templatesDir, `skill_${id}.json`);
    if (!fs.existsSync(skillPath)) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
  }

  /**
   * 获取AI Skill
   */
  @Get('skill/:id')
  @ApiOperation({ summary: 'Get AI skill by ID' })
  async getSkill(@Param('id') id: string): Promise<any> {
    const skillPath = path.join(this.templatesDir, `skill_${id}.json`);
    if (!fs.existsSync(skillPath)) {
      throw new HttpException('Skill not found', HttpStatus.NOT_FOUND);
    }
    return JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
  }

  // Helper methods for skill generation
  private generateExampleValue(fieldType: string, name: string): string {
    switch (fieldType) {
      case 'date':
        return '2024-01-15';
      case 'amount':
      case 'number':
        return '10000.00';
      case 'phone':
        return '138-0000-0000';
      case 'email':
        return 'example@email.com';
      case 'address':
        return '北京市朝阳区xxx街道xxx号';
      case 'name':
        return '张三';
      default:
        if (name.includes('金额') || name.includes('价格')) return '10000.00';
        if (name.includes('日期') || name.includes('时间')) return '2024-01-15';
        if (name.includes('电话') || name.includes('手机')) return '138-0000-0000';
        if (name.includes('地址')) return '北京市朝阳区xxx街道xxx号';
        if (name.includes('名称') || name.includes('姓名')) return '张三';
        return `示例${name}`;
    }
  }

  private generateAIInstructions(templateType: string, variables: any[], description?: string): string {
    const varList = variables.map(v => `- **${v.name}**: ${v.aiHint || v.meaning || '填写对应值'}`).join('\n');
    const exampleData = variables.slice(0, 5).map(v => `  "${v.name}": "${v.example}"`).join(',\n');

    const baseInstructions = `# ${templateType}模板AI使用指南

## 模板概述
${description || '这是一个模板，用于生成标准化文档。'}

## 变量列表
${varList}

## 数据处理规则
1. **日期格式**: 使用 YYYY年MM月DD日 格式
2. **金额格式**: 保留两位小数，使用千分位分隔
3. **文本内容**: 直接填充，无需特殊处理

## AI处理流程
1. 接收用户提供的原始数据
2. 根据字段映射规则解析数据
3. 按格式要求处理特殊字段（日期、金额等）
4. 使用处理后的数据渲染模板
5. 输出最终文档供用户下载

## 示例数据结构
{ "d": {
${exampleData}
} }
`;

    return baseInstructions;
  }

  private generateSimulatedData(skill: any): any {
    const data: any = {};  // 数据直接在根层级，不需要 d 包装
    // 使用新的parameters结构
    const variables = skill.parameters || skill.parameterization?.variables || [];
    for (const variable of variables) {
      const exampleValue = variable.example || this.generateExampleValue(variable.dataType || variable.fieldType, variable.name);

      // 解析变量路径，支持多种格式：
      // 1. {d.partyA.name} -> partyA.name (带花括号)
      // 2. d.partyA.name -> partyA.name (不带花括号)
      // 3. partyA.name -> partyA.name (无d前缀)
      let varPath = variable.name;
      // 移除花括号 { }
      varPath = varPath.replace(/^\{/, '').replace(/\}$/, '');
      // 移除 d. 或 c. 或 t. 前缀
      varPath = varPath.replace(/^([cdt])\./, '');

      if (varPath && varPath.includes('.')) {
        // 构建嵌套数据结构
        const parts = varPath.split('.');
        let current = data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = exampleValue;
      } else {
        // 单层路径，直接赋值
        data[varPath || variable.name] = exampleValue;
      }
    }
    return data;
  }
}