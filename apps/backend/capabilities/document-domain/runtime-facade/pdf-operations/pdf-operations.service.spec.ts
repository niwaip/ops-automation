import { BadRequestException, ConflictException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { PdfArtifactStorageService } from './pdf-artifact-storage.service';
import { PdfCreateService } from './pdf-create.service';
import { containsCjkText, resolveCjkPdfFont } from './pdf-font-resolver';
import { PdfInputDecoderService } from './pdf-input-decoder.service';
import { PdfMergeService } from './pdf-merge.service';
import { parsePdfPageSelection } from './pdf-page-selection';
import { PdfSplitService } from './pdf-split.service';

describe('PDF atomic capabilities', () => {
  const rendersDir = path.join(process.cwd(), '.tmp', 'renders');
  const artifactIds = new Set<string>();
  const storage = new PdfArtifactStorageService();
  const decoder = new PdfInputDecoderService();
  const mergeService = new PdfMergeService(decoder, storage);
  const splitService = new PdfSplitService(decoder, storage);
  const createService = new PdfCreateService(storage);

  afterAll(async () => {
    for (const id of artifactIds) {
      await fs.promises.unlink(path.join(rendersDir, `${id}.pdf`)).catch(() => undefined);
      await fs.promises.unlink(path.join(rendersDir, `${id}.pdf.meta.json`)).catch(() => undefined);
      await fs.promises.unlink(path.join(rendersDir, `${id}.pdf.lock`)).catch(() => undefined);
    }
  });

  async function makePdf(pageCount: number): Promise<string> {
    const document = await PDFDocument.create({ updateMetadata: false });
    for (let index = 0; index < pageCount; index += 1) {
      document.addPage([300 + index, 400 + index]);
    }
    return Buffer.from(await document.save({ useObjectStreams: false })).toString('base64');
  }

  function trackArtifacts(result: { artifacts: Array<{ id?: string }> }): void {
    for (const artifact of result.artifacts) {
      if (artifact.id) artifactIds.add(artifact.id);
    }
  }

  async function readStoredPdf(artifact: { id?: string }): Promise<PDFDocument> {
    if (!artifact.id) throw new Error('artifact id is required');
    const bytes = await fs.promises.readFile(path.join(rendersDir, `${artifact.id}.pdf`));
    return PDFDocument.load(bytes, { updateMetadata: false });
  }

  it('merges PDFs in order and returns one integrity-addressed ArtifactRef', async () => {
    const result = await mergeService.merge(
      {
        files: [
          { fileBase64: await makePdf(1), fileName: 'first.pdf' },
          { fileBase64: await makePdf(2), fileName: 'second.pdf' },
        ],
        fileName: 'combined.pdf',
      },
      'pdf-merge-test'
    );
    trackArtifacts(result);

    expect(result.operation).toBe('merge');
    expect(result.pageCount).toBe(3);
    expect(result.inputCount).toBe(2);
    expect(result.artifact).toMatchObject({
      name: 'combined.pdf',
      mimeType: 'application/pdf',
      sizeBytes: expect.any(Number),
      metadata: expect.objectContaining({ operation: 'merge', pageCount: 3, sha256: expect.any(String) }),
    });
    await expect(readStoredPdf(result.artifact)).resolves.toMatchObject({});
    expect((await readStoredPdf(result.artifact)).getPageCount()).toBe(3);
  });

  it('returns the existing merge artifact for an identical idempotent request', async () => {
    const files = [
      { fileBase64: await makePdf(1) },
      { fileBase64: await makePdf(1) },
    ];
    const first = await mergeService.merge({ files }, 'pdf-merge-idempotent-test');
    const second = await mergeService.merge({ files }, 'pdf-merge-idempotent-test');
    trackArtifacts(first);

    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.artifact.metadata?.sha256).toBe(first.artifact.metadata?.sha256);
  });

  it('rejects reuse of an idempotency key with different merge inputs', async () => {
    const key = 'pdf-merge-conflict-test';
    const first = await mergeService.merge(
      { files: [{ fileBase64: await makePdf(1) }, { fileBase64: await makePdf(1) }] },
      key
    );
    trackArtifacts(first);

    await expect(
      mergeService.merge(
        { files: [{ fileBase64: await makePdf(1) }, { fileBase64: await makePdf(2) }] },
        key
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent writes for the same idempotency key', async () => {
    const key = 'pdf-merge-concurrent-test';
    const onePage = await makePdf(1);
    const twoPages = await makePdf(2);
    const settled = await Promise.allSettled([
      mergeService.merge({ files: [{ fileBase64: onePage }, { fileBase64: onePage }] }, key),
      mergeService.merge({ files: [{ fileBase64: onePage }, { fileBase64: twoPages }] }, key),
    ]);
    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<PdfMergeService['merge']>>> =>
        result.status === 'fulfilled'
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    trackArtifacts(fulfilled[0].value);
    expect((await readStoredPdf(fulfilled[0].value.artifact)).getPageCount()).toBe(
      fulfilled[0].value.pageCount
    );
  });

  it('splits selected pages into separate one-page artifacts', async () => {
    const result = await splitService.split(
      {
        fileBase64: await makePdf(4),
        fileName: 'source.pdf',
        pages: '1,3-4',
      },
      'pdf-split-test'
    );
    trackArtifacts(result);

    expect(result.operation).toBe('split');
    expect(result.selectedPages).toEqual([1, 3, 4]);
    expect(result.artifacts).toHaveLength(3);
    expect(result.artifacts.map((artifact) => artifact.name)).toEqual([
      'source_p1.pdf',
      'source_p3.pdf',
      'source_p4.pdf',
    ]);
    for (const artifact of result.artifacts) {
      expect((await readStoredPdf(artifact)).getPageCount()).toBe(1);
      expect(artifact.metadata).toEqual(
        expect.objectContaining({ operation: 'split', pageCount: 1, sha256: expect.any(String) })
      );
    }
  });

  it('creates a readable PDF with headings, lists, a table, and page numbers', async () => {
    const result = await createService.create(
      {
        fileName: 'atomic-report.pdf',
        title: 'Atomic PDF Report',
        pageNumbers: true,
        content: [
          { type: 'heading', text: 'Summary' },
          { type: 'paragraph', text: 'Generated by the default PDF capability.' },
          { type: 'list', items: ['Merge', 'Split', 'Create'] },
          {
            type: 'table',
            headers: ['Capability', 'Status'],
            rows: [
              ['Merge', 'Ready'],
              ['Split', 'Ready'],
            ],
          },
        ],
      },
      'pdf-create-test'
    );
    trackArtifacts(result);

    expect(result.operation).toBe('create');
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.artifact).toMatchObject({
      name: 'atomic-report.pdf',
      mimeType: 'application/pdf',
      metadata: expect.objectContaining({
        operation: 'create',
        pageNumbers: true,
        sha256: expect.any(String),
      }),
    });
    expect((await readStoredPdf(result.artifact)).getPageCount()).toBe(result.pageCount);
  });

  it('validates PDF inputs and page selection boundaries', async () => {
    expect(() => decoder.decode(Buffer.from('not a pdf').toString('base64'))).toThrow(
      BadRequestException
    );
    expect(parsePdfPageSelection('1,3,3,5-6', 6)).toEqual([1, 3, 5, 6]);
    expect(() => parsePdfPageSelection('0,2', 3)).toThrow(BadRequestException);
    expect(() => parsePdfPageSelection(undefined, 51)).toThrow(BadRequestException);
    await expect(
      createService.create(
        {
          content: [{ type: 'table', headers: ['A'], rows: [null as any] }],
        },
        'pdf-create-invalid-table-test'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      createService.create(
        {
          content: [{ type: 'paragraph', text: 'test' }],
          pageNumbers: 'yes' as any,
        },
        'pdf-create-invalid-page-number-test'
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('detects CJK content so the runtime selects an embedded system font', () => {
    expect(containsCjkText('中文 PDF')).toBe(true);
    expect(containsCjkText('English PDF')).toBe(false);
  });

  it('embeds an available CJK font when generating Chinese content', async () => {
    if (!resolveCjkPdfFont()) return;
    const result = await createService.create(
      {
        fileName: 'chinese-report.pdf',
        title: '中文报告',
        content: [{ type: 'paragraph', text: '这是中文字体嵌入验证。' }],
      },
      'pdf-create-cjk-test'
    );
    trackArtifacts(result);

    expect(result.artifact.metadata).toEqual(
      expect.objectContaining({ operation: 'create', sha256: expect.any(String) })
    );
    expect((await readStoredPdf(result.artifact)).getPageCount()).toBe(result.pageCount);
  });

  it('resiliently handles string and string[] inputs as paragraph blocks', async () => {
    const stringResult = await createService.create(
      {
        fileName: 'plain-string.pdf',
        title: '纯文本测试',
        content: '这是一整段纯文本直接输入' as any,
      },
      'pdf-create-plain-string-test'
    );
    trackArtifacts(stringResult);
    expect(stringResult.operation).toBe('create');
    expect(stringResult.pageCount).toBeGreaterThanOrEqual(1);

    const arrayStringResult = await createService.create(
      {
        fileName: 'array-string.pdf',
        title: '字符串数组测试',
        content: ['第一段内容', '第二段内容'] as any,
      },
      'pdf-create-array-string-test'
    );
    trackArtifacts(arrayStringResult);
    expect(arrayStringResult.operation).toBe('create');
    expect(arrayStringResult.pageCount).toBeGreaterThanOrEqual(1);
  });
});
