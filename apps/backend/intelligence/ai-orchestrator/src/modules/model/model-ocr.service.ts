import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ModelService } from './model.service';
import type { ChatMessage, ContentBlock, LLMUsage } from '../../interfaces';

export interface ModelOcrPageResult {
  pageNumber: number;
  text: string;
  characterCount: number;
}

export interface ModelOcrResult {
  text: string;
  pages: ModelOcrPageResult[];
  modelId: string;
  modelName: string;
  pageCount: number;
  characterCount: number;
  usage?: LLMUsage;
}

export interface PerformOcrOptions {
  modelId?: string;
  prompt?: string;
  systemPrompt?: string;
}

const DEFAULT_OCR_SYSTEM_PROMPT =
  '你是一个高精度专业级文档与合同 OCR 识别引擎。请对上传的单页文档图像进行全文文字提取与版面还原。\n' +
  '规则：\n' +
  '1. 严格按图像中的文字原文逐字识别输出，忠实还原真实内容，严禁臆测、胡编、摘要或省略；\n' +
  '2. 保持合同与文档原有的法律结构层次，完整保留条款编号（如第一条、1.1）、标题、缩进及段落换行；\n' +
  '3. 若遇到表格内容，使用 Markdown 表格或整齐对齐的排版完整输出单元格文本；\n' +
  '4. 严禁输出任何开场白、解释性废话、免责声明或 Markdown 代码块包裹，仅输出纯正文文本。';

const DEFAULT_PAGE_PROMPT = '请完整提取此页面图像上的全部文字内容及段落排版：';

@Injectable()
export class ModelOcrService {
  private readonly logger = new Logger(ModelOcrService.name);

  constructor(private readonly modelService: ModelService) {}

  /**
   * Normalize an image input (raw base64 or data URI) to standard data URI
   */
  private normalizeImageDataUri(image: string): string {
    const trimmed = image.trim();
    if (trimmed.startsWith('data:image/')) {
      return trimmed;
    }
    // Default to image/png data URI if raw base64
    return `data:image/png;base64,${trimmed}`;
  }

  /**
   * Execute OCR extraction on one or more document images using a multimodal vision model.
   */
  async performOcr(images: string[], options?: PerformOcrOptions): Promise<ModelOcrResult> {
    if (!images || images.length === 0) {
      throw new HttpException('未提供需要识别的文档图片数据', HttpStatus.BAD_REQUEST);
    }

    // 1. Resolve OCR target model
    let targetModel = null;
    if (options?.modelId && options.modelId !== 'default' && options.modelId !== 'undefined') {
      targetModel =
        (await this.modelService.getModel(options.modelId)) ||
        (await this.modelService.getModelByName(options.modelId));
    }

    if (!targetModel) {
      targetModel =
        this.modelService.getPreferredDefaultModel({ mode: 'ocr' }) ||
        this.modelService.getDefaultModel();
    }

    if (!targetModel) {
      throw new HttpException(
        '未找到可用的 OCR 识别模型或默认模型，请在模型管理中配置活跃模型',
        HttpStatus.BAD_REQUEST
      );
    }

    const client = this.modelService.getClient(targetModel.id);
    if (!client) {
      throw new HttpException(
        `模型 ${targetModel.name} (${targetModel.id}) 尚未初始化有效客户端`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    this.logger.log(
      `Performing OCR on ${images.length} page(s) using model "${targetModel.name}" (${targetModel.id})`
    );

    const pages: ModelOcrPageResult[] = [];
    const systemPrompt = options?.systemPrompt || DEFAULT_OCR_SYSTEM_PROMPT;
    const pagePrompt = options?.prompt || DEFAULT_PAGE_PROMPT;

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < images.length; i++) {
      const pageNumber = i + 1;
      const dataUri = this.normalizeImageDataUri(images[i]);

      const userContent: ContentBlock[] = [
        {
          type: 'text',
          text: pagePrompt,
        },
        {
          type: 'image_url',
          image_url: {
            url: dataUri,
            detail: 'high',
          },
        },
      ];

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      try {
        const response = await client.chatCompletion(messages);
        let cleanedContent = this.modelService.stripThinkingTags(response.content || '').trim();

        // Strip surrounding markdown code block if model wrapped entire output in ```markdown ... ```
        if (cleanedContent.startsWith('```markdown') && cleanedContent.endsWith('```')) {
          cleanedContent = cleanedContent.slice(11, -3).trim();
        } else if (cleanedContent.startsWith('```') && cleanedContent.endsWith('```')) {
          cleanedContent = cleanedContent.slice(3, -3).trim();
        }

        pages.push({
          pageNumber,
          text: cleanedContent,
          characterCount: cleanedContent.length,
        });

        if (response.usage) {
          totalPromptTokens += response.usage.prompt_tokens || 0;
          totalCompletionTokens += response.usage.completion_tokens || 0;
          totalTokens += response.usage.total_tokens || 0;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`OCR failed on page ${pageNumber}: ${errorMsg}`);
        throw new HttpException(
          `大模型视觉 OCR 识别第 ${pageNumber} 页失败: ${errorMsg}`,
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    }

    const fullText = pages.map((p) => p.text).join('\n\n').trim();

    return {
      text: fullText,
      pages,
      modelId: targetModel.id,
      modelName: targetModel.name,
      pageCount: pages.length,
      characterCount: fullText.length,
      usage:
        totalTokens > 0
          ? {
              prompt_tokens: totalPromptTokens,
              completion_tokens: totalCompletionTokens,
              total_tokens: totalTokens,
            }
          : undefined,
    };
  }
}
