import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { PdfContentExtractorService } from './pdf-content-extractor.service';

describe('PdfContentExtractorService', () => {
  const service = new PdfContentExtractorService();
  const fixturePath = path.resolve(
    __dirname,
    '../../../../../../builtin-skills/platform.document.pdf-content-extractor/fixtures/smoke-input.json'
  );

  const readFixtureBase64 = (): string => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as { fileBase64: string };
    return fixture.fileBase64;
  };

  it('extracts embedded text, page boundaries, and metadata deterministically', async () => {
    const fileBase64 = readFixtureBase64();
    const result = await service.extract({ fileBase64 });

    expect(result.text).toContain('Builtin PDF Content Extractor');
    expect(result.text).toContain('Second Page');
    expect(result.pageCount).toBe(2);
    expect(result.extractedPageCount).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.metadata.Title).toBe('PDF extractor smoke test');
    expect(result.extraction).toEqual({ format: 'pdf', method: 'embedded_text', ocrUsed: false });
    expect(result.truncated).toBe(false);
  });

  it('enforces character limits and reports truncation', async () => {
    const fileBase64 = readFixtureBase64();
    const result = await service.extract({ fileBase64, maxCharacters: 20 });

    expect(result.text.length).toBeLessThanOrEqual(20);
    expect(result.truncated).toBe(true);
  });

  it('rejects content that is not a PDF', async () => {
    await expect(
      service.extract({ fileBase64: Buffer.from('not a pdf').toString('base64') })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized base64 before allocating the decoded PDF buffer', async () => {
    const oversizedBase64 = 'A'.repeat(Math.ceil((10 * 1024 * 1024) / 3) * 4 + 4);

    await expect(service.extract({ fileBase64: oversizedBase64 })).rejects.toBeInstanceOf(
      PayloadTooLargeException
    );
  });
});
