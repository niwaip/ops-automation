import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { PdfArtifactStorageService } from './pdf-artifact-storage.service';
import { MAX_PDF_INPUT_BYTES, PdfInputDecoderService } from './pdf-input-decoder.service';
import type { PdfMergeInput, PdfOperationOutput } from './pdf-operation.types';
import { computePdfRequestDigest } from './pdf-request-digest';

const MIN_MERGE_INPUTS = 2;
const MAX_MERGE_INPUTS = 10;
const MAX_MERGE_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_MERGED_PAGES = 200;

@Injectable()
export class PdfMergeService {
  constructor(
    private readonly decoder: PdfInputDecoderService,
    private readonly storage: PdfArtifactStorageService
  ) {}

  async merge(input: PdfMergeInput, idempotencyKey: string): Promise<PdfOperationOutput> {
    if (!Array.isArray(input?.files)) {
      throw new BadRequestException('files must be an array of PDF inputs');
    }
    if (input.files.length < MIN_MERGE_INPUTS || input.files.length > MAX_MERGE_INPUTS) {
      throw new BadRequestException(
        `PDF merge requires ${MIN_MERGE_INPUTS}-${MAX_MERGE_INPUTS} input files`
      );
    }
    if (input.fileName !== undefined && typeof input.fileName !== 'string') {
      throw new BadRequestException('fileName must be a string');
    }
    if (input.fileName && input.fileName.length > 120) {
      throw new BadRequestException('fileName cannot exceed 120 characters');
    }

    const decoded = input.files.map((file, index) =>
      this.decoder.decode(file?.fileBase64, `files[${index}].fileBase64`)
    );
    const totalBytes = decoded.reduce((sum, bytes) => sum + bytes.length, 0);
    if (totalBytes > MAX_MERGE_INPUT_BYTES) {
      throw new PayloadTooLargeException('Merged PDF inputs exceed the 30MB combined limit');
    }
    if (decoded.some((bytes) => bytes.length > MAX_PDF_INPUT_BYTES)) {
      throw new PayloadTooLargeException('Each merged PDF must be at most 10MB');
    }

    const output = await PDFDocument.create({ updateMetadata: false });
    let pageCount = 0;
    try {
      for (const bytes of decoded) {
        const source = await PDFDocument.load(bytes, { updateMetadata: false });
        const sourcePageCount = source.getPageCount();
        if (sourcePageCount < 1) {
          throw new BadRequestException('Every merged PDF must contain at least one page');
        }
        pageCount += sourcePageCount;
        if (pageCount > MAX_MERGED_PAGES) {
          throw new BadRequestException(
            `Merged PDF would exceed the ${MAX_MERGED_PAGES}-page limit`
          );
        }
        const pages = await output.copyPages(source, source.getPageIndices());
        for (const page of pages) output.addPage(page);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Unable to merge PDF input: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const requestDigest = computePdfRequestDigest([
      'pdf-merge-v1',
      input.fileName || 'merged.pdf',
      ...decoded,
    ]);
    const stored = await this.storage.store({
      bytes: await output.save({ useObjectStreams: false }),
      fileName: input.fileName || 'merged.pdf',
      idempotencyKey,
      requestDigest,
      metadata: {
        operation: 'merge',
        inputCount: decoded.length,
        pageCount,
      },
    });
    return {
      operation: 'merge',
      artifact: stored.artifact,
      artifacts: [stored.artifact],
      pageCount,
      inputCount: decoded.length,
    };
  }
}
