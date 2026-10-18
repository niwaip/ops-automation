import * as JSZipLib from 'jszip';
const JSZip = (JSZipLib as any).default || JSZipLib;
import { WorkspaceContentIndexerService } from '@ops/workbench/workspace/workspace-content-indexer.service';
import { evaluateDocumentRelevance, buildQueryTokenProfile } from '@ops/workbench/workspace/workspace-search-relevance.helper';

describe('Workspace Core Values: Security & High-Precision Indexing', () => {
  describe('Office Plain Text Extraction (.docx & .xlsx)', () => {
    let indexer: WorkspaceContentIndexerService;

    beforeEach(() => {
      indexer = new WorkspaceContentIndexerService({} as any);
    });

    it('extracts paragraphs from .docx archive', async () => {
      const zip = new JSZip();
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>企业技术规范总则</w:t></w:r></w:p>
    <w:p><w:r><w:t>第一条：所有生产变更必须走审批流程。</w:t></w:r></w:p>
    <w:p><w:r><w:t>验收口令：SEC-2026-TOKEN</w:t></w:r></w:p>
  </w:body>
</w:document>`;
      zip.file('word/document.xml', documentXml);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      expect(indexer.isDocxFile('规章制度.docx')).toBe(true);
      const text = await indexer.extractText(buffer, '规章制度.docx');
      expect(text).toContain('企业技术规范总则');
      expect(text).toContain('第一条：所有生产变更必须走审批流程。');
      expect(text).toContain('验收口令：SEC-2026-TOKEN');
    });

    it('extracts unique cell strings from .xlsx archive', async () => {
      const zip = new JSZip();
      const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>项目预算台账</t></si>
  <si><t>星桥工程三期</t></si>
  <si><t>52931元</t></si>
</sst>`;
      zip.file('xl/sharedStrings.xml', sharedStringsXml);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      expect(indexer.isXlsxFile('预算表.xlsx')).toBe(true);
      const text = await indexer.extractText(buffer, '预算表.xlsx');
      expect(text).toContain('项目预算台账');
      expect(text).toContain('星桥工程三期');
      expect(text).toContain('52931元');
    });
  });

  describe('Ground Truth Verification: Physical Line vs Metadata Attestation', () => {
    it('marks physicalVerified = true when core entity is in physical lines', () => {
      const profile = buildQueryTokenProfile('/doc 检索口令 AD-Q8VN-6173');
      const evalResult = evaluateDocumentRelevance({
        nodeName: '公司文档.md',
        profile,
        contentMatches: [
          { line: 8, snippet: '项目验收口令：AD-Q8VN-6173，经测试员确认', sourceKind: 'physical_line' as const },
        ],
        baseScore: 100,
      });

      expect(evalResult.admitted).toBe(true);
      expect(evalResult.consistencyVerified).toBe(true);
      expect(evalResult.physicalVerified).toBe(true);
    });

    it('marks physicalVerified = false when core entity is only present in AI summary/metadata', () => {
      const profile = buildQueryTokenProfile('/doc 检索口令 AD-Q8VN-6173');
      const evalResult = evaluateDocumentRelevance({
        nodeName: '测试报告.md',
        digestSummary: '本报告总结了口令 AD-Q8VN-6173 的相关测试结果',
        profile,
        contentMatches: [
          { line: 0, snippet: '[文档摘要] 本报告总结了口令 AD-Q8VN-6173 的相关测试结果', sourceKind: 'metadata_summary' as const },
        ],
        baseScore: 50,
      });

      expect(evalResult.admitted).toBe(true);
      expect(evalResult.consistencyVerified).toBe(true);
      expect(evalResult.physicalVerified).toBe(false);
    });
  });
});
