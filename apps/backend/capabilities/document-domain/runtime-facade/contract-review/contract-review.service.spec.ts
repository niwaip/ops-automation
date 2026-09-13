import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContractTypeClassifierService } from './contract-type-classifier.service';
import { ContractChecklistMatrixService } from './contract-checklist-matrix.service';
import { ContractFormIntegrityScannerService } from './contract-form-integrity-scanner.service';
import { ContractLlmReviewService } from './contract-llm-review.service';
import { ContractReviewEngineService } from './contract-review-engine.service';
import { ContractReviewHtmlRendererService } from './contract-review-html-renderer.service';
import { ContractReviewService } from './contract-review.service';

describe('Contract Review System', () => {
  let classifier: ContractTypeClassifierService;
  let checklistMatrix: ContractChecklistMatrixService;
  let formScanner: ContractFormIntegrityScannerService;
  let llmReview: ContractLlmReviewService;
  let engine: ContractReviewEngineService;
  let htmlRenderer: ContractReviewHtmlRendererService;
  let reviewService: ContractReviewService;

  const mockAstParser = {
    parseToAst: jest.fn(),
  };

  beforeEach(() => {
    process.env.DISABLE_LLM_REVIEW = 'true';
    classifier = new ContractTypeClassifierService();
    checklistMatrix = new ContractChecklistMatrixService();
    formScanner = new ContractFormIntegrityScannerService();
    llmReview = new ContractLlmReviewService();
    engine = new ContractReviewEngineService(
      mockAstParser as any,
      classifier,
      checklistMatrix,
      formScanner,
      llmReview
    );
    htmlRenderer = new ContractReviewHtmlRendererService();
    reviewService = new ContractReviewService(engine, htmlRenderer);
  });


  describe('ContractTypeClassifierService', () => {
    it('should correctly classify NDA from filename or content', () => {
      const result = classifier.classify('保密协议_202605200707.docx', '');
      expect(result.type).toBe('nda');
      expect(result.displayName).toContain('商业保密协议');
    });

    it('should correctly classify software dev contract', () => {
      const result = classifier.classify('企业智能运维平台定制研发主协议.docx', '包含平台核心调度引擎部署');
      expect(result.type).toBe('software_development');
      expect(result.displayName).toContain('软件定制研发');
    });

    it('should allow explicit override and normalize legacy aliases', () => {
      const result = classifier.classify('任意文件.docx', '', 'nda');
      expect(result.type).toBe('nda');

      const devResult = classifier.classify('任意文件.docx', '', 'software_dev');
      expect(devResult.type).toBe('software_development');

      const standardDevResult = classifier.classify('任意文件.docx', '', 'software_development');
      expect(standardDevResult.type).toBe('software_development');

      const laborResult = classifier.classify('任意文件.docx', '', 'labor');
      expect(laborResult.type).toBe('employment');

      const employmentResult = classifier.classify('任意文件.docx', '', 'employment');
      expect(employmentResult.type).toBe('employment');
    });
  });

  describe('ContractReviewEngineService', () => {
    it('should identify high risk on perpetual duration and detect missing NDA exceptions', async () => {
      const sampleNdaClauses = [
        {
          clauseNumber: '第一条',
          title: '保密信息范围',
          content: '本协议项下的保密信息指披露方向接收方披露的一切技术、商务信息。',
        },
        {
          clauseNumber: '第二条',
          title: '保密期限与义务',
          content: '接收方的保密义务在无论本协议终止与否均永久有效，接收方必须永远承担保密责任。',
        },
        {
          clauseNumber: '第三条',
          title: '违约责任',
          content: '若接收方违约，应向披露方支付违约金人民币五百万元整，并承担全部惩罚性赔偿责任。',
        },
      ];

      mockAstParser.parseToAst.mockResolvedValue(sampleNdaClauses);

      const result = await reviewService.reviewContract({
        fileName: '保密协议_202605200707.docx',
        text: 'dummy text',
        myPosition: 'buyer',
      });

      expect(result.contractType).toBe('nda');
      expect(result.metrics.highRiskCount).toBeGreaterThanOrEqual(1);

      // Check second clause (perpetual duration)
      const durationClause = result.clauses[1];
      expect(durationClause.riskLevel).toBe('HIGH');
      expect(durationClause.riskSummary).toContain('永久');
      expect(durationClause.recommendedRevision).toBeDefined();

      // Check missing clause detection (missing statutory exceptions)
      const missingExceptions = result.missingClauses.find(
        (m) => m.id === 'missing_nda_exceptions'
      );
      expect(missingExceptions).toBeDefined();
      expect(missingExceptions?.severity).toBe('HIGH');

      // Check HTML report generated
      expect(result.htmlReport).toContain('<!DOCTYPE html>');
      expect(result.htmlReport).toContain('合同智能审查与合规诊断报告');
      expect(result.htmlReport).toContain('缺失必备保护条款');
      expect(result.htmlReport).toContain('综合合规评级');

      // Check summary format has embedded html block for HtmlPreviewBlock rendering
      expect(result.summary).toContain('```html');
      expect(result.summary).toContain('### ⚖️ 合同智能合规审查与风险诊断完成');
      expect(result.summary).toContain('🔗 **[👉 点击在新窗口打开全屏审查报告]');
      expect(result.artifact).toBeDefined();
      expect(result.artifact?.url).toContain('.html');
    });

    it('should automatically resolve document payload from taskContext references when fileBase64 and text are absent', async () => {
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '保密信息',
          content: '本协议项下的保密信息包括甲方披露的商业秘密。',
        },
      ]);

      const result = await reviewService.reviewContract({
        taskContext: {
          references: [
            {
              kind: 'session_result',
              semanticType: 'document',
              detailText: '保密协议已成功生成\n* **下载链接**：http://192.168.100.143:3009/studio/download/b19a51ab-b321-431b-a6fe-43b204c1265d',
              structuredData: {
                result: {
                  fileName: '保密合同_202609121550.docx',
                  downloadUrl: 'http://192.168.100.143:3009/studio/download/b19a51ab-b321-431b-a6fe-43b204c1265d',
                },
              },
            },
          ],
        },
      });

      expect(result).toBeDefined();
      expect(result.contractType).toBe('nda');
      expect(mockAstParser.parseToAst).toHaveBeenCalled();
      const calledArg = mockAstParser.parseToAst.mock.calls[mockAstParser.parseToAst.mock.calls.length - 1][0];
      expect(calledArg.base64).toBeDefined();
      expect(calledArg.base64.length).toBeGreaterThan(0);
      expect(calledArg.fileName).toBe('保密合同_202609121550.docx');
    });

    it('should not falsely report missing exception clause when contract already has an explicit exception clause', async () => {
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '保密信息范围',
          content: '包括所有业务数据、技术方案与商业秘密。',
        },
        {
          clauseNumber: '第四条',
          title: '例外情况',
          content: '4.1 上述保密信息不包括披露前已为接收方掌握、非因接收方过错而已为公众知悉、从第三方合法取得、接收方独立研发的信息。4.2 若依据法律法规要求披露，接收方应提前通知。',
        },
      ]);

      const result = await reviewService.reviewContract({
        fileName: '标准保密协议.docx',
        contractType: 'nda',
      });

      // The contract explicitly has Article 4: 例外情况, so it must not be flagged as missing
      const missingExceptions = result.missingClauses.find(
        (m) => m.id === 'missing_nda_exceptions'
      );
      expect(missingExceptions).toBeUndefined();
    });

    it('should dynamically evaluate and prioritize custom checkpoints', async () => {
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '违约金与赔偿约定',
          content: '如发生违约，违约方应支付合同总金额15%作为违约金。',
        },
      ]);

      const result = await reviewService.reviewContract({
        fileName: '测试合作协议.docx',
        contractType: 'general',
        customCheckpoints: [
          {
            id: 'custom-penalty-cap',
            title: '违约金比例不得高于10%',
            severity: 'HIGH',
            rule: '排查违约金比例是否超过合同总金额10%',
            recommendedRevision: '违约金比例不得超过合同总金额的10%。',
          },
        ],
      });

      expect(result.clauses[0].riskLevel).toBe('HIGH');
      expect(result.clauses[0].riskSummary).toContain('违约金比例不得高于10%');
      expect(result.clauses[0].recommendedRevision).toBe('违约金比例不得超过合同总金额的10%。');
    });

    it('should render DocumentBlocks and group into universal structural divisions', async () => {
      const complexClauses = [
        {
          clauseNumber: '前言',
          title: '合同引言与主体信息',
          chapterNumber: '第一分部',
          chapterTitle: '签约主体与合作引言',
          content: '签订日期：2026年03月04日',
          blocks: [
            {
              id: 'b0',
              type: 'bilingual_pair',
              primaryText: '技术服务合同',
              secondaryText: '技術サービス契約',
              primaryLang: 'zh',
              secondaryLang: 'ja',
            },
            {
              id: 'b1',
              type: 'key_value_grid',
              metadata: [
                { key: '合同编号', value: 'HT-2026-001' },
                { key: '签订日期', value: '2026年03月04日' },
              ],
            },
          ],
        },
        {
          clauseNumber: '第一条',
          title: '技术服务内容、方式',
          chapterNumber: '第二分部',
          chapterTitle: '标的履行与结算条款',
          content: '本合同项下之技术服务内容...',
          blocks: [
            {
              id: 'b2',
              type: 'paragraph',
              primaryText: '本合同项下之技术服务内容详见附件一',
            },
          ],
        },
        {
          clauseNumber: '第二条',
          title: '知识产权与保密条款',
          chapterNumber: '第三分部',
          chapterTitle: '合规风控与知识产权',
          content: '双方对涉及的技术秘密承担严格保密义务。',
          blocks: [
            {
              id: 'b3',
              type: 'bilingual_pair',
              primaryText: '双方对涉及的技术秘密承担严格保密义务。',
              secondaryText: '双方は技術上の秘密について厳格な機密保持義務を负う。',
              primaryLang: 'zh',
              secondaryLang: 'ja',
            },
          ],
        },
        {
          clauseNumber: '第三条',
          title: '违约责任与争议解决',
          chapterNumber: '第四分部',
          chapterTitle: '违约救济与效力附则',
          content: '凡因履行本合同产生的争议均应通过协商解决。',
        },
        {
          clauseNumber: '附件',
          title: '附件一 服务规格书',
          chapterNumber: '第五分部',
          chapterTitle: '附随文件与规格清单',
          content: '服务规格书清单',
        },
      ];

      mockAstParser.parseToAst.mockResolvedValue(complexClauses);

      const result = await reviewService.reviewContract({
        fileName: '技术服务合同_中日语双语版.docx',
        contractType: 'software_dev',
        myPosition: 'buyer',
      });

      // Verify universal 5-division chapter outline
      expect(result.chapters).toBeDefined();
      expect(result.chapters!.length).toBe(5);
      expect(result.chapters![0].chapterTitle).toContain('签约主体与合作引言');
      expect(result.chapters![1].chapterTitle).toContain('标的履行与结算条款');
      expect(result.chapters![2].chapterTitle).toContain('合规风控与知识产权');
      expect(result.chapters![3].chapterTitle).toContain('违约救济与效力附则');
      expect(result.chapters![4].chapterTitle).toContain('附随文件与规格清单');

      // Verify HTML report renders DocumentBlock elements in continuous paper format
      expect(result.htmlReport).toContain('bilingual-pair');
      expect(result.htmlReport).toContain('lang-primary');
      expect(result.htmlReport).toContain('lang-secondary');
      expect(result.htmlReport).toContain('metadata-grid');
      expect(result.htmlReport).toContain('HT-2026-001');
    });
  });

  describe('Perspective 1: ContractFormIntegrityScannerService', () => {
    it('should detect template variables {d.partyA.name} and missing entities in preamble', () => {
      const preambleText =
        '鉴于位于{d.partyA.address}的{d.partyA.name}公司(以下称为“甲方”)与位于{d.partyB.address}的富士通(中国)信息系统有限公司(以下称为“乙方”)就有关{d.cooperation.subject}合作过程中，透露方需要向接收方公开专有信息。';
      const scanResult = formScanner.scanClause(preambleText, '合同引言与签约主体', 0);

      expect(scanResult.status).toBe('WARNING');
      expect(scanResult.unfilledVariables).toEqual(
        expect.arrayContaining([
          '{d.partyA.address}',
          '{d.partyA.name}',
          '{d.partyB.address}',
          '{d.cooperation.subject}',
        ])
      );
      expect(scanResult.summary).toContain('未替换模板变量');
      expect(scanResult.missingEntities).toContain('统一社会信用代码/企业注册代码');
    });


    it('should detect unfilled underlines and blanks', () => {
      const text = '合同签订日期：________年____月____日，签约地点：(        )。';
      const scanResult = formScanner.scanClause(text, '签约日期', 5);

      expect(scanResult.unfilledBlanksCount).toBeGreaterThanOrEqual(2);
      expect(scanResult.summary).toContain('下划线/括号待填留白');
    });

    it('should validate USCC 18-digit code GB 32100-2015 checksum', () => {
      // 91310000775785552L is valid USCC
      const validText = '甲方统一社会信用代码：91310000775785552L';
      const validResult = formScanner.scanClause(validText, '主体信息', 0);
      expect(validResult.formatIssues.length).toBe(0);

      // Tampered checksum (W is invalid check code)
      const invalidText = '甲方统一社会信用代码：91310000775785552W';
      const invalidResult = formScanner.scanClause(invalidText, '主体信息', 0);
      expect(invalidResult.formatIssues.length).toBeGreaterThan(0);
      expect(invalidResult.formatIssues[0]).toContain('校验码异常');
    });
  });


  describe('Perspective 2: ContractLlmReviewService', () => {
    it('should provide tailored advice and redline revision for preamble with unfilled variables', async () => {
      const preambleText =
        '鉴于位于{d.partyA.address}的{d.partyA.name}公司与位于{d.partyB.address}的乙方开展合作。';
      const formIntegrity = formScanner.scanClause(preambleText, '合同引言', 0);

      const review = await llmReview.reviewClause({
        clauseIndex: 0,
        clauseNumber: '前言',
        clauseTitle: '合同引言与签约主体',
        clauseText: preambleText,
        contractType: 'nda',
        contractTypeName: '商业保密协议',
        myPosition: 'buyer',
        matchedRules: [],
        formIntegrity,
      });

      expect(review.riskLevel).toBe('MEDIUM');
      expect(review.riskSummary).toContain('未填充模板参数');
      expect(review.legalAdvice).toContain('主体资格争议');
      expect(review.recommendedRevision).toBeDefined();
      expect(review.recommendedRevision).toContain('【需填写：');
    });

    it('should tailor advice according to buyer vs seller position on substantive clause', async () => {
      const clauseText = '因不可抗力导致合同无法履行的，双方互不承担违约责任。';
      const rule = {
        id: 'mock_rule',
        category: '违约',
        title: '不可抗力条款',
        severity: 'MEDIUM' as const,
        riskSummary: '需防范免责滥用',
        legalAdvice: '应明确通知时限与减损义务',
        matcher: () => true,
        recommendRevision: (t: string) => t + '（受影响方应在3日内提供公证证明）。',
      };

      const buyerReview = await llmReview.reviewClause({
        clauseIndex: 3,
        clauseNumber: '第三条',
        clauseTitle: '不可抗力',
        clauseText,
        contractType: 'software_dev',
        contractTypeName: '软件定制研发',
        myPosition: 'buyer',
        matchedRules: [rule],
      });
      expect(buyerReview.legalAdvice).toContain('买方');

      const sellerReview = await llmReview.reviewClause({
        clauseIndex: 3,
        clauseNumber: '第三条',
        clauseTitle: '不可抗力',
        clauseText,
        contractType: 'software_dev',
        contractTypeName: '软件定制研发',
        myPosition: 'seller',
        matchedRules: [rule],
      });
      expect(sellerReview.legalAdvice).toContain('卖方');
    });
  });

  describe('Review Elements & Fact Extractor Integration', () => {
    it('should accurately extract structured legal facts from clauses', () => {
      const { ReviewFactExtractorService } = require('../contract-elements');
      const factExtractor = new ReviewFactExtractorService();

      // 1. 工期事实抽取
      const deliveryFacts = factExtractor.extractClauseFacts(
        '乙方应在自签署日起60个自然日内完成系统部署上线。',
        '第二条 交付周期'
      );
      expect(deliveryFacts.deliveryDayType).toBe('calendar_day');
      expect(deliveryFacts.deliveryDays).toBe(60);

      // 2. 保密期限事实抽取
      const ndaFacts = factExtractor.extractClauseFacts(
        '本协议项下保密义务永久有效，无论协议终止与否均持续承担保密责任。',
        '保密期限'
      );
      expect(ndaFacts.isPerpetualDuration).toBe(true);
      expect(ndaFacts.isTradeSecretSurvivalDifferentiated).toBe(false);

      // 3. 责任上限事实抽取
      const capFacts = factExtractor.extractClauseFacts(
        '乙方的累计违约赔偿责任以合同总额的20%为最高限额。',
        '责任限制'
      );
      expect(capFacts.hasLiabilityCap).toBe(true);
      expect(capFacts.liabilityCapType).toBe('percentage');
      expect(capFacts.capPercentage).toBe(20);

      // 4. 争议管辖事实抽取
      const forumFacts = factExtractor.extractClauseFacts(
        '因本合同引起的争议，由乙方所在地有管辖权的人民法院审理。',
        '管辖法院'
      );
      expect(forumFacts.forumType).toBe('court');
      expect(forumFacts.forumLocation).toBe('seller_venue');

      // 5. 知识产权归属事实抽取
      const ipFacts = factExtractor.extractClauseFacts(
        '定制研发形成的源代码著作权归开发方所有，仅许可甲方使用。',
        '知识产权归属'
      );
      expect(ipFacts.ipOwnershipType).toBe('supplier_retained');

      // 6. 付款前置事实抽取
      const payFacts = factExtractor.extractClauseFacts(
        '待甲方内部审计完成后15日内支付尾款。',
        '付款结算'
      );
      expect(payFacts.isPaymentTiedToInternalAudit).toBe(true);
    });

    it('should enforce software development review elements and detect missing essential deliverables', async () => {
      const softClauses = [
        {
          clauseNumber: '第一条',
          title: '交付工期与进度',
          content: '乙方应在90个自然日内完成全部功能开发及交付。',
        },
        {
          clauseNumber: '第二条',
          title: '知识产权与成果权属',
          content: '定制开发的全部软件源代码与成果物著作权归开发方所有，甲方享有非排他许可使用权。',
        },
        {
          clauseNumber: '第三条',
          title: '验收与试运行',
          content: '系统上线运行3日后无异议即视为验收合格。',
        },
        {
          clauseNumber: '第四条',
          title: '付款账期与结算',
          content: '本期开发款经甲方内部审计完成后30日内支付。',
        },
      ];

      mockAstParser.parseToAst.mockResolvedValue(softClauses);

      const result = await reviewService.reviewContract({
        fileName: '智能软件定制开发项目合同.docx',
        contractType: 'software_development',
        myPosition: 'buyer',
      });

      expect(result.contractType).toBe('software_development');
      expect(result.metrics.highRiskCount).toBeGreaterThanOrEqual(2);

      // 1. 验证工期日历日陷阱要件命中 (SOFT-03)
      const dayTrapClause = result.clauses.find((c) => c.title.includes('交付工期'));
      expect(dayTrapClause).toBeDefined();
      expect(dayTrapClause?.riskLevel).toBe('HIGH');
      expect(dayTrapClause?.elementCode).toBe('SOFT-03');
      expect(dayTrapClause?.elementId).toBe('soft_calendar_day_trap');
      expect(dayTrapClause?.recommendedRevision).toContain('工作日');

      // 2. 验证知识产权归属保留要件命中 (SOFT-02)
      const ipClause = result.clauses.find((c) => c.title.includes('知识产权'));
      expect(ipClause).toBeDefined();
      expect(ipClause?.riskLevel).toBe('HIGH');
      expect(ipClause?.elementCode).toBe('SOFT-02');
      expect(ipClause?.elementId).toBe('soft_ip_ownership_retained');
      expect(ipClause?.recommendedRevision).toContain('独家归甲方所有');

      // 3. 验证必备要件缺失排查：检测缺失源代码交付 (SOFT-01) 与缺失第三方侵权担保 (SOFT-05)
      const missingSource = result.missingClauses.find(
        (m) => m.elementCode === 'SOFT-01' || m.id === 'missing_source_code_delivery'
      );
      expect(missingSource).toBeDefined();
      expect(missingSource?.severity).toBe('HIGH');
      expect(missingSource?.title).toContain('源代码');

      const missingIndemnity = result.missingClauses.find(
        (m) => m.elementCode === 'SOFT-05' || m.id === 'missing_thirdparty_infringement_indemnity'
      );
      expect(missingIndemnity).toBeDefined();
      expect(missingIndemnity?.severity).toBe('HIGH');
      expect(missingIndemnity?.title).toContain('第三方知识产权侵权');
    });
  });

  describe('Six Core Issue Regression Tests', () => {
    it('[P1 Issue 1] should accept custom rules from both customChecklistRules and legacy customCheckpoints', async () => {
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '质保与维保',
          content: '系统终验后提供3个月免费维保。',
        },
      ]);

      // Test 1: customChecklistRules (Skill manifest standard)
      const res1 = await reviewService.reviewContract({
        fileName: '测试服务协议.docx',
        contractType: 'general',
        customChecklistRules: [
          {
            id: 'custom-warranty-min-1yr',
            title: '质保期不得低于1年',
            severity: 'HIGH',
            rule: '排查质保期维保期是否低于1年',
            recommendedRevision: '系统终验后应提供不少于12个月的免费维保。',
          },
        ],
      });
      expect(res1.clauses[0].riskLevel).toBe('HIGH');
      expect(res1.clauses[0].riskSummary).toContain('质保期不得低于1年');

      // Test 2: customCheckpoints (Legacy compatibility)
      const res2 = await reviewService.reviewContract({
        fileName: '测试服务协议.docx',
        contractType: 'general',
        customCheckpoints: [
          {
            id: 'custom-warranty-min-1yr',
            title: '质保期不得低于1年',
            severity: 'HIGH',
            rule: '排查质保期维保期是否低于1年',
            recommendedRevision: '系统终验后应提供不少于12个月的免费维保。',
          },
        ],
      });
      expect(res2.clauses[0].riskLevel).toBe('HIGH');
      expect(res2.clauses[0].riskSummary).toContain('质保期不得低于1年');
    });

    it('[P1 Issue 3] should filter rules by applicablePosition (buyer vs seller) and isolate general from employment', async () => {
      const softClauses = [
        {
          clauseNumber: '第一条',
          title: '结算付款',
          content: '项目款项经甲方内部审计完成后30日内支付。',
        },
      ];
      mockAstParser.parseToAst.mockResolvedValue(softClauses);

      // 1. Buyer position (采购方/甲方):
      // - SOFT-01 (missing source code) MUST be flagged because buyer needs code
      // - SOFT-06 (internal audit) is NOT a risk for buyer (it is buyer's own audit)
      const buyerResult = await reviewService.reviewContract({
        fileName: '软件开发协议.docx',
        contractType: 'software_development',
        myPosition: 'buyer',
      });
      const buyerSourceMissing = buyerResult.missingClauses.find(
        (m) => m.id === 'missing_source_code_delivery'
      );
      expect(buyerSourceMissing).toBeDefined();
      expect(buyerResult.clauses[0].elementId).not.toBe('soft_payment_tied_to_internal_audit');

      // 2. Seller position (受托方/乙方):
      // - SOFT-01 (missing source code) MUST NOT be flagged (seller does not demand code from themselves)
      // - SOFT-06 (internal audit) MUST be flagged as HIGH risk (payment delayed by client internal audit)
      const sellerResult = await reviewService.reviewContract({
        fileName: '软件开发协议.docx',
        contractType: 'software_development',
        myPosition: 'seller',
      });
      const sellerSourceMissing = sellerResult.missingClauses.find(
        (m) => m.id === 'missing_source_code_delivery'
      );
      expect(sellerSourceMissing).toBeUndefined();
      expect(sellerResult.clauses[0].riskLevel).toBe('HIGH');
      expect(sellerResult.clauses[0].elementId).toBe('soft_payment_tied_to_internal_audit');

      // 3. Employment contract isolation:
      // Commercial general rules like COMM-01 (court litigation) must NOT be applied to employment contracts
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '劳动争议解决',
          content: '发生劳动争议由用人单位所在地人民法院管辖诉讼。',
        },
      ]);
      const empResult = await reviewService.reviewContract({
        fileName: '员工劳动合同.docx',
        contractType: 'employment',
        myPosition: 'buyer',
      });
      const comm01Hit = empResult.clauses.find(
        (c) => c.elementId === 'comm_dispute_unfavorable_forum' || c.elementCode === 'COMM-01'
      );
      expect(comm01Hit).toBeUndefined();
    });

    it('[P1 Issue 4] should detect explicit negations in missing clause detectors (e.g. 乙方不交付源代码)', async () => {
      // 合同虽然出现了“源代码”词汇，但明确约定“乙方不交付源代码”
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '交付标的物',
          content: '乙方仅交付编译后的二进制可执行程序。明确约定：乙方不交付任何源代码及构建脚本。',
        },
      ]);

      const result = await reviewService.reviewContract({
        fileName: '软件定制合同.docx',
        contractType: 'software_development',
        myPosition: 'buyer',
      });

      const missingSourceAlert = result.missingClauses.find(
        (m) => m.id === 'missing_source_code_delivery' || m.elementCode === 'SOFT-01'
      );
      expect(missingSourceAlert).toBeDefined();
      expect(missingSourceAlert?.severity).toBe('HIGH');
    });

    it('[P1 Issue 4] should require multi-item statutory coverage for NDA exceptions', async () => {
      // 场景 1: 仅提到“独立研发”，缺少公知公用、监管法定强制披露等法定除外情形 -> 判定缺失 (触发告警)
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '保密信息除外情形',
          content: '保密信息不包含由接收方独立研发且未使用披露方保密信息的技术成果。',
        },
      ]);

      const resIncomplete = await reviewService.reviewContract({
        fileName: '保密协议.docx',
        contractType: 'nda',
      });
      const missingIncomplete = resIncomplete.missingClauses.find(
        (m) => m.id === 'missing_nda_exceptions'
      );
      expect(missingIncomplete).toBeDefined();
      expect(missingIncomplete?.severity).toBe('HIGH');

      // 场景 2: 仅覆盖 4 项除外（缺少“独立研发”）-> 判定缺失 (触发告警)
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '保密信息除外情形',
          content:
            '保密信息不包括以下情形：1. 非因接收方违约已进入公知领域的公开信息；2. 在披露前已为接收方合法掌握占有的信息；3. 接收方从对其不负保密义务的第三方合法获得的信息；4. 依照国家法律法规或司法监管机构指令必须强制披露的信息。',
        },
      ]);
      const resIncomplete4 = await reviewService.reviewContract({
        fileName: '保密协议.docx',
        contractType: 'nda',
      });
      const missing4 = resIncomplete4.missingClauses.find((m) => m.id === 'missing_nda_exceptions');
      expect(missing4).toBeDefined();

      // 场景 3: 逐项完整覆盖法定五大除外情形（公知、已知、第三方合法取得、独立研发、强制披露）-> 通过核验 (不告警)
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '保密信息除外情形',
          content:
            '保密信息不包括以下情形：1. 非因接收方违约已进入公知领域的公开信息；2. 在披露前已为接收方合法知悉的信息；3. 接收方从对其不负保密义务的第三方合法获得的信息；4. 接收方未使用披露方保密信息而独立研发形成的技术成果；5. 依照国家法律法规或司法监管机构指令必须强制披露的信息。',
        },
      ]);

      const resComplete = await reviewService.reviewContract({
        fileName: '保密协议.docx',
        contractType: 'nda',
      });
      const missingComplete = resComplete.missingClauses.find(
        (m) => m.id === 'missing_nda_exceptions'
      );
      expect(missingComplete).toBeUndefined();
    });

    it('[P2 Issue 4 & 6] should ground evidence with exact quotes, character offsets and support LLM findings', async () => {
      const clauseContent = '乙方应于30个自然日内完成交付。如逾期按日万分之五支付违约金。';
      mockAstParser.parseToAst.mockResolvedValue([
        {
          clauseNumber: '第一条',
          title: '交付期限与逾期违约',
          content: clauseContent,
        },
      ]);

      const result = await reviewService.reviewContract({
        fileName: '软件开发项目合同.docx',
        contractType: 'software_development',
        myPosition: 'both',
      });

      const clause = result.clauses[0];
      expect(clause).toBeDefined();

      // 验证结构化法律事实抽取 (facts)
      expect(clause.facts).toBeDefined();
      expect(clause.facts?.deliveryDayType).toBe('calendar_day');
      expect(clause.facts?.deliveryDays).toBe(30);
      expect(clause.facts?.dailyDamagesRate).toBe(0.0005);

      // 验证证据结构化 findings 与精确 elementId 归因
      expect(clause.findings).toBeDefined();
      expect(Array.isArray(clause.findings)).toBe(true);
      expect(clause.findings!.length).toBeGreaterThanOrEqual(1);

      const finding = clause.findings![0];
      expect(finding.elementId).toBe('soft_calendar_day_trap');
      expect(finding.elementCode).toBe('SOFT-03');
      expect(finding.severity).toBe('HIGH');

      // 验证真实证据定位 (evidenceQuote 与字符偏移 charStart / charEnd)
      expect(finding.evidenceQuote).toBeDefined();
      expect(finding.evidenceQuote?.length).toBeGreaterThan(0);
      expect(typeof finding.charStart).toBe('number');
      expect(typeof finding.charEnd).toBe('number');
      expect(finding.charEnd!).toBeGreaterThan(finding.charStart!);
      // 验证字符偏移切片与证据引用完全吻合
      expect(clauseContent.substring(finding.charStart!, finding.charEnd!)).toBe(finding.evidenceQuote);

      // 验证纯 LLM 语义发现的问题（无规则匹配时）能够顺利进入 findings
      jest.spyOn(checklistMatrix, 'getRulesForType').mockReturnValueOnce([]);
      jest.spyOn(llmReview, 'reviewClause').mockResolvedValueOnce({
        riskLevel: 'HIGH',
        riskSummary: '该条款存在单方不对等的免责倾向',
        legalAdvice: '建议明确双方对等救济机制',
        evidenceQuote: '如逾期按日万分之五支付违约金。',
        llmReviewed: true,
      });

      const llmResult = await reviewService.reviewContract({
        fileName: '纯语义测试协议.docx',
        contractType: 'general',
      });
      const llmClause = llmResult.clauses[0];
      expect(llmClause.findings).toBeDefined();
      expect(llmClause.findings!.length).toBe(1);
      expect(llmClause.findings![0].category).toBe('智能语义风控');
      expect(llmClause.findings![0].severity).toBe('HIGH');
      expect(llmClause.findings![0].evidenceQuote).toBe('如逾期按日万分之五支付违约金。');
      expect(llmClause.findings![0].charStart).toBeDefined();
      expect(clauseContent.substring(llmClause.findings![0].charStart!, llmClause.findings![0].charEnd!)).toBe(
        '如逾期按日万分之五支付违约金。'
      );
    });

    it('should mark localization failure as 待定位 rather than returning irrelevant first sentence', async () => {
      // 场景：对“双方开展软件合作。乙方可以随时取消服务。”，若证据定位失败，不可返回不相关首句“双方开展软件合作。”
      jest.spyOn(checklistMatrix, 'getRulesForType').mockReturnValueOnce([]);
      jest.spyOn(llmReview, 'reviewClause').mockResolvedValueOnce({
        riskLevel: 'HIGH',
        riskSummary: '服务连续性存在重大不确定性，缺乏对等救济机制',
        legalAdvice: '建议约定固定服务期与提前通知义务',
        evidenceQuote: undefined,
        llmReviewed: true,
      });

      const res = await reviewService.reviewContract({
        text: '第一条 合作方式\n双方开展软件合作。乙方可以随时取消服务。',
        fileName: '测试服务协议.docx',
      });

      const clause = res.clauses[0];
      expect(clause.findings).toBeDefined();
      expect(clause.findings!.length).toBe(1);
      const finding = clause.findings![0];
      expect(finding.evidenceQuote).toBe('待定位');
      expect(finding.charStart).toBeUndefined();
      expect(finding.charEnd).toBeUndefined();
      expect(finding.evidenceQuote).not.toContain('双方开展软件合作');
    });

    it('should NOT drop independent LLM findings that share the same severity as a matched rule', async () => {
      // 场景：同一条款同时存在规则检测出的 HIGH（SOFT-03 工期自然日陷阱）与 LLM 发现的独立 HIGH（单方解除权）
      jest.spyOn(llmReview, 'reviewClause').mockResolvedValueOnce({
        riskLevel: 'HIGH',
        riskSummary: '乙方享有单方随时终止权且无违约赔偿责任',
        legalAdvice: '建议删除单方随意终止条款',
        evidenceQuote: '乙方可以随时取消服务。',
        llmReviewed: true,
      });

      const res = await reviewService.reviewContract({
        text: '第一条 交付与合作\n乙方应在60个自然日内交付系统。乙方可以随时取消服务。',
        fileName: '定制开发合同.docx',
        myPosition: 'seller',
      });

      const clause = res.clauses[0];
      expect(clause.findings).toBeDefined();
      // 必须同时包含 规则发现的 SOFT-03 以及 LLM 发现的单方终止风险，不能因严重级别同为 HIGH 而被遗漏
      expect(clause.findings!.length).toBeGreaterThanOrEqual(2);
      const hasSoft03 = clause.findings!.some((f) => f.elementCode === 'SOFT-03');
      const hasLlmRisk = clause.findings!.some((f) => f.category === '智能语义风控' && f.severity === 'HIGH');
      expect(hasSoft03).toBe(true);
      expect(hasLlmRisk).toBe(true);
    });

    it('should deduplicate redundant findings using generic token/bigram similarity without hardcoded domain keywords', () => {
      const { ReviewElementEvaluatorService } = require('../contract-elements');
      const evaluator = new ReviewElementEvaluatorService();

      const existingFindings: any[] = [
        {
          elementCode: 'CUSTOM-01',
          title: '排查数据存储合规出境要求',
          riskSummary: '约定数据跨境传输未取得国家网信部门前置安全评估，存在行政处罚与合规风险。',
        },
      ];

      // LLM returns essentially the same risk expressed with different sentence structure (no hardcoded domain keywords)
      const redundantSemantic = {
        riskSummary: '数据跨境传输未进行网信部门数据出境安全评估申报，存在重大行政合规合规处罚风险。',
        legalAdvice: '建议向国家网信部门申报数据出境安全评估。',
      };

      const isCovered = evaluator.isCoveredByExistingFindings(redundantSemantic, existingFindings);
      expect(isCovered).toBe(true);

      // LLM returns a completely distinct risk
      const distinctSemantic = {
        riskSummary: '付款条款要求买方必须于验收前支付90%款项，付款进度过快缺乏履约担保。',
        legalAdvice: '建议分期支付并保留至少20%尾款。',
      };

      const isDistinctCovered = evaluator.isCoveredByExistingFindings(distinctSemantic, existingFindings);
      expect(isDistinctCovered).toBe(false);
    });

    it('should review real .pdf contract file from tests/contract directory end-to-end', async () => {
      const fs = require('fs');
      const path = require('path');
      const { ContractAstParserService } = require('../contract-compare/contract-ast-parser.service');

      const pdfPath = path.resolve(process.cwd(), 'tests/contract/contract_v1_baseline.pdf');
      if (fs.existsSync(pdfPath)) {
        const fileBase64 = fs.readFileSync(pdfPath).toString('base64');
        const realParser = new ContractAstParserService();
        const realEngine = new ContractReviewEngineService(
          realParser,
          classifier,
          checklistMatrix,
          formScanner,
          llmReview
        );
        const realReviewService = new ContractReviewService(realEngine, htmlRenderer);

        const result = await realReviewService.reviewContract({
          fileName: 'contract_v1_baseline.pdf',
          fileBase64,
          myPosition: 'buyer',
        });

        expect(result.contractType).toBe('software_development');
        expect(result.clauses.length).toBeGreaterThan(3);
        expect(result.artifacts).toBeDefined();
        expect(result.artifacts!.length).toBeGreaterThanOrEqual(1);
        expect(result.htmlReport).toContain('合同文档智能深度审查报告');
        expect(result.htmlReport).toContain('contract_v1_baseline.pdf');
      }
    });
  });
});


