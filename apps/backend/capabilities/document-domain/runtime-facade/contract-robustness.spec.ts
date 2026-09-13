import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { ContractHtmlRendererService } from './contract-compare/contract-html-renderer.service';
import { ContractCompareService } from './contract-compare/contract-compare.service';
import { ContractLlmReviewService } from './contract-review/contract-llm-review.service';
import { ContractReviewEngineService } from './contract-review/contract-review-engine.service';
import { ContractAstParserService } from './contract-compare/contract-ast-parser.service';
import { PdfContentExtractorService } from './content-extraction/pdf-content-extractor.service';
import { ContractReviewHtmlRendererService } from './contract-review/contract-review-html-renderer.service';
import type { AlignedClausePair, ContractCompareMetrics } from './contract-compare/contract-compare.types';
import type { ContractReviewMetrics } from './contract-review/contract-review.types';

describe('Contract Robustness & High-Risk Vulnerability Fixes', () => {
  describe('[P1] Compare HTML Injection / XSS Prevention', () => {
    let renderer: ContractHtmlRendererService;

    beforeEach(() => {
      renderer = new ContractHtmlRendererService();
    });

    it('should escape malicious XSS payloads in filenames, clause titles, summaries and advice', () => {
      const maliciousFileNameA = '<script>alert("xss-A")</script>';
      const maliciousFileNameB = '"><img src=x onerror=alert("xss-B")>';
      const maliciousTitle = '<svg onload=alert("xss-title")>';
      const maliciousSummary = '<iframe src="javascript:alert(1)"></iframe>';
      const maliciousAdvice = '<b onmouseover=alert("xss-advice")>click</b>';

      const metrics: ContractCompareMetrics = {
        totalClauses: 1,
        unchangedCount: 0,
        modifiedCount: 1,
        addedCount: 0,
        deletedCount: 0,
        highRiskCount: 1,
        mediumRiskCount: 0,
        sourceClauseCount: 1,
        targetClauseCount: 1,
      };

      const alignedPairs: AlignedClausePair[] = [
        {
          id: 'pair-1',
          status: 'MODIFIED',
          similarity: 0.85,
          sourceClause: {
            id: 'c-1',
            clauseNumber: '第一条',
            title: maliciousTitle,
            content: '原条款内容',
            level: 2,
          },
          targetClause: {
            id: 'c-2',
            clauseNumber: '第一条',
            title: maliciousTitle,
            content: '修改后条款内容',
            level: 2,
          },
          aiInsight: {
            summary: maliciousSummary,
            riskLevel: 'HIGH',
            legalAdvice: maliciousAdvice,
            keyChange: '<script>keyChange</script>',
          },
        },
      ];

      const html = renderer.renderHtmlReport({
        fileNameA: maliciousFileNameA,
        fileNameB: maliciousFileNameB,
        metrics,
        alignedPairs,
      });

      // Raw unescaped dangerous tags must NOT be present
      expect(html).not.toContain('<script>alert("xss-A")</script>');
      expect(html).not.toContain('"><img src=x onerror=alert("xss-B")>');
      expect(html).not.toContain('<svg onload=alert("xss-title")>');
      expect(html).not.toContain('<iframe src="javascript:alert(1)">');
      expect(html).not.toContain('<b onmouseover=alert("xss-advice")>');
      expect(html).not.toContain('<script>keyChange</script>');

      // Properly escaped entities must be present
      expect(html).toContain('&lt;script&gt;alert(&quot;xss-A&quot;)&lt;/script&gt;');
      expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(&quot;xss-B&quot;)&gt;');
      expect(html).toContain('&lt;svg onload=alert(&quot;xss-title&quot;)&gt;');
      expect(html).toContain('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;&lt;/iframe&gt;');
    });

    it('should render prominent partial review warning banner when isTruncated is true', () => {
      const metrics: ContractCompareMetrics = {
        totalClauses: 5,
        unchangedCount: 5,
        modifiedCount: 0,
        addedCount: 0,
        deletedCount: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        isTruncated: true,
        warnings: ['超过单次处理最大页数限制，第 20 页后未被提取'],
      };

      const html = renderer.renderHtmlReport({
        fileNameA: 'A.docx',
        fileNameB: 'B.docx',
        metrics,
        alignedPairs: [],
      });

      expect(html).toContain('文档部分截断审查警示');
      expect(html).toContain('该比对文档超过单次处理页数或字符上限');
      expect(html).toContain('超过单次处理最大页数限制，第 20 页后未被提取');
    });

    it('should render truncation warning in contract review html renderer as well', () => {
      const reviewRenderer = new ContractReviewHtmlRendererService();
      const metrics: ContractReviewMetrics = {
        totalClauses: 3,
        healthScore: 80,
        highRiskCount: 0,
        mediumRiskCount: 1,
        lowRiskCount: 0,
        missingClausesCount: 0,
        passCount: 2,
        isTruncated: true,
        warnings: ['文本达到 200000 字符上限，后续内容未被审查'],
      };

      const html = reviewRenderer.renderHtmlReport({
        fileName: '长合同.pdf',
        contractType: 'general',
        contractTypeName: '商事合同',
        myPosition: 'buyer',
        metrics,
        clauses: [],
        missingClauses: [],
      });

      expect(html).toContain('文档部分截断审查警示');
      expect(html).toContain('文本达到 200000 字符上限，后续内容未被审查');
    });
  });

  describe('[P1] Compare Single Empty Document Guard', () => {
    it('should throw BadRequestException when document A has 0 clauses', async () => {
      const mockAstParser = {
        parseToAstDetailed: jest.fn<any>().mockImplementation((input: any) => {
          if (input.fileName.includes('EmptyA')) {
            return Promise.resolve({ clauses: [], metadata: { isTruncated: false } });
          }
          return Promise.resolve({
            clauses: [{ id: '1', clauseNumber: '第1条', title: '测试', content: '内容', level: 2 }],
            metadata: { isTruncated: false },
          });
        }),
      };

      const compareService = new ContractCompareService(
        mockAstParser as any,
        null as any,
        null as any,
        null as any
      );

      await expect(
        compareService.compareContracts({
          textA: 'some raw text that fails to yield clauses',
          fileNameA: 'EmptyA.docx',
          textB: '第1条 测试\n内容',
          fileNameB: 'ValidB.docx',
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        compareService.compareContracts({
          textA: 'some raw text that fails to yield clauses',
          fileNameA: 'EmptyA.docx',
          textB: '第1条 测试\n内容',
          fileNameB: 'ValidB.docx',
        })
      ).rejects.toThrow(/基准文档 .* 未能提取出有效条款/);
    });

    it('should throw BadRequestException when document B has 0 clauses', async () => {
      const mockAstParser = {
        parseToAstDetailed: jest.fn<any>().mockImplementation((input: any) => {
          if (input.fileName.includes('EmptyB')) {
            return Promise.resolve({ clauses: [], metadata: { isTruncated: false } });
          }
          return Promise.resolve({
            clauses: [{ id: '1', clauseNumber: '第1条', title: '测试', content: '内容', level: 2 }],
            metadata: { isTruncated: false },
          });
        }),
      };

      const compareService = new ContractCompareService(
        mockAstParser as any,
        null as any,
        null as any,
        null as any
      );

      await expect(
        compareService.compareContracts({
          textA: '第1条 测试\n内容',
          fileNameA: 'ValidA.docx',
          textB: 'some raw text that fails to yield clauses',
          fileNameB: 'EmptyB.docx',
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        compareService.compareContracts({
          textA: '第1条 测试\n内容',
          fileNameA: 'ValidA.docx',
          textB: 'some raw text that fails to yield clauses',
          fileNameB: 'EmptyB.docx',
        })
      ).rejects.toThrow(/比对文档 .* 未能提取出有效条款/);
    });
  });

  describe('[P1] LLM Risk Level Normalization & Safe Fallback', () => {
    let llmService: ContractLlmReviewService;

    beforeEach(() => {
      llmService = new ContractLlmReviewService();
    });

    it('should normalize critical, fatal, and Chinese high risk aliases to HIGH', () => {
      expect(llmService.normalizeRiskLevel('CRITICAL')).toBe('HIGH');
      expect(llmService.normalizeRiskLevel('fatal')).toBe('HIGH');
      expect(llmService.normalizeRiskLevel('高')).toBe('HIGH');
      expect(llmService.normalizeRiskLevel('高风险')).toBe('HIGH');
      expect(llmService.normalizeRiskLevel('严重')).toBe('HIGH');
      expect(llmService.normalizeRiskLevel('red')).toBe('HIGH');
    });

    it('should normalize warning, moderate, and Chinese medium aliases to MEDIUM', () => {
      expect(llmService.normalizeRiskLevel('warn')).toBe('MEDIUM');
      expect(llmService.normalizeRiskLevel('WARNING')).toBe('MEDIUM');
      expect(llmService.normalizeRiskLevel('中')).toBe('MEDIUM');
      expect(llmService.normalizeRiskLevel('中风险')).toBe('MEDIUM');
      expect(llmService.normalizeRiskLevel('yellow')).toBe('MEDIUM');
    });

    it('should normalize info, minor, and Chinese low aliases to LOW', () => {
      expect(llmService.normalizeRiskLevel('info')).toBe('LOW');
      expect(llmService.normalizeRiskLevel('minor')).toBe('LOW');
      expect(llmService.normalizeRiskLevel('低')).toBe('LOW');
      expect(llmService.normalizeRiskLevel('低风险')).toBe('LOW');
      expect(llmService.normalizeRiskLevel('blue')).toBe('LOW');
    });

    it('should normalize passed, ok, and Chinese pass aliases to PASS', () => {
      expect(llmService.normalizeRiskLevel('passed')).toBe('PASS');
      expect(llmService.normalizeRiskLevel('通过')).toBe('PASS');
      expect(llmService.normalizeRiskLevel('合格')).toBe('PASS');
      expect(llmService.normalizeRiskLevel('合规')).toBe('PASS');
      expect(llmService.normalizeRiskLevel('green')).toBe('PASS');
    });

    it('should return null for invalid or unrecognized levels', () => {
      expect(llmService.normalizeRiskLevel('UNKNOWN_LEVEL')).toBeNull();
      expect(llmService.normalizeRiskLevel('')).toBeNull();
      expect(llmService.normalizeRiskLevel(null)).toBeNull();
    });
  });

  describe('[P2] Party A/B and Commercial Role Decoupling', () => {
    let engine: ContractReviewEngineService;

    beforeEach(() => {
      engine = new ContractReviewEngineService(null as any, null as any, null as any, null as any, null as any);
    });

    it('should resolve party_a as seller when preamble defines Party A as 开发方/受托方', () => {
      const preamble = `
        技术开发委托合同
        甲方（开发方/受托人）：某某科技创新有限公司
        乙方（委托方/委托人）：某某贸易有限公司
        鉴于甲方具备深厚软件研发经验，乙方委托甲方进行系统研发...
      `;

      const resolvedA = engine.resolvePartyPosition('party_a', preamble, 'buyer');
      expect(resolvedA).toBe('seller');

      const resolvedB = engine.resolvePartyPosition('party_b', preamble, 'seller');
      expect(resolvedB).toBe('buyer');
    });

    it('should resolve party_a as buyer when preamble defines Party A as 委托方/采购方', () => {
      const preamble = `
        采购与服务合同
        甲方（采购方）：某某集团有限公司
        乙方（供货方）：某某制造有限公司
      `;

      const resolvedA = engine.resolvePartyPosition('party_a', preamble, 'buyer');
      expect(resolvedA).toBe('buyer');

      const resolvedB = engine.resolvePartyPosition('party_b', preamble, 'seller');
      expect(resolvedB).toBe('seller');
    });

    it('should respect direct positions buyer, seller, and neutral', () => {
      expect(engine.resolvePartyPosition('buyer', '', 'seller')).toBe('buyer');
      expect(engine.resolvePartyPosition('seller', '', 'buyer')).toBe('seller');
      expect(engine.resolvePartyPosition('both', '', 'buyer')).toBe('neutral');
    });
  });

  describe('[P2] Reject Legacy .doc and Corrupt Binary Files', () => {
    let astParser: ContractAstParserService;

    beforeEach(() => {
      astParser = new ContractAstParserService();
    });

    it('should reject legacy .doc files with OLE2 header (0xD0 0xCF 0x11 0xE0)', async () => {
      const ole2Header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const base64 = ole2Header.toString('base64');

      await expect(
        astParser.parseToAstDetailed({
          base64,
          fileName: '旧版合同.doc',
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        astParser.parseToAstDetailed({
          base64,
          fileName: '旧版合同.doc',
        })
      ).rejects.toThrow(/暂不支持旧版二进制 \.doc 格式/);
    });

    it('should reject files ending in .doc by name in text candidate lookup', async () => {
      await expect(
        astParser.parseToAstDetailed({
          text: '旧版文档.doc',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject corrupted binary files containing null bytes that are not docx or pdf', async () => {
      const corruptBinary = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x00, 0x00, 0x00]);
      const base64 = corruptBinary.toString('base64');

      await expect(
        astParser.parseToAstDetailed({
          base64,
          fileName: 'corrupted.bin',
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        astParser.parseToAstDetailed({
          base64,
          fileName: 'corrupted.bin',
        })
      ).rejects.toThrow(/不支持的未知二进制格式/);
    });
  });

  describe('[P1] Hybrid Scanned PDF Page-level OCR', () => {
    it('should detect low-text pages and trigger vision OCR only on scanned pages while preserving embedded text', async () => {
      const extractor = new PdfContentExtractorService();

      // Mock PDF.js document: Page 1 has rich embedded text; Page 2 has only 5 chars (scanned image placeholder)
      const mockDoc = {
        numPages: 2,
        getPage: jest.fn((pageNumber: number) => {
          if (pageNumber === 1) {
            return Promise.resolve({
              getTextContent: () =>
                Promise.resolve({
                  items: [{ str: '技术服务与开发合同 甲方（委托方）：企业A 乙方（受托方）：服务商B' }],
                }),
              cleanup: jest.fn(),
            });
          }
          return Promise.resolve({
            getTextContent: () =>
              Promise.resolve({
                items: [{ str: '图' }], // < 15 substantive characters -> scanned page!
              }),
            cleanup: jest.fn(),
          });
        }),
      };

      // Mock rasterizer: only rasterizes requested targetPages
      (extractor as any).rasterizer = {
        rasterizePages: jest.fn((_doc: any, _limit: any, _scale: any, targetPages: number[]) => {
          expect(targetPages).toEqual([2]); // MUST only rasterize Page 2!
          return Promise.resolve([
            { pageNumber: 2, imageBuffer: Buffer.from('fake-png'), width: 800, height: 1100 },
          ]);
        }),
      };

      // Mock vision OCR: returns extracted text for Page 2
      (extractor as any).visionOcr = {
        extractFromImages: jest.fn(() =>
          Promise.resolve({
            text: '第一条 项目开发范围与技术规范\n乙方应按技术规格书要求完成全部核心模块开发。',
            pages: [
              {
                pageNumber: 2,
                text: '第一条 项目开发范围与技术规范\n乙方应按技术规格书要求完成全部核心模块开发。',
                characterCount: 42,
              },
            ],
            modelUsed: 'gemini-2.5-flash',
            characterCount: 42,
            truncated: false,
          })
        ),
      };

      (extractor as any).extractMetadata = jest.fn(() => Promise.resolve({}));

      const result = await (extractor as any).extractDocument(mockDoc, 10, 200000, true, {
        fileBase64: 'fake',
        fileName: '混合合同.pdf',
      });

      expect(result.extraction.method).toBe('hybrid');
      expect(result.extraction.ocrUsed).toBe(true);
      expect(result.extraction.ocrModel).toBe('gemini-2.5-flash');
      expect(result.text).toContain('技术服务与开发合同 甲方（委托方）');
      expect(result.text).toContain('第一条 项目开发范围与技术规范');
      expect(result.pages.length).toBe(2);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[1].pageNumber).toBe(2);
      expect(result.warnings.some((w: string) => w.includes('混合图文版面'))).toBe(true);
    });
  });
});
