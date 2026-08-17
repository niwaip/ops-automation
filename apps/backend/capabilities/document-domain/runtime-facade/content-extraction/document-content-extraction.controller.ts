import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { PdfContentExtractionInput } from './document-content-extraction.types';
import { PdfContentExtractorService } from './pdf-content-extractor.service';

interface BuiltinPdfExtractionInvokeDto {
  executionId: string;
  stepId: string;
  capabilityKey: string;
  definitionVersion: string;
  idempotencyKey?: string;
  input: PdfContentExtractionInput;
}

@Controller('internal/document/content-extractors')
export class DocumentContentExtractionController {
  constructor(private readonly pdfExtractor: PdfContentExtractorService) {}

  @Post('pdf/invoke')
  @HttpCode(HttpStatus.OK)
  async invokePdf(@Body() dto: BuiltinPdfExtractionInvokeDto) {
    const output = await this.pdfExtractor.extract(dto.input || ({} as PdfContentExtractionInput));
    if (!output.text.trim()) {
      return {
        success: false,
        errorCode: 'OCR_REQUIRED',
        errorMessage:
          'PDF 页面包含图像内容，但没有可提取的文本层；需要 OCR 能力识别后才能继续处理。',
        output,
      };
    }
    return { success: true, output };
  }
}
