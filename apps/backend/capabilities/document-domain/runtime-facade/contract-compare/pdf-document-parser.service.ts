import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PdfContentExtractorService } from '../content-extraction/pdf-content-extractor.service';
import { DocumentVisionOcrService } from '../content-extraction/document-vision-ocr.service';
import { PdfPageRasterizerService } from '../content-extraction/pdf-page-rasterizer.service';
import type {
  ContractAstParseResult,
  ContractClauseNode,
  DocumentAstMetadata,
} from './contract-compare.types';
import { parseContractTextWithStateMachine } from './contract-clause-state-machine.util';
import { fallbackParagraphChunking } from './contract-clause-segmenter.util';

export interface PdfParseOptions {
  base64?: string;
  fileName?: string;
  text?: string;
  useMultimodalVision?: boolean;
  ocrModelId?: string;
}

@Injectable()
export class PdfDocumentParserService {
  private readonly logger = new Logger(PdfDocumentParserService.name);

  constructor(
    private readonly pdfExtractor: PdfContentExtractorService = new PdfContentExtractorService(),
    private readonly visionOcr: DocumentVisionOcrService = new DocumentVisionOcrService(),
    private readonly rasterizer: PdfPageRasterizerService = new PdfPageRasterizerService()
  ) {}

  /**
   * Dedicated PDF Ingestion Pipeline:
   * Supports dual-tracks:
   * 1. Vector/Digital PDF with Layout-Aware geometry parsing and hierarchical legal state machine
   * 2. Scanned / OCR / Multimodal Vision PDF directly reconstructing rich AST blocks
   */
  async parsePdfToAstDetailed(options: PdfParseOptions): Promise<ContractAstParseResult> {
    const fileName = options.fileName || 'contract.pdf';
    this.logger.log(`[PdfDocumentParserService] Starting dedicated PDF parsing for "${fileName}"`);

    // Case 1: Pre-extracted text input
    if (options.text && options.text.trim() && (!options.base64 || !options.base64.trim())) {
      const clauses = this.parseTextToClausesWithState(options.text, fileName);
      return {
        clauses,
        metadata: {
          isTruncated: false,
          format: 'pdf',
        },
      };
    }

    if (!options.base64 || !options.base64.trim()) {
      return { clauses: [], metadata: { isTruncated: false, format: 'pdf' } };
    }

    // Case 2: Explicit Multimodal Vision Override (when requested for complex stamped/scanned docs)
    if (options.useMultimodalVision) {
      try {
        this.logger.log(`[PdfDocumentParserService] Multimodal Vision forced for "${fileName}"`);
        const visionResult = await this.parseViaMultimodalVision(options.base64, fileName, options.ocrModelId);
        if (visionResult.clauses.length > 0) {
          return visionResult;
        }
      } catch (err: any) {
        this.logger.warn(`[PdfDocumentParserService] Multimodal Vision failed, falling back to layout extractor: ${err.message}`);
      }
    }

    // Case 3: Standard Layout-Aware Extraction (Embedded vector text + automatic hybrid OCR)
    const extraction = await this.pdfExtractor.extract({
      fileBase64: options.base64,
      fileName,
      ocrModelId: options.ocrModelId,
    });

    if (!extraction?.text || !extraction.text.trim()) {
      // If still empty and vision OCR wasn't tried yet, attempt Vision OCR as last resort
      try {
        this.logger.log(`[PdfDocumentParserService] Empty text layer. Invoking Multimodal Vision fallback...`);
        const fallbackVision = await this.parseViaMultimodalVision(options.base64, fileName, options.ocrModelId);
        if (fallbackVision.clauses.length > 0) {
          return fallbackVision;
        }
      } catch (err: any) {
        this.logger.warn(`[PdfDocumentParserService] Vision fallback failed: ${err.message}`);
      }

      throw new BadRequestException('未能从上传的 PDF 文档中识别出可读的合同条款文本，若是扫描件请确保清晰可见。');
    }

    const clauses = this.parseTextToClausesWithState(extraction.text, fileName);

    return {
      clauses,
      metadata: {
        isTruncated: extraction.truncated,
        pageCount: extraction.pageCount,
        extractedPageCount: extraction.extractedPageCount,
        characterCount: extraction.characterCount,
        warnings: extraction.warnings,
        format: 'pdf',
      },
    };
  }

  /**
   * Internal parser converting text into hierarchical clauses with fallback
   */
  private parseTextToClausesWithState(text: string, fileName?: string): ContractClauseNode[] {
    const clauses = parseContractTextWithStateMachine(text, { fileName, isPdf: true });
    if (clauses.length <= 1 && text.length > 300) {
      return fallbackParagraphChunking(text);
    }
    return clauses;
  }

  /**
   * Multimodal Vision Parsing pipeline for image/scanned PDFs
   */
  private async parseViaMultimodalVision(
    base64: string,
    fileName: string,
    ocrModelId?: string
  ): Promise<ContractAstParseResult> {
    const bytes = Buffer.from(base64.replace(/^data:[^;]+;base64,/i, ''), 'base64');
    
    // Rasterize first 20 pages max for vision inspection
    const rasterizedPages = await this.rasterizer.rasterizePages(bytes as any, 20);
    if (!rasterizedPages || rasterizedPages.length === 0) {
      throw new Error('PDF 栅格化渲染失败，无法提取页面图像');
    }

    const ocrResult = await this.visionOcr.extractFromImages(
      rasterizedPages.map((r) => ({ pageNumber: r.pageNumber, imageBuffer: r.imageBuffer })),
      {
        fileName,
        modelId: ocrModelId,
        prompt:
          '请对以下合同扫描件图像进行高精度法律版面识别，完整提取所有章节、条款、编号、表格（请输出标准 Markdown 表格 | 标题 | ... |）和签署信息，严格保持换行。',
      }
    );

    if (!ocrResult.text || !ocrResult.text.trim()) {
      throw new Error('多模态视觉模型未能返回识别文本');
    }

    const clauses = this.parseTextToClausesWithState(ocrResult.text, fileName);

    return {
      clauses,
      metadata: {
        isTruncated: ocrResult.truncated,
        pageCount: rasterizedPages.length,
        extractedPageCount: ocrResult.pages.length,
        characterCount: ocrResult.characterCount,
        format: 'pdf',
        warnings: [`已通过多模态视觉模型 (${ocrResult.modelUsed || 'vision'}) 完成结构化版面与条款识别。`],
      },
    };
  }
}
