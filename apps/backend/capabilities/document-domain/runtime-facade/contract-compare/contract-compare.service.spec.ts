import { ContractAstParserService } from './contract-ast-parser.service';
import { SectionAlignerService } from './section-aligner.service';
import { CharDiffEngineService } from './char-diff-engine.service';
import { ContractHtmlRendererService } from './contract-html-renderer.service';
import { ContractCompareService } from './contract-compare.service';

describe('ContractCompareService Suite', () => {
  let astParser: ContractAstParserService;
  let sectionAligner: SectionAlignerService;
  let charDiffEngine: CharDiffEngineService;
  let htmlRenderer: ContractHtmlRendererService;
  let compareService: ContractCompareService;

  beforeEach(() => {
    astParser = new ContractAstParserService();
    sectionAligner = new SectionAlignerService();
    charDiffEngine = new CharDiffEngineService();
    htmlRenderer = new ContractHtmlRendererService();
    compareService = new ContractCompareService(
      astParser,
      sectionAligner,
      charDiffEngine,
      htmlRenderer
    );
  });

  describe('CharDiffEngineService', () => {
    it('should correctly diff identical texts', () => {
      const result = charDiffEngine.computeDiff('双方友好协商', '双方友好协商');
      expect(result.similarity).toBe(1.0);
      expect(result.sourceHtml).toBe('双方友好协商');
      expect(result.targetHtml).toBe('双方友好协商');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].type).toBe('equal');
    });

    it('should correctly highlight additions and deletions in text', () => {
      // Character level diff
      const charResult = charDiffEngine.computeDiff('工期为90个工作日', '工期为60个自然日', 'char');
      expect(charResult.similarity).toBeGreaterThan(0.5);
      expect(charResult.similarity).toBeLessThan(1.0);
      expect(charResult.sourceHtml).toContain('<del class="diff-del">9</del>');
      expect(charResult.sourceHtml).toContain('<del class="diff-del">工作</del>');
      expect(charResult.targetHtml).toContain('<ins class="diff-ins">6</ins>');
      expect(charResult.targetHtml).toContain('<ins class="diff-ins">自然</ins>');

      // Token level diff
      const tokenResult = charDiffEngine.computeDiff('工期为 90 个 工作日', '工期为 60 个 自然日', 'token');
      expect(tokenResult.sourceHtml).toContain('<del class="diff-del">90</del>');
      expect(tokenResult.targetHtml).toContain('<ins class="diff-ins">60</ins>');
    });
  });

  describe('ContractAstParserService', () => {
    it('should parse Chinese legal article numbers into AST nodes', () => {
      const text = `
第一条 项目合作宗旨
双方本着平等互利原则开展合作。

第二条 交付周期与违约责任
2.1 乙方应于90日内完成交付。
2.2 逾期每日支付千分之五违约金。

第三条 争议解决
友好协商解决。
      `.trim();

      const clauses = astParser.parseTextToClauses(text);
      expect(clauses).toHaveLength(3);
      expect(clauses[0].clauseNumber).toBe('第一条');
      expect(clauses[0].title).toBe('项目合作宗旨');
      expect(clauses[0].content).toContain('双方本着平等互利原则开展合作。');

      expect(clauses[1].clauseNumber).toBe('第二条');
      expect(clauses[1].title).toBe('交付周期与违约责任');
      expect(clauses[1].content).toContain('2.1 乙方应于90日内完成交付。');
    });

    it('should correctly parse markdown-formatted headings with ### and bold tags', () => {
      const mdText = `
# 采购开发协议
### 第一条 项目范围与合作宗旨
1.1 甲方委托乙方进行系统研发。
1.2 项目包含平台核心调度引擎部署。

### 第二条 交付周期与延期违约责任
2.1 乙方应于90个工作日内完成交付。
2.2 逾期每日支付千分之零点五违约金。

### 第三条 验收标准与测试流程
3.1 平台部署完成后10个工作日内组织初验。
      `.trim();

      const clauses = astParser.parseTextToClauses(mdText);
      expect(clauses.length).toBeGreaterThanOrEqual(3);
      const art1 = clauses.find((c) => c.clauseNumber === '第一条');
      expect(art1).toBeDefined();
      expect(art1?.title).toBe('项目范围与合作宗旨');
      expect(art1?.content).toContain('1.1 甲方委托乙方');

      const art2 = clauses.find((c) => c.clauseNumber === '第二条');
      expect(art2).toBeDefined();
      expect(art2?.title).toBe('交付周期与延期违约责任');
      expect(art2?.content).toContain('2.1 乙方应于90个工作日');
    });

    it('should decode XML entities like &#160; and format tabs and signing lines without garbling', async () => {
      const JSZip = require('jszip');
      const zip = new JSZip();
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>第一条 签署条款</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>甲方：测试公司</w:t></w:r>
      <w:r><w:tab/></w:r>
      <w:r><w:t>乙方：服务公司</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>签字：</w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>&#160;&#160;&#160;&#160;&#160;&#160;</w:t></w:r>
      <w:r><w:tab/></w:r>
      <w:r><w:t>签字：</w:t></w:r>
      <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>&#160;&#160;&#160;&#160;&#160;&#160;</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;
      zip.file('word/document.xml', documentXml);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      const clauses = await astParser.parseDocxOpenXml(buffer);
      expect(clauses.length).toBeGreaterThanOrEqual(1);
      const signClause = clauses.find((c) => c.content.includes('签字'));
      expect(signClause).toBeDefined();
      expect(signClause?.content).not.toContain('&#160;');
      expect(signClause?.blocks?.[0]?.primaryHtml).not.toContain('&amp;#160;');
      expect(signClause?.blocks?.[0]?.primaryHtml).not.toContain('&#160;');
      // Should format tabs with whitespace and signing lines with underline
      expect(signClause?.content).toContain('甲方：测试公司');
      expect(signClause?.content).toContain('乙方：服务公司');
    });
  });

  describe('SectionAlignerService', () => {
    it('should correctly align clauses including insertions and deletions', () => {
      const sourceClauses = [
        { id: 'c1', clauseNumber: '第一条', title: '定义与解释', content: '定义内容', level: 1 },
        { id: 'c2', clauseNumber: '第二条', title: '工期约定', content: '90个工作日交付', level: 1 },
        { id: 'c3', clauseNumber: '第三条', title: '争议管辖', content: '提交北京仲裁', level: 1 },
      ];

      const targetClauses = [
        { id: 't1', clauseNumber: '第一条', title: '定义与解释', content: '定义内容', level: 1 },
        { id: 't2', clauseNumber: '第二条', title: '工期约定', content: '60个日历日交付', level: 1 },
        { id: 't4', clauseNumber: '第四条', title: '开源合规', content: '禁止使用GPL协议', level: 1 },
      ];

      const aligned = sectionAligner.alignSections(sourceClauses, targetClauses);

      // c1 and t1 -> UNCHANGED
      const pair1 = aligned.find((p) => p.sourceClause?.id === 'c1');
      expect(pair1).toBeDefined();
      expect(pair1?.status).toBe('UNCHANGED');

      // c2 and t2 -> MODIFIED
      const pair2 = aligned.find((p) => p.sourceClause?.id === 'c2');
      expect(pair2).toBeDefined();
      expect(pair2?.status).toBe('MODIFIED');

      // c3 (争议管辖) -> DELETED in target
      const pairDel = aligned.find((p) => p.sourceClause?.id === 'c3');
      expect(pairDel).toBeDefined();
      expect(pairDel?.status).toBe('DELETED');

      // t4 (开源合规) -> ADDED in target
      const pairAdd = aligned.find((p) => p.targetClause?.id === 't4');
      expect(pairAdd).toBeDefined();
      expect(pairAdd?.status).toBe('ADDED');
    });
  });

  describe('ContractCompareService End-to-End', () => {
    it('should compare two contracts and produce full metrics and HTML artifact', async () => {
      const docA = `
第一条 项目范围
甲乙双方约定定制开发平台。

第二条 交付期限与违约金
乙方应于90个工作日内完成交付。如逾期按日万分之五支付违约金。

第三条 争议解决
由北京仲裁委员会仲裁。
      `.trim();

      const docB = `
第一条 项目范围
甲乙双方约定定制开发平台。

第二条 交付期限与违约金
乙方应于60个日历日内完成交付。如逾期按日千分之二支付违约金。

第四条 开源软件合规
乙方承诺不使用GPL开源代码。
      `.trim();

      const result = await compareService.compareContracts({
        textA: docA,
        fileNameA: '采购合同_v1.docx',
        textB: docB,
        fileNameB: '法务修改版_v2.pdf',
        idempotencyKey: 'test-exec-12345',
        enableRiskAnalysis: true,
      });

      expect(result.metrics.totalClauses).toBe(4);
      expect(result.metrics.unchangedCount).toBe(1);
      expect(result.metrics.modifiedCount).toBe(1);
      expect(result.metrics.addedCount).toBe(1);
      expect(result.metrics.deletedCount).toBe(1);
      expect(result.metrics.highRiskCount).toBeGreaterThanOrEqual(1);

      // Verify artifact reference
      expect(result.artifacts).toHaveLength(1);
      const artifact = result.artifacts[0];
      expect(artifact.type).toBe('document');
      expect(artifact.mimeType).toBe('text/html; charset=utf-8');
      expect(artifact.url).toContain('/renders/');
      expect(artifact.metadata?.format).toBe('html');
      expect(artifact.metadata?.sha256).toBeDefined();

      // Verify HTML content structure
      expect(result.htmlReport).toContain('合同文档智能比对与红线审查报告');
      expect(result.htmlReport).toContain('采购合同_v1.docx');
      expect(result.htmlReport).toContain('法务修改版_v2.pdf');
      expect(result.htmlReport).toContain('diff-ins');
      expect(result.htmlReport).toContain('diff-del');
      expect(result.htmlReport).toContain('AI 语义风险胶水');
    });

    it('should compare real .docx test files from tests/contract directory', async () => {
      const fs = require('fs');
      const path = require('path');

      const docxPathA = path.resolve(process.cwd(), 'tests/contract/contract_v1_baseline.docx');
      const docxPathB = path.resolve(process.cwd(), 'tests/contract/contract_v2_revised.docx');

      if (fs.existsSync(docxPathA) && fs.existsSync(docxPathB)) {
        const fileBase64A = fs.readFileSync(docxPathA).toString('base64');
        const fileBase64B = fs.readFileSync(docxPathB).toString('base64');

        const result = await compareService.compareContracts({
          fileBase64A,
          fileNameA: 'contract_v1_baseline.docx',
          fileBase64B,
          fileNameB: 'contract_v2_revised.docx',
          idempotencyKey: 'docx-real-fixture-test',
        });

        expect(result.metrics.totalClauses).toBeGreaterThan(5);
        expect(result.metrics.modifiedCount).toBeGreaterThan(0);
        expect(result.artifacts).toHaveLength(1);
        expect(result.htmlReport).toContain('合同文档智能比对与红线审查报告');
        expect(result.summary).toContain('```html');
        expect(result.summary).toContain('### ⚖️ 合同智能差异比对与风险研判完成');
      }
    });

    it('should compare real .pdf test files from tests/contract directory', async () => {
      const fs = require('fs');
      const path = require('path');

      const pdfPathA = path.resolve(process.cwd(), 'tests/contract/contract_v1_baseline.pdf');
      const pdfPathB = path.resolve(process.cwd(), 'tests/contract/contract_v2_revised.pdf');

      if (fs.existsSync(pdfPathA) && fs.existsSync(pdfPathB)) {
        const fileBase64A = fs.readFileSync(pdfPathA).toString('base64');
        const fileBase64B = fs.readFileSync(pdfPathB).toString('base64');

        const result = await compareService.compareContracts({
          fileBase64A,
          fileNameA: 'contract_v1_baseline.pdf',
          fileBase64B,
          fileNameB: 'contract_v2_revised.pdf',
          idempotencyKey: 'pdf-real-fixture-test',
        });

        expect(result.metrics.totalClauses).toBeGreaterThan(3);
        expect(result.metrics.modifiedCount).toBeGreaterThan(0);
        expect(result.metrics.highRiskCount).toBeGreaterThanOrEqual(1);
        expect(result.artifacts).toHaveLength(1);
        expect(result.htmlReport).toContain('合同文档智能比对与红线审查报告');
        expect(result.htmlReport).toContain('contract_v1_baseline.pdf');
        expect(result.htmlReport).toContain('contract_v2_revised.pdf');
      }
    });

    it('should prioritize fileBase64 even when text contains the filename string', async () => {
      const fs = require('fs');
      const path = require('path');

      const docxPathA = path.resolve(process.cwd(), 'tests/contract/contract_v1_baseline.docx');
      const docxPathB = path.resolve(process.cwd(), 'tests/contract/contract_v2_revised.docx');

      if (fs.existsSync(docxPathA) && fs.existsSync(docxPathB)) {
        const fileBase64A = fs.readFileSync(docxPathA).toString('base64');
        const fileBase64B = fs.readFileSync(docxPathB).toString('base64');

        // textA and textB are accidentally filled with filenames by parameter recognizer
        const result = await compareService.compareContracts({
          fileBase64A,
          fileNameA: 'contract_v1_baseline.docx',
          textA: 'contract_v1_baseline.docx',
          fileBase64B,
          fileNameB: 'contract_v2_revised.docx',
          textB: 'contract_v2_revised.docx',
          idempotencyKey: 'docx-precedence-test',
        });

        // Must parse full document clauses, not just 1 clause from the filename!
        expect(result.metrics.totalClauses).toBeGreaterThanOrEqual(7);
        expect(result.summary).toContain('```html');
        expect(result.summary).toContain('### ⚖️ 合同智能差异比对与风险研判完成');
        expect(result.htmlReport).toContain('<!DOCTYPE html>');
      }
    });

    it('should identify review element impairment when key elements are modified or deleted', async () => {
      const textA = `
第一条 交付周期
乙方应在合同生效后60个工作日内完成交付。

第二条 责任上限
乙方的累计违约赔偿责任以本合同总价款为上限。

第三条 源代码交付
乙方交付成果应包括完整的源代码及构建脚本。

第四条 争议解决
因本合同引起的争议向原告住所地人民法院起诉。
      `.trim();

      const textB = `
第一条 交付周期
乙方应在合同生效后60个自然日内完成交付。

第二条 责任上限
乙方对违约承担全部赔偿责任，赔偿一切间接损失。

第三条 争议解决
因本合同引起的争议友好协商。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: '基准版.txt',
        textB,
        fileNameB: '修改版.txt',
      });

      // 1. 验证修改：工作日变更为自然日 -> SOFT-03 审查要件偏离
      const deliveryPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '交付周期' || p.targetClause?.title === '交付周期'
      );
      expect(deliveryPair).toBeDefined();
      expect(deliveryPair?.status).toBe('MODIFIED');
      expect(deliveryPair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(deliveryPair?.aiInsight?.elementId).toBe('soft_calendar_day_trap');
      expect(deliveryPair?.aiInsight?.elementCode).toBe('SOFT-03');
      expect(deliveryPair?.aiInsight?.summary).toContain('自然日');

      // 2. 验证删除：源代码交付被删除 -> SOFT-01 审查要件缺失风险
      const sourceCodePair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '源代码交付'
      );
      expect(sourceCodePair).toBeDefined();
      expect(sourceCodePair?.status).toBe('DELETED');
      expect(sourceCodePair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(sourceCodePair?.aiInsight?.elementCode).toBe('SOFT-01');

      // 3. 验证高风险统计指标
      expect(result.metrics.highRiskCount).toBeGreaterThanOrEqual(2);
    });

    it('should accurately assess directional changes: favorable or non-worsening changes must NOT be marked HIGH risk', async () => {
      // 场景 1: 30 个自然日 -> 60 个工作日 (工期更充裕，有利于履约方/非风险恶化)
      // 场景 2: 每日 0.2% -> 每日 0.05% (违约金实质下调，非恶化)
      const textA = `
第一条 交付工期
乙方应在30个自然日内完成系统交付。

第二条 逾期违约金
逾期每日按合同总额0.2%支付违约金。
      `.trim();

      const textB = `
第一条 交付工期
乙方应在60个工作日内完成系统交付。

第二条 逾期违约金
逾期每日按合同总额0.05%支付违约金。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: '原版.txt',
        textB,
        fileNameB: '法务修改版.txt',
      });

      // 验证工期变动未被误报为“工期大幅缩减”或 HIGH 风险
      const deliveryPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '交付工期' || p.targetClause?.title === '交付工期'
      );
      expect(deliveryPair).toBeDefined();
      expect(deliveryPair?.status).toBe('MODIFIED');
      expect(deliveryPair?.aiInsight?.riskLevel).toBe('LOW');
      expect(deliveryPair?.aiInsight?.summary).not.toContain('工期大幅缩减');

      // 验证违约金变动未被误报为“违约金实质上调”或 HIGH 风险
      const penaltyPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '逾期违约金' || p.targetClause?.title === '逾期违约金'
      );
      expect(penaltyPair).toBeDefined();
      expect(penaltyPair?.status).toBe('MODIFIED');
      expect(penaltyPair?.aiInsight?.riskLevel).toBe('LOW');
      expect(penaltyPair?.aiInsight?.summary).not.toContain('违约金实质上调');

      // 高风险计数应为 0
      expect(result.metrics.highRiskCount).toBe(0);
    });

    it('should correctly flag HIGH risk when conditions actually deteriorate', async () => {
      // 场景 1: 60 个工作日 -> 30 个自然日 (工期被大幅压缩且落入日历日陷阱)
      // 场景 2: 每日 0.05% -> 每日 0.2% (违约金实质上调)
      const textA = `
第一条 交付工期
乙方应在60个工作日内完成系统交付。

第二条 逾期违约金
逾期每日按合同总额0.05%支付违约金。
      `.trim();

      const textB = `
第一条 交付工期
乙方应在30个自然日内完成系统交付。

第二条 逾期违约金
逾期每日按合同总额0.2%支付违约金。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: '原版.txt',
        textB,
        fileNameB: '修改版.txt',
      });

      const deliveryPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '交付工期' || p.targetClause?.title === '交付工期'
      );
      expect(deliveryPair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(deliveryPair?.aiInsight?.summary).toMatch(/工期大幅压缩|自然日|日历日/);

      const penaltyPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '逾期违约金' || p.targetClause?.title === '逾期违约金'
      );
      expect(penaltyPair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(penaltyPair?.aiInsight?.summary).toMatch(/违约金.*实质上调/);
      expect(result.metrics.highRiskCount).toBe(2);
    });

    it('should support customChecklistRules in contract compare risk analysis', async () => {
      const textA = `
第一条 服务费用
甲方应在每月5日前支付服务费。
      `.trim();

      const textB = `
第一条 服务费用
甲方应在每月25日前支付服务费。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: 'v1.txt',
        textB,
        fileNameB: 'v2.txt',
        customChecklistRules: [
          {
            id: 'custom-pay-date',
            title: '服务费支付日不得晚于每月10日',
            severity: 'HIGH',
            rule: '排查服务费支付日是否推迟至10日后',
            recommendedRevision: '建议恢复为每月5日前支付。',
          },
        ],
      });

      const feePair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '服务费用' || p.targetClause?.title === '服务费用'
      );
      expect(feePair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(feePair?.aiInsight?.summary).toContain('服务费支付日不得晚于每月10日');
      expect(feePair?.aiInsight?.legalAdvice).toContain('建议恢复为每月5日前支付。');
    });

    it('should correctly evaluate joint unit and days change: 100 calendar days to 1 working day must trigger HIGH risk', async () => {
      const textA = `
第一条 交付工期
乙方应在100个自然日内完成系统交付。
      `.trim();

      const textB = `
第一条 交付工期
乙方应在1个工作日内完成系统交付。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: 'v1.txt',
        textB,
        fileNameB: 'v2.txt',
      });

      const deliveryPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '交付工期' || p.targetClause?.title === '交付工期'
      );
      expect(deliveryPair).toBeDefined();
      expect(deliveryPair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(deliveryPair?.aiInsight?.summary).toContain('交付工期被大幅压缩');
      expect(result.metrics.highRiskCount).toBe(1);
    });

    it('should evaluate position-aware risks for added and deleted clauses', async () => {
      // 场景 1: 立场为 seller，新增乙方管辖 -> LOW 风险；新增甲方管辖 -> HIGH 风险
      const textBase = `
第一条 合作范围
双方开展软件研发合作。
      `.trim();

      const textSellerVenue = `
第一条 合作范围
双方开展软件研发合作。

第二条 争议解决
因履行本合同引起的争议，由乙方所在地人民法院管辖。
      `.trim();

      const resultSellerVenue = await compareService.compareContracts({
        textA: textBase,
        fileNameA: 'base.txt',
        textB: textSellerVenue,
        fileNameB: 'revised.txt',
        myPosition: 'seller',
      });

      const venuePairSeller = resultSellerVenue.alignedClauses.find(
        (p) => p.targetClause?.title === '争议解决'
      );
      expect(venuePairSeller?.aiInsight?.riskLevel).toBe('LOW');
      expect(venuePairSeller?.aiInsight?.summary).toContain('我方（乙方/供货方）所在地人民法院管辖');

      const textBuyerVenue = `
第一条 合作范围
双方开展软件研发合作。

第二条 争议解决
因履行本合同引起的争议，由甲方所在地人民法院管辖。
      `.trim();

      const resultBuyerVenue = await compareService.compareContracts({
        textA: textBase,
        fileNameA: 'base.txt',
        textB: textBuyerVenue,
        fileNameB: 'revised.txt',
        myPosition: 'seller',
      });

      const venuePairBuyer = resultBuyerVenue.alignedClauses.find(
        (p) => p.targetClause?.title === '争议解决'
      );
      expect(venuePairBuyer?.aiInsight?.riskLevel).toBe('HIGH');
      expect(venuePairBuyer?.aiInsight?.summary).toContain('对方（甲方）所在地人民法院管辖');

      // 场景 2: 删除源代码交付，若立场为 seller -> LOW 风险；若立场为 buyer -> HIGH 风险
      const textWithSourceCode = `
第一条 合作范围
双方开展软件研发合作。

第二条 源代码交付
乙方应向甲方交付全部未经混淆的源代码、编译构建脚本及数据库字典。
      `.trim();

      const resultDelCodeSeller = await compareService.compareContracts({
        textA: textWithSourceCode,
        fileNameA: 'base.txt',
        textB: textBase,
        fileNameB: 'revised.txt',
        myPosition: 'seller',
      });
      const delPairSeller = resultDelCodeSeller.alignedClauses.find(
        (p) => p.sourceClause?.title === '源代码交付'
      );
      expect(delPairSeller?.aiInsight?.riskLevel).toBe('LOW');
      expect(delPairSeller?.aiInsight?.summary).toContain('删除了向买方交付源代码及构建脚本的义务');

      const resultDelCodeBuyer = await compareService.compareContracts({
        textA: textWithSourceCode,
        fileNameA: 'base.txt',
        textB: textBase,
        fileNameB: 'revised.txt',
        myPosition: 'buyer',
      });
      const delPairBuyer = resultDelCodeBuyer.alignedClauses.find(
        (p) => p.sourceClause?.title === '源代码交付'
      );
      expect(delPairBuyer?.aiInsight?.riskLevel).toBe('HIGH');
      expect(delPairBuyer?.aiInsight?.summary).toContain('删除了交付成果物包含源代码与构建脚本的约定');
    });

    it('should correctly evaluate added clause with negation: excluding indirect damages should be LOW risk', async () => {
      const textBase = `
第一条 合作内容
双方开展定制软件开发。
      `.trim();

      const textWithExclusion = `
第一条 合作内容
双方开展定制软件开发。

第二条 赔偿范围
双方确认赔偿范围不包括可得利益损失、商业机会损失及任何惩罚性赔偿。
      `.trim();

      const result = await compareService.compareContracts({
        textA: textBase,
        fileNameA: 'base.txt',
        textB: textWithExclusion,
        fileNameB: 'revised.txt',
      });

      const damagesPair = result.alignedClauses.find(
        (p) => p.targetClause?.title === '赔偿范围'
      );
      expect(damagesPair).toBeDefined();
      expect(damagesPair?.aiInsight?.riskLevel).toBe('LOW');
      expect(damagesPair?.aiInsight?.summary).toContain('明确排除了间接损失');
      expect(result.metrics.highRiskCount).toBe(0);
    });

    it('should NOT misreport 1 working day -> 100 calendar days as HIGH risk (substantive relaxation)', async () => {
      const textA = `
第一条 交付工期
乙方应在1个工作日内完成系统交付。
      `.trim();

      const textB = `
第一条 交付工期
乙方应在100个自然日内完成系统交付。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: 'v1.txt',
        textB,
        fileNameB: 'v2.txt',
      });

      const deliveryPair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '交付工期' || p.targetClause?.title === '交付工期'
      );
      expect(deliveryPair).toBeDefined();
      expect(deliveryPair?.aiInsight?.riskLevel).toBe('LOW');
      expect(deliveryPair?.aiInsight?.summary).toContain('工期有所宽限');
      expect(deliveryPair?.aiInsight?.summary).not.toContain('加重延期违约风险');
      expect(result.metrics.highRiskCount).toBe(0);
    });

    it('should independently evaluate multi-dimensional changes in the same clause without swallowing risks', async () => {
      // 工期保持 30 个工作日不变，但违约金由 0.05% 上调至 0.2%
      const textA = `
第一条 交付期限与违约金
乙方应于30个工作日内完成交付。如逾期按日0.05%支付违约金。
      `.trim();

      const textB = `
第一条 交付期限与违约金
乙方应于30个工作日内完成交付。如逾期按日0.2%支付违约金。
      `.trim();

      const result = await compareService.compareContracts({
        textA,
        fileNameA: 'v1.txt',
        textB,
        fileNameB: 'v2.txt',
      });

      const pair = result.alignedClauses.find(
        (p) => p.sourceClause?.title === '交付期限与违约金' || p.targetClause?.title === '交付期限与违约金'
      );
      expect(pair).toBeDefined();
      expect(pair?.aiInsight?.riskLevel).toBe('HIGH');
      expect(pair?.aiInsight?.elementCode).toBe('COMM-02');
      expect(pair?.aiInsight?.summary).toContain('违约金费率被实质上调');
      expect(result.metrics.highRiskCount).toBe(1);
    });

    it('should strictly return uncertain (不确定) when calendarToWorkDayRatio is unconfigured, without hardcoding assumptions', () => {
      const { ReviewElementEvaluatorService, BUILTIN_REVIEW_ELEMENTS } = require('../contract-elements');
      const evaluator = new ReviewElementEvaluatorService();

      // Clone builtin elements and explicitly remove calendarToWorkDayRatio
      const customElements = BUILTIN_REVIEW_ELEMENTS.map((el: any) => {
        if (el.id === 'soft_calendar_day_trap') {
          return {
            ...el,
            thresholds: {
              ...el.thresholds,
              calendarToWorkDayRatio: undefined, // Unconfigured!
            },
          };
        }
        return el;
      });

      const pair = {
        status: 'MODIFIED' as const,
        sourceClause: { title: '工期', content: '乙方应在60个工作日内交付。' },
        targetClause: { title: '工期', content: '乙方应在60个自然日内交付。' },
      };

      const result = evaluator.evaluateDiff(pair, undefined, 'buyer', customElements);
      expect(result.riskLevel).toBe('MEDIUM');
      expect(result.summary).toContain('未配置工作日换算比例');
      expect(result.summary).toContain('无法确定实际工期是否缩水');
    });

    it('should dynamically obey configured calendarToWorkDayRatio and durationReductionToleranceRatio without code change', () => {
      const { ReviewElementEvaluatorService, BUILTIN_REVIEW_ELEMENTS } = require('../contract-elements');
      const evaluator = new ReviewElementEvaluatorService();

      // Case: configure custom ratio = 0.5 (weekend + holidays strict 50%) and custom tolerance = 0.05
      const customElements = BUILTIN_REVIEW_ELEMENTS.map((el: any) => {
        if (el.id === 'soft_calendar_day_trap') {
          return {
            ...el,
            thresholds: {
              calendarToWorkDayRatio: 0.5,
              durationReductionToleranceRatio: 0.05,
            },
          };
        }
        return el;
      });

      // 100 calendar days * 0.5 = 50 effective work days vs 55 work days (50 < 55 * 0.95 -> reduction exceeds 5%)
      const pair = {
        status: 'MODIFIED' as const,
        sourceClause: { title: '交付工期', content: '乙方应在55个工作日内交付。' },
        targetClause: { title: '交付工期', content: '乙方应在100个自然日内交付。' },
      };

      const result = evaluator.evaluateDiff(pair, undefined, 'buyer', customElements);
      expect(result.riskLevel).toBe('HIGH');
      expect(result.summary).toContain('交付工期被大幅压缩');
    });
  });

  describe('ContractHtmlRendererService & Visual Redesign', () => {
    it('should render compact overview bar and clarify counting scope', () => {
      const html = htmlRenderer.renderHtmlReport({
        fileNameA: 'contract_v1.docx',
        fileNameB: 'contract_v2.docx',
        metrics: {
          totalClauses: 10,
          modifiedCount: 6,
          addedCount: 1,
          deletedCount: 2,
          unchangedCount: 1,
          highRiskCount: 2,
          mediumRiskCount: 1,
          sourceClauseCount: 9,
          targetClauseCount: 8,
        },
        alignedPairs: [],
      });

      // 1. Check compact overview single row
      expect(html).toContain('共比对 <strong class="text-[#243041] font-semibold">10</strong> 项条款');
      expect(html).toContain('修改 <strong class="text-[#243041] font-semibold">6</strong>');
      expect(html).toContain('新增 <strong class="text-[#243041] font-semibold">1</strong>');
      expect(html).toContain('删除 <strong class="text-[#243041] font-semibold">2</strong>');
      expect(html).toContain('未变更 <strong class="text-[#64748B] font-semibold">1</strong>');

      // 2. Risk count wording & risk color
      expect(html).toContain('2 项高风险变更，建议重点复核');
      expect(html).toContain('重点关注：');
      expect(html).toContain('高风险 2 项');
      expect(html).toContain('中风险 1 项');

      // 3. Clarified scope
      expect(html).toContain('对齐后比对项数：共 10 项条款 · 基准版 9 条 / 修订版 8 条');

      // 4. No large 4-card colorful background grid
      expect(html).not.toContain('grid-cols-2 sm:grid-cols-4');
    });

    it('should render key changes in a compact table sorted by risk descending and clause order', () => {
      const mockPairs: any[] = [
        {
          id: '1',
          status: 'MODIFIED',
          sourceClause: { clauseNumber: '第 1 条', title: '项目合作宗旨', content: '宗旨内容' },
          targetClause: { clauseNumber: '第 1 条', title: '项目合作宗旨', content: '宗旨内容修改' },
          similarity: 0.95,
          aiInsight: {
            riskLevel: 'LOW',
            summary: '条款具体文本有词句修订，整体权责结构未见显著恶化。',
          },
        },
        {
          id: '2',
          status: 'MODIFIED',
          sourceClause: { clauseNumber: '第 2 条', title: '交付周期与违约责任', content: '90工作日 0.05%' },
          targetClause: { clauseNumber: '第 2 条', title: '交付周期与违约责任', content: '60自然日 0.20%' },
          similarity: 0.78,
          aiInsight: {
            riskLevel: 'HIGH',
            summary: '交付工期被大幅压缩；违约金费率被实质上调',
            keyChange: '工期：90 工作日 → 60 自然日；日违约金：0.05% → 0.20%',
            shortSummary: '工期缩短；日违约金提高',
          },
        },
        {
          id: '5',
          status: 'ADDED',
          targetClause: { clauseNumber: '第 5 条', title: '开源合规', content: 'SBOM 保证' },
          similarity: 0.0,
          aiInsight: {
            riskLevel: 'MEDIUM',
            summary: '新增了开源合规限制',
            keyChange: '新增开源许可及相关保证要求',
            shortSummary: '新增开源合规',
          },
        },
        {
          id: '8',
          status: 'DELETED',
          sourceClause: { clauseNumber: '第 8 条', title: '争议解决', content: '北京仲裁' },
          similarity: 0.0,
          aiInsight: {
            riskLevel: 'HIGH',
            summary: '删除了争议管辖条款',
            keyChange: '原争议解决条款被删除',
            shortSummary: '删除争议解决条款',
          },
        },
      ];

      const html = htmlRenderer.renderHtmlReport({
        fileNameA: 'docA',
        fileNameB: 'docB',
        metrics: {
          totalClauses: 4,
          modifiedCount: 2,
          addedCount: 1,
          deletedCount: 1,
          unchangedCount: 0,
          highRiskCount: 2,
          mediumRiskCount: 1,
        },
        alignedPairs: mockPairs,
      });

      // Table structure
      expect(html).toContain('重点关注条款与变更清单');
      expect(html).toContain('<table');
      expect(html).toContain('关键变化');
      expect(html).toContain('关注程度');

      // Key changes facts
      expect(html).toContain('工期：90 工作日 → 60 自然日；日违约金：0.05% → 0.20%');
      expect(html).toContain('原争议解决条款被删除');
      expect(html).toContain('新增开源许可及相关保证要求');

      // Verify sort order: High risks (Clause 2, then Clause 8) come BEFORE Medium risk (Clause 5)
      const posClause2 = html.indexOf('第 2 条：交付周期与违约责任');
      const posClause8 = html.indexOf('第 8 条：争议解决');
      const posClause5 = html.indexOf('第 5 条：开源合规');

      expect(posClause2).toBeGreaterThan(-1);
      expect(posClause8).toBeGreaterThan(posClause2);
      expect(posClause5).toBeGreaterThan(posClause8);
    });

    it('should decouple diff colors from risk colors, avoid emoji and harsh borders', () => {
      const mockPairs: any[] = [
        {
          id: '2',
          status: 'MODIFIED',
          sourceClause: { clauseNumber: '第 2 条', title: '交付条款', content: '90工作日' },
          targetClause: { clauseNumber: '第 2 条', title: '交付条款', content: '60自然日' },
          similarity: 0.8,
          aiInsight: {
            riskLevel: 'HIGH',
            summary: '工期缩水',
            shortSummary: '工期缩水',
          },
        },
      ];

      const html = htmlRenderer.renderHtmlReport({
        fileNameA: 'docA',
        fileNameB: 'docB',
        metrics: {
          totalClauses: 1,
          modifiedCount: 1,
          addedCount: 0,
          deletedCount: 0,
          unchangedCount: 0,
          highRiskCount: 1,
          mediumRiskCount: 0,
        },
        alignedPairs: mockPairs,
      });

      // 1. Background #F5F6F8, text #243041, link #315A7D
      expect(html).toContain('#F5F6F8');
      expect(html).toContain('#243041');
      expect(html).toContain('#315A7D');

      // 2. Ins & Del colors
      expect(html).toContain('#F0FDF4'); // ins background
      expect(html).toContain('#166534'); // ins color
      expect(html).toContain('#FEF2F2'); // del background
      expect(html).toContain('#991B1B'); // del color

      // 3. No yellow whole-card border or ring
      expect(html).not.toContain('border-amber-300 ring-1 ring-amber-100');
      expect(html).not.toContain('bg-amber-50/40');

      // 4. No red/green dots for Doc A / Doc B header
      expect(html).not.toContain('bg-rose-500');
      expect(html).not.toContain('bg-emerald-500');

      // 5. No emojis in headings
      expect(html).not.toContain('📋');
      expect(html).not.toContain('🤖');
      expect(html).not.toContain('🔴');
      expect(html).not.toContain('🟡');
      expect(html).not.toContain('🔍');

      // 6. Modified status tag is neutral blue-gray, not bright amber
      expect(html).toContain('已修改');
      expect(html).toContain('bg-[#F1F5F9]');
    });

    it('should support view switching and clean markdown typography without losing diff tags', () => {
      const mockPairs: any[] = [
        {
          id: 'preamble',
          status: 'MODIFIED',
          sourceClause: {
            clauseNumber: '前言',
            title: '合同引言',
            content: '# 采购主协议 (基准版)\n**合同编号**: SW-001\n---',
          },
          targetClause: {
            clauseNumber: '前言',
            title: '合同引言',
            content: '# 采购主协议 (修订版)\n**合同编号**: SW-001-REV\n---',
          },
          sourceHtml: '# 采购主协议 (<del class="diff-del">基准版</del>)<br>**合同编号**: SW-001<br>---',
          targetHtml: '# 采购主协议 (<ins class="diff-ins">修订版</ins>)<br>**合同编号**: SW-001<ins class="diff-ins">-REV</ins><br>---',
          similarity: 0.85,
        },
      ];

      const html = htmlRenderer.renderHtmlReport({
        fileNameA: 'docA',
        fileNameB: 'docB',
        metrics: {
          totalClauses: 1,
          modifiedCount: 1,
          addedCount: 0,
          deletedCount: 0,
          unchangedCount: 0,
          highRiskCount: 0,
          mediumRiskCount: 0,
        },
        alignedPairs: mockPairs,
      });

      // View mode buttons exist
      expect(html).toContain('id="btn-view-formatted"');
      expect(html).toContain('id="btn-view-raw"');

      // Both formatted and raw content classes are rendered
      expect(html).toContain('content-formatted');
      expect(html).toContain('content-raw');

      // Formatted view transforms markdown headers & bold & hr
      expect(html).toContain('<strong class="font-semibold text-[#243041]">合同编号</strong>');
      expect(html).toContain('<hr class="my-2.5 border-slate-200" />');

      // Raw view preserves original strings
      expect(html).toContain('content-raw hidden');

      // Diff tags inside formatted & raw are strictly preserved
      expect(html).toContain('<del class="diff-del">基准版</del>');
      expect(html).toContain('<ins class="diff-ins">修订版</ins>');
    });

    it('should generate real demo contract comparison and verify legal checklist highlights', async () => {
      const fs = require('fs');
      const path = require('path');
      const candidates = [
        path.resolve(process.cwd(), 'tests/contract/contract_v1_baseline.md'),
        path.resolve(__dirname, '../../../../../../tests/contract/contract_v1_baseline.md'),
      ];
      const foundA = candidates.find((c: string) => fs.existsSync(c));
      if (foundA) {
        const foundB = foundA.replace('contract_v1_baseline.md', 'contract_v2_revised.md');
        const textA = fs.readFileSync(foundA, 'utf8');
        const textB = fs.readFileSync(foundB, 'utf8');

        const result = await compareService.compareContracts({
          fileNameA: 'contract_v1_baseline.docx',
          fileNameB: 'contract_v2_revised.docx',
          textA,
          textB,
          myPosition: 'buyer',
        });

        expect(result.metrics.highRiskCount).toBeGreaterThanOrEqual(2);
        expect(result.htmlReport).toContain('重点关注条款与变更清单');
        expect(result.htmlReport).toContain('工期：');
        expect(result.htmlReport).toContain('原争议解决条款被删除');
        expect(result.htmlReport).toContain('新增开源许可及相关保证要求');

        const outDir = path.resolve(process.cwd(), '.tmp/renders');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'demo_diff.html'), result.htmlReport || '', 'utf8');
      }
    });

    it('should collapse 100% unchanged clauses by default and keep modified clauses expanded', () => {
      const mockPairs: any[] = [
        {
          id: 'c1',
          status: 'UNCHANGED',
          sourceClause: { clauseNumber: '第 1 条', title: '定义条款', content: '双方一致同意相关定义。' },
          targetClause: { clauseNumber: '第 1 条', title: '定义条款', content: '双方一致同意相关定义。' },
          similarity: 1.0,
        },
        {
          id: 'c2',
          status: 'MODIFIED',
          sourceClause: { clauseNumber: '第 2 条', title: '付款条款', content: '30日内支付。' },
          targetClause: { clauseNumber: '第 2 条', title: '付款条款', content: '60日内支付。' },
          similarity: 0.8,
        },
      ];

      const html = htmlRenderer.renderHtmlReport({
        fileNameA: 'docA',
        fileNameB: 'docB',
        metrics: {
          totalClauses: 2,
          modifiedCount: 1,
          addedCount: 0,
          deletedCount: 0,
          unchangedCount: 1,
          highRiskCount: 0,
          mediumRiskCount: 0,
        },
        alignedPairs: mockPairs,
      });

      // Clause 1 is UNCHANGED -> content has display: none and chevron rotated
      expect(html).toContain('id="content-sec-1" class="clause-content" style="display: none;"');
      expect(html).toContain('id="chevron-sec-1" class="text-slate-400 inline-block transform transition-transform duration-200" style="transform: rotate(-90deg);"');

      // Clause 2 is MODIFIED -> content is expanded
      expect(html).toContain('id="content-sec-2" class="clause-content" style=""');
      expect(html).toContain('id="chevron-sec-2" class="text-slate-400 inline-block transform transition-transform duration-200" style=""');

      // Toggle-all button defaults to "展开全部条款" when unchanged clauses exist
      expect(html).toContain('展开全部条款');

      // Print button calls printReport()
      expect(html).toContain('onclick="printReport()"');
      expect(html).toContain('function printReport()');

      // @media print forces all clause contents visible
      expect(html).toContain('.clause-content { display: block !important; }');
      expect(html).toContain('print-color-adjust: exact');
    });
  });
});


