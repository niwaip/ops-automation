import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { PdfContentExtractorService } from './pdf-content-extractor.service';
import { ContractAstParserService } from '../contract-compare/contract-ast-parser.service';
import { ContractReviewEngineService } from '../contract-review/contract-review-engine.service';
import { ContractTypeClassifierService } from '../contract-review/contract-type-classifier.service';
import { ContractChecklistMatrixService } from '../contract-review/contract-checklist-matrix.service';
import { ContractFormIntegrityScannerService } from '../contract-review/contract-form-integrity-scanner.service';
import { ContractLlmReviewService } from '../contract-review/contract-llm-review.service';
import { ContractReviewHtmlRendererService } from '../contract-review/contract-review-html-renderer.service';
import { ContractReviewService } from '../contract-review/contract-review.service';
import { SectionAlignerService } from '../contract-compare/section-aligner.service';
import { CharDiffEngineService } from '../contract-compare/char-diff-engine.service';
import { ContractHtmlRendererService } from '../contract-compare/contract-html-renderer.service';
import { ContractCompareService } from '../contract-compare/contract-compare.service';

function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let current = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, 'pnpm-lock.yaml')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

const WORKSPACE_ROOT = process.env.PROJECT_ROOT || findWorkspaceRoot();
const CONTRACT_DIR = path.join(WORKSPACE_ROOT, 'tests', 'contract');

const V1_CONTRACT_TEXT =
  '技术服务与开发合同\n\n' +
  '甲方（委托方）：北京天润未来科技有限公司\n' +
  '乙方（受托方）：极客智能自动化软件工程有限公司\n\n' +
  '第一条 服务内容与研发范围\n乙方根据甲方的业务需求，为甲方定制开发“企业级智能运维与自动化审查平台”系统软件，包含主编排器、多模型路由引擎、文档解析与合规诊断模块。交付形态为Docker容器镜像及完整源代码。\n\n' +
  '第二条 交付进度与验收标准\n1. 乙方应在合同签订之日起90个工作日内完成全部功能开发并交付甲方进行系统部署及联合测试。\n2. 甲方在收到交付物后10个工作日内组织专业技术人员完成验收测试；符合双方约定的技术指标的，由甲方出具书面验收合格报告。\n\n' +
  '第三条 费用金额与结算方式\n1. 本项目技术服务与定制研发费用总额为人民币500,000元整（大写：人民币伍拾万元整，含税）。\n2. 款项分三期支付：(1) 预付款30%（150,000元）；(2) 中期款40%（200,000元）；(3) 尾款30%（150,000元）。\n\n' +
  '第四条 知识产权与成果归属\n乙方为履行本合同所产生的所有软件源代码、技术文档、设计图纸及相关衍生成果的全部知识产权，自产生之日起均排他性地归甲方单独所有。乙方不得向任何第三方泄露或转让。\n\n' +
  '第五条 违约责任与赔偿限额\n任何一方违反本合同约定的，应当承担违约责任。每日应按合同总额万分之五支付违约金。违约方所承担的累计总赔偿限额不超过本合同总金额。\n\n' +
  '第六条 争议解决方式\n凡因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，任何一方均有权将争议提交北京仲裁委员会进行仲裁裁决。';

const V2_CONTRACT_TEXT =
  '技术服务与开发合同（修改版）\n\n' +
  '甲方（委托方）：北京天润未来科技有限公司\n' +
  '乙方（受托方）：极客智能自动化软件工程有限公司\n\n' +
  '第一条 服务内容与研发范围\n乙方根据甲方的业务需求，为甲方定制开发“企业级智能运维与自动化审查平台”系统软件，包含主编排器与文档解析模块。第三方开源组件与大模型服务乙方不提供任何商用稳定性担保及安全漏洞修复。\n\n' +
  '第二条 交付进度与验收标准\n1. 乙方应在合同签订之日起60个工作日内完成系统交付。\n2. 甲方在收到交付物后5个工作日内完成验收。逾期未提出明确书面异议的，视为甲方自动验收合格并认可交付质量。\n\n' +
  '第三条 费用金额与结算方式\n1. 本项目技术服务与定制研发费用总额调整为人民币450,000元整（大写：人民币肆拾伍万元整，含税）。\n2. 款项调整为两期支付：(1) 预付款50%（225,000元）；(2) 尾款50%（225,000元）。\n\n' +
  '第四条 知识产权与成果归属\n乙方为履行本合同所产生的基础架构框架与核心算法组件知识产权归乙方所有，甲方仅享有非排他的普通商用许可权；仅定制业务逻辑代码版权归甲方所有。\n\n' +
  '第五条 违约责任与赔偿限额\n若甲方迟延付款，每日应按应付未付金额的1%支付违约金；乙方延期交付免除迟延违约金。乙方对任何间接损失不承担赔偿责任，最高赔偿责任不超过已收取的首期款金额。\n\n' +
  '第六条 争议解决方式\n凡因本合同引起的或与本合同有关的任何争议，双方应友好协商解决；协商不成的，任何一方均应向乙方所在地人民法院提起诉讼管辖。';

describe('End-to-End Scanned PDF Extraction, Legal Review and Redline Comparison', () => {
  beforeEach(() => {
    process.env.DISABLE_LLM_REVIEW = 'true';
  });

  it('verifies that scanned PDF contract files exist under tests/contract', () => {
    const fileBase = path.join(CONTRACT_DIR, '技术服务与开发合同.pdf');
    const fileV1 = path.join(CONTRACT_DIR, '技术服务与开发合同_v1_扫描版.pdf');
    const fileV2 = path.join(CONTRACT_DIR, '技术服务与开发合同_v2_修改版.pdf');

    expect(fs.existsSync(fileBase)).toBe(true);
    expect(fs.existsSync(fileV1)).toBe(true);
    expect(fs.existsSync(fileV2)).toBe(true);
    expect(fs.statSync(fileBase).size).toBeGreaterThan(10000);
    expect(fs.statSync(fileV1).size).toBeGreaterThan(10000);
    expect(fs.statSync(fileV2).size).toBeGreaterThan(10000);
  });

  it('end-to-end: reads tests/contract/技术服务与开发合同.pdf and performs single-contract review via OCR', async () => {
    const pdfPath = path.join(CONTRACT_DIR, '技术服务与开发合同.pdf');
    const fileBase64 = fs.readFileSync(pdfPath).toString('base64');

    const mockVisionOcr = {
      extractFromImages: jest.fn().mockResolvedValue({
        text: V1_CONTRACT_TEXT,
        pages: [{ pageNumber: 1, text: V1_CONTRACT_TEXT, characterCount: V1_CONTRACT_TEXT.length }],
        modelUsed: 'gemini-3.7-flash-high',
        characterCount: V1_CONTRACT_TEXT.length,
        truncated: false,
      }),
    };

    const extractorService = new PdfContentExtractorService(undefined, mockVisionOcr as any);
    const astParser = new ContractAstParserService(extractorService);
    const classifier = new ContractTypeClassifierService();
    const checklistMatrix = new ContractChecklistMatrixService();
    const formScanner = new ContractFormIntegrityScannerService();
    const llmReview = new ContractLlmReviewService();

    const engine = new ContractReviewEngineService(
      astParser,
      classifier,
      checklistMatrix,
      formScanner,
      llmReview
    );

    const htmlRenderer = new ContractReviewHtmlRendererService();
    const reviewService = new ContractReviewService(engine, htmlRenderer);

    const result = await reviewService.reviewContract({
      fileBase64,
      fileName: '技术服务与开发合同.pdf',
      contractType: 'software_development',
      myPosition: 'buyer',
    });

    expect(result.summary).toContain('合同智能合规审查与风险诊断完成');
    expect(result.contractType).toBe('software_development');
    expect(result.contractTypeName).toContain('软件定制研发');
    expect(result.clauses.length).toBeGreaterThanOrEqual(6);
    expect(result.metrics.totalClauses).toBeGreaterThanOrEqual(6);
    expect(result.artifact).toBeDefined();
    expect(result.artifact?.mimeType).toContain('text/html');
    expect(result.htmlReport).toContain('技术服务与开发合同.pdf');
    expect(result.htmlReport).toContain('知识产权与成果归属');
  });

  it('end-to-end: compares tests/contract/技术服务与开发合同_v1_扫描版.pdf and 技术服务与开发合同_v2_修改版.pdf and generates side-by-side diff report', async () => {
    const pdfPathA = path.join(CONTRACT_DIR, '技术服务与开发合同_v1_扫描版.pdf');
    const pdfPathB = path.join(CONTRACT_DIR, '技术服务与开发合同_v2_修改版.pdf');

    const fileBase64A = fs.readFileSync(pdfPathA).toString('base64');
    const fileBase64B = fs.readFileSync(pdfPathB).toString('base64');

    const mockVisionOcr = {
      extractFromImages: jest.fn().mockImplementation(
        async (
          _pages: Array<{ pageNumber: number; imageBuffer: Buffer }>,
          options?: { fileName?: string }
        ) => {
          const isFileV2 =
            options?.fileName?.includes('v2') || options?.fileName?.includes('修改版');
          const text = isFileV2 ? V2_CONTRACT_TEXT : V1_CONTRACT_TEXT;
          return {
            text,
            pages: [{ pageNumber: 1, text, characterCount: text.length }],
            modelUsed: 'gemini-3.7-flash-high',
            characterCount: text.length,
            truncated: false,
          };
        }
      ),
    };

    const extractorService = new PdfContentExtractorService(undefined, mockVisionOcr as any);
    const astParser = new ContractAstParserService(extractorService);
    const sectionAligner = new SectionAlignerService();
    const charDiffEngine = new CharDiffEngineService();
    const htmlRenderer = new ContractHtmlRendererService();

    const compareService = new ContractCompareService(
      astParser,
      sectionAligner,
      charDiffEngine,
      htmlRenderer
    );

    const compareResult = await compareService.compareContracts({
      fileBase64A,
      fileNameA: '技术服务与开发合同_v1_扫描版.pdf',
      fileBase64B,
      fileNameB: '技术服务与开发合同_v2_修改版.pdf',
      myPosition: 'buyer',
      idempotencyKey: 'scanned-pdf-compare-e2e',
    });

    // Verify comparison metrics and findings
    expect(compareResult.metrics.totalClauses).toBeGreaterThanOrEqual(6);
    expect(compareResult.metrics.modifiedCount).toBeGreaterThanOrEqual(4);
    expect(compareResult.metrics.highRiskCount).toBeGreaterThanOrEqual(1);

    // Verify generated comparison artifacts
    expect(compareResult.artifacts).toHaveLength(1);
    expect(compareResult.artifacts[0].name).toContain('合同比对报告');
    expect(compareResult.htmlReport).toContain('合同文档智能比对与红线审查报告');
    expect(compareResult.htmlReport).toContain('技术服务与开发合同_v1_扫描版.pdf');
    expect(compareResult.htmlReport).toContain('技术服务与开发合同_v2_修改版.pdf');
    expect(compareResult.htmlReport).toContain('diff-ins');
    expect(compareResult.htmlReport).toContain('diff-del');
  });
});
