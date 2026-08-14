import { DocumentContentExtractionController } from './document-content-extraction.controller';

describe('DocumentContentExtractionController', () => {
  const dto = {
    executionId: 'exec-1',
    stepId: 'step-1',
    capabilityKey: 'platform.document.pdf-content-extractor',
    definitionVersion: '1.0.0',
    input: { fileBase64: 'JVBERi0=' },
  };

  it('fails with OCR_REQUIRED when the PDF has visual pages but no text layer', async () => {
    const output = {
      text: '',
      pages: [{ pageNumber: 1, text: '', characterCount: 0 }],
      metadata: {},
      pageCount: 1,
      extractedPageCount: 1,
      characterCount: 0,
      truncated: false,
      warnings: ['PDF 未包含可提取的文本层；如为扫描件，请在后续 OCR Skill 中处理。'],
      extraction: { format: 'pdf', method: 'embedded_text', ocrUsed: false },
    } as const;
    const controller = new DocumentContentExtractionController({
      extract: jest.fn().mockResolvedValue(output),
    } as any);

    await expect(controller.invokePdf(dto)).resolves.toEqual({
      success: false,
      errorCode: 'OCR_REQUIRED',
      errorMessage: expect.stringContaining('需要 OCR'),
      output,
    });
  });

  it('returns a successful capability result when embedded text exists', async () => {
    const output = {
      text: 'contract text',
      pages: [{ pageNumber: 1, text: 'contract text', characterCount: 13 }],
      metadata: {},
      pageCount: 1,
      extractedPageCount: 1,
      characterCount: 13,
      truncated: false,
      warnings: [],
      extraction: { format: 'pdf', method: 'embedded_text', ocrUsed: false },
    } as const;
    const controller = new DocumentContentExtractionController({
      extract: jest.fn().mockResolvedValue(output),
    } as any);

    await expect(controller.invokePdf(dto)).resolves.toEqual({ success: true, output });
  });
});
