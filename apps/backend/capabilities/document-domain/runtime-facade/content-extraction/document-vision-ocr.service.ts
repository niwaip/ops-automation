import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import type { DocumentContentExtractionPage } from './document-content-extraction.types';

export interface VisionOcrExtractionResult {
  text: string;
  pages: DocumentContentExtractionPage[];
  modelUsed?: string;
  characterCount: number;
  truncated: boolean;
}

@Injectable()
export class DocumentVisionOcrService {
  private readonly logger = new Logger(DocumentVisionOcrService.name);

  private getEndpointUrl(): string {
    return getAiOrchestratorUrl();
  }

  /**
   * Send page images to AI Orchestrator OCR vision endpoint to extract full text and structured pages.
   */
  async extractFromImages(
    pageImages: Array<{ pageNumber: number; imageBuffer: Buffer }>,
    options?: {
      maxCharacters?: number;
      modelId?: string;
      prompt?: string;
      fileName?: string;
    }
  ): Promise<VisionOcrExtractionResult> {
    if (!pageImages || pageImages.length === 0) {
      return {
        text: '',
        pages: [],
        characterCount: 0,
        truncated: false,
      };
    }

    const aiUrl = this.getEndpointUrl();
    this.logger.log(
      `Invoking AI Orchestrator vision OCR for ${pageImages.length} page(s) at ${aiUrl}/ai/model/ocr`
    );

    const images = pageImages.map(
      (p) => `data:image/png;base64,${p.imageBuffer.toString('base64')}`
    );

    try {
      const response = await axios.post<{
        text: string;
        pages: Array<{ pageNumber: number; text: string; characterCount: number }>;
        modelId: string;
        modelName: string;
      }>(
        `${aiUrl}/ai/model/ocr`,
        {
          images,
          modelId: options?.modelId || 'default',
          prompt: options?.prompt,
        },
        {
          timeout: 120000, // 2 minutes for multimodal OCR
        }
      );

      const maxChars = options?.maxCharacters || 200000;
      const rawPages = response.data?.pages || [];
      const pages: DocumentContentExtractionPage[] = [];
      let characterCount = 0;
      let truncated = false;
      const textParts: string[] = [];

      for (let idx = 0; idx < rawPages.length; idx++) {
        const p = rawPages[idx];
        if (characterCount >= maxChars) {
          truncated = true;
          break;
        }

        const remaining = maxChars - characterCount;
        const pageText = p.text.length > remaining ? p.text.slice(0, remaining) : p.text;
        if (pageText.length < p.text.length) {
          truncated = true;
        }

        pages.push({
          pageNumber: pageImages[idx]?.pageNumber ?? p.pageNumber,
          text: pageText,
          characterCount: pageText.length,
        });

        characterCount += pageText.length;
        textParts.push(pageText);
      }

      const fullText = textParts.join('\n\n').trim();

      return {
        text: fullText,
        pages,
        modelUsed: response.data?.modelName || response.data?.modelId,
        characterCount: fullText.length,
        truncated,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AI Orchestrator vision OCR invocation failed: ${errorMsg}`);
      return {
        text: '',
        pages: [],
        characterCount: 0,
        truncated: false,
      };
    }
  }
}
