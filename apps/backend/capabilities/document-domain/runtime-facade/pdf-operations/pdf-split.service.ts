import { BadRequestException, Injectable } from '@nestjs/common';
import type { ArtifactRef } from '@ops/backend-runtime-capability-contract';
import { PDFDocument } from 'pdf-lib';
import { PdfArtifactStorageService } from './pdf-artifact-storage.service';
import { PdfInputDecoderService } from './pdf-input-decoder.service';
import type { PdfOperationOutput, PdfSplitInput } from './pdf-operation.types';
import { parsePdfPageSelection } from './pdf-page-selection';
import { computePdfRequestDigest } from './pdf-request-digest';

@Injectable()
export class PdfSplitService {
  constructor(
    private readonly decoder: PdfInputDecoderService,
    private readonly storage: PdfArtifactStorageService
  ) {}

  async split(input: PdfSplitInput, idempotencyKey: string): Promise<PdfOperationOutput> {
    const sourceBytes = this.decoder.decode(input?.fileBase64);
    if (input.fileName !== undefined && typeof input.fileName !== 'string') {
      throw new BadRequestException('fileName must be a string');
    }
    if (input.fileNamePrefix !== undefined && typeof input.fileNamePrefix !== 'string') {
      throw new BadRequestException('fileNamePrefix must be a string');
    }
    if ((input.fileName?.length || 0) > 255 || (input.fileNamePrefix?.length || 0) > 100) {
      throw new BadRequestException('PDF split file name is too long');
    }
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(sourceBytes, { updateMetadata: false });
    } catch (error) {
      throw new BadRequestException(
        `Unable to split PDF input: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const totalPages = source.getPageCount();
    const selectedPages = parsePdfPageSelection(input.pages, totalPages);
    const sourceName = input.fileNamePrefix || input.fileName || 'document';
    const baseName = sourceName.replace(/\.pdf$/i, '') || 'document';
    const width = String(totalPages).length;
    const requestDigest = computePdfRequestDigest([
      'pdf-split-v1',
      sourceBytes,
      selectedPages.join(','),
      baseName,
    ]);

    const artifacts: ArtifactRef[] = [];
    for (const pageNumber of selectedPages) {
      const output = await PDFDocument.create({ updateMetadata: false });
      const [page] = await output.copyPages(source, [pageNumber - 1]);
      if (!page) {
        throw new BadRequestException(`Unable to copy PDF page ${pageNumber}`);
      }
      output.addPage(page);
      const stored = await this.storage.store({
        bytes: await output.save({ useObjectStreams: false }),
        fileName: `${baseName}_p${String(pageNumber).padStart(width, '0')}.pdf`,
        idempotencyKey,
        artifactSuffix: `page-${pageNumber}`,
        requestDigest,
        metadata: {
          operation: 'split',
          sourcePageCount: totalPages,
          sourcePageNumber: pageNumber,
          pageCount: 1,
        },
      });
      artifacts.push(stored.artifact);
    }

    return {
      operation: 'split',
      artifact: artifacts[0],
      artifacts,
      pageCount: artifacts.length,
      selectedPages,
    };
  }
}
