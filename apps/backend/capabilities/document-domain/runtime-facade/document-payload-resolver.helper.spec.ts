import * as fs from 'fs';
import * as path from 'path';
import {
  resolveCompareDocumentPayloads,
  resolveReviewDocumentPayload,
  tryReadFileByName,
  tryReadFileById,
  getCandidateStorageDirs,
} from './document-payload-resolver.helper';
import type { ContractCompareInput } from './contract-compare/contract-compare.types';
import type { BuiltinContractReviewInput } from './contract-review/contract-review.types';

describe('document-payload-resolver.helper', () => {
  const tmpDir = path.join(process.cwd(), '.tmp', 'resolver-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    // Write sample mock files
    fs.writeFileSync(path.join(tmpDir, 'test_contract_a.docx'), 'dummy docx content A');
    fs.writeFileSync(path.join(tmpDir, 'test_contract_b.docx'), 'dummy docx content B');
    // Write sample metadata JSON
    const metaA = {
      id: 'mock-uuid-aaa',
      fileName: 'custom_named_contract.docx',
      format: 'docx',
    };
    fs.writeFileSync(path.join(tmpDir, 'mock-uuid-aaa.json'), JSON.stringify(metaA));
    fs.writeFileSync(path.join(tmpDir, 'mock-uuid-aaa.docx'), 'metadata resolved content');
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('tryReadFileByName', () => {
    it('finds file directly in candidate directory', () => {
      const buf = tryReadFileByName('test_contract_a.docx', [tmpDir]);
      expect(buf).not.toBeNull();
      expect(buf?.toString()).toBe('dummy docx content A');
    });

    it('finds file via metadata json mapping', () => {
      const buf = tryReadFileByName('custom_named_contract.docx', [tmpDir]);
      expect(buf).not.toBeNull();
      expect(buf?.toString()).toBe('metadata resolved content');
    });

    it('returns null if file does not exist', () => {
      const buf = tryReadFileByName('non_existent_doc.docx', [tmpDir]);
      expect(buf).toBeNull();
    });
  });

  describe('tryReadFileById', () => {
    it('finds file by UUID with format from metadata', () => {
      const buf = tryReadFileById('mock-uuid-aaa', [tmpDir]);
      expect(buf).not.toBeNull();
      expect(buf?.toString()).toBe('metadata resolved content');
    });

    it('returns null for non-existent ID', () => {
      const buf = tryReadFileById('non-existent-uuid', [tmpDir]);
      expect(buf).toBeNull();
    });
  });

  describe('resolveReviewDocumentPayload', () => {
    it('resolves document from fileName in candidate dirs', async () => {
      const input: BuiltinContractReviewInput = {
        fileName: 'test_contract_a.docx',
      };
      await resolveReviewDocumentPayload(input, [tmpDir]);
      expect(input.fileBase64).toBe(Buffer.from('dummy docx content A').toString('base64'));
    });

    it('resolves document from taskContext references', async () => {
      const input: BuiltinContractReviewInput = {
        taskContext: {
          references: [
            {
              kind: 'session_result',
              structuredData: {
                result: {
                  fileName: 'custom_named_contract.docx',
                  downloadUrl: 'http://example.com/studio/download/mock-uuid-aaa',
                },
              },
            },
          ],
        },
      } as any;
      await resolveReviewDocumentPayload(input, [tmpDir]);
      expect(input.fileBase64).toBe(Buffer.from('metadata resolved content').toString('base64'));
      expect(input.fileName).toBe('custom_named_contract.docx');
    });

    it('falls back to detailText if file not on disk', async () => {
      const input: BuiltinContractReviewInput = {
        taskContext: {
          references: [
            {
              kind: 'session_result',
              detailText: '合同正文：第一条 双方约定保密事项。',
            },
          ],
        },
      } as any;
      await resolveReviewDocumentPayload(input, [tmpDir]);
      expect(input.text).toBe('合同正文：第一条 双方约定保密事项。');
    });
  });

  describe('resolveCompareDocumentPayloads', () => {
    it('resolves both documents from fileNameA and fileNameB', async () => {
      const input: ContractCompareInput = {
        fileNameA: 'test_contract_a.docx',
        fileNameB: 'test_contract_b.docx',
      };
      await resolveCompareDocumentPayloads(input, [tmpDir]);
      expect(input.fileBase64A).toBe(Buffer.from('dummy docx content A').toString('base64'));
      expect(input.fileBase64B).toBe(Buffer.from('dummy docx content B').toString('base64'));
    });

    it('resolves documents from files array', async () => {
      const input: ContractCompareInput = {
        files: [
          { fileName: 'uploaded_a.docx', content: 'base64-a' },
          { fileName: 'uploaded_b.docx', content: 'base64-b' },
        ],
      } as any;
      await resolveCompareDocumentPayloads(input, [tmpDir]);
      expect(input.fileBase64A).toBe('base64-a');
      expect(input.fileNameA).toBe('uploaded_a.docx');
      expect(input.fileBase64B).toBe('base64-b');
      expect(input.fileNameB).toBe('uploaded_b.docx');
    });

    it('resolves documents from taskContext references', async () => {
      const input: ContractCompareInput = {
        taskContext: {
          references: [
            {
              structuredData: {
                fileName: 'test_contract_a.docx',
              },
            },
            {
              structuredData: {
                fileName: 'test_contract_b.docx',
              },
            },
          ],
        },
      } as any;
      await resolveCompareDocumentPayloads(input, [tmpDir]);
      expect(input.fileBase64A).toBe(Buffer.from('dummy docx content A').toString('base64'));
      expect(input.fileBase64B).toBe(Buffer.from('dummy docx content B').toString('base64'));
    });

    it('throws BadRequestException if neither document is provided', async () => {
      const input: ContractCompareInput = {};
      await expect(resolveCompareDocumentPayloads(input, [tmpDir])).rejects.toThrow(
        '请提供基准合同（合同A）和比对合同（合同B）的文件或正文内容。'
      );
    });

    it('throws BadRequestException if document B is missing', async () => {
      const input: ContractCompareInput = {
        textA: '合同A正文内容',
        fileNameB: 'missing_b.docx',
      };
      await expect(resolveCompareDocumentPayloads(input, [tmpDir])).rejects.toThrow(
        '未找到比对合同（合同B “missing_b.docx”）的文件内容'
      );
    });
  });
});
