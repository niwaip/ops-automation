import { Injectable, Logger } from '@nestjs/common';
import { createCanvas } from '@napi-rs/canvas';

export interface RasterizedPage {
  pageNumber: number;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

@Injectable()
export class PdfPageRasterizerService {
  private readonly logger = new Logger(PdfPageRasterizerService.name);

  /**
   * Rasterize up to `maxPages` from a PDF.js document into PNG image buffers.
   * Uses scale 1.5 (~150 DPI) for optimal balance between OCR clarity and payload size.
   */
  async rasterizePages(
    document: {
      numPages: number;
      getPage: (pageNumber: number) => Promise<any>;
    },
    maxPages?: number,
    scale?: number
  ): Promise<RasterizedPage[]> {
    const effectiveScale =
      scale ?? (parseFloat(process.env.PDF_OCR_RASTER_SCALE || '') || 1.5);
    const effectiveMaxPages =
      maxPages ?? (parseInt(process.env.PDF_OCR_MAX_PAGES || '', 10) || 20);
    const pageLimit = Math.min(document.numPages, effectiveMaxPages);
    const rasterized: RasterizedPage[] = [];

    this.logger.log(`Rasterizing ${pageLimit} page(s) of PDF for vision OCR (scale=${effectiveScale})`);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await document.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.floor(viewport.width));
        const height = Math.max(1, Math.floor(viewport.height));

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Render PDF page to canvas context
        await page.render({ canvasContext: ctx, viewport }).promise;

        const imageBuffer = canvas.toBuffer('image/png');
        rasterized.push({
          pageNumber,
          imageBuffer,
          width,
          height,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to rasterize PDF page ${pageNumber}: ${errorMsg}`);
      } finally {
        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }
    }

    return rasterized;
  }
}
