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

  it('extracts text from docx files when provided', async () => {
    // A minimal valid docx buffer created with zip / mammoth
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX Content</w:t></w:r></w:p></w:body></w:document>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.extract({
      fileBase64: buffer.toString('base64'),
      fileName: '1234.docx',
    });

    expect(result.text).toContain('Hello DOCX Content');
    expect(result.extraction.format).toBe('docx');
  });

  it('extracts text from markdown files when provided', async () => {
    const mdContent = '# Chapter 1\n\nThis is a unique markdown content.';
    const result = await service.extract({
      fileBase64: Buffer.from(mdContent, 'utf8').toString('base64'),
      fileName: '03-spell-unique.md',
    });

    expect(result.text).toBe(mdContent);
    expect(result.extraction.format).toBe('text');
    expect(result.metadata.format).toBe('md');
  });

  it('extracts text from pptx files when provided', async () => {
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Enterprise AIGC Roadmap</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const result = await service.extract({
      fileBase64: buffer.toString('base64'),
      fileName: 'presentation.pptx',
    });

    expect(result.text).toContain('Enterprise AIGC Roadmap');
    expect(result.extraction.format).toBe('pptx');
    expect(result.pageCount).toBe(1);
  });
});
