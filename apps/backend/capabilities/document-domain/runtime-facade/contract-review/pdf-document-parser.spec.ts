import * as fs from 'fs';
import * as path from 'path';
import { ContractAstParserService } from '../contract-compare/contract-ast-parser.service';
import { PdfDocumentParserService } from '../contract-compare/pdf-document-parser.service';
import { parseContractTextWithStateMachine } from '../contract-compare/contract-clause-state-machine.util';
import { ContractReviewHtmlRendererService } from './contract-review-html-renderer.service';

describe('PdfDocumentParser & StateMachine E2E Specification', () => {
  let astParser: ContractAstParserService;
  let pdfParser: PdfDocumentParserService;
  let htmlRenderer: ContractReviewHtmlRendererService;

  beforeAll(() => {
    astParser = new ContractAstParserService();
    pdfParser = new PdfDocumentParserService();
    htmlRenderer = new ContractReviewHtmlRendererService();
  });

  describe('Hierarchical Legal State Machine', () => {
    it('should correctly group Level 3 sub-items into Level 2 Chinese main articles without dropping container headings', () => {
      const sample = `一、技术服务内容、方式
本合同项下之技术服务内容、方式详见乙方向甲方提交的《规格书》，该《规格书》为本合同附件。
二、乙方应按下列要求完成技术服务工作
1.交货地点和部门： 甲方指定
2.技术服务期限： 2026-01-01～2026-12-31
3.技术服务进度： 参照附件
4.最终客户： 茑屋投资（上海）有限公司
5.关于此条的内容也可参见附件《规格书》的规定。
三、验收
1.本合同项下之技术服务的验收标准为：符合《规格书》之规定。
五、转委托
1.乙方应自己独立完成本合同项下的全部服务内容。
2.若经过甲方事先书面同意，乙方可将本合同项下服务内容转委托。`;

      const clauses = parseContractTextWithStateMachine(sample);

      expect(clauses.length).toBe(4);
      expect(clauses[0].clauseNumber).toBe('一、');
      expect(clauses[0].title).toBe('技术服务内容、方式');

      expect(clauses[1].clauseNumber).toBe('二、');
      expect(clauses[1].title).toBe('乙方应按下列要求完成技术服务工作');
      expect(clauses[1].content).toContain('交货地点和部门： 甲方指定');
      expect(clauses[1].content).toContain('技术服务期限： 2026-01-01～2026-12-31');

      expect(clauses[2].clauseNumber).toBe('三、');
      expect(clauses[2].title).toBe('验收');

      expect(clauses[3].clauseNumber).toBe('五、');
      expect(clauses[3].title).toBe('转委托');
      expect(clauses[3].content).toContain('乙方应自己独立完成');
      expect(clauses[3].content).toContain('若经过甲方事先书面同意');
    });

    it('should preserve standalone date lines and not glue them into a single string', () => {
      const sample = `三、验收
1.本合同项下之技术服务的验收标准为：符合《规格书》之规定。
2.乙方提供之技术服务全部满足验收标准后，出具相应的验收证明。
验收预定日：
2026年04月05日
2026年07月05日
2026年10月05日
2027年01月05日`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBe(1);

      const clause = clauses[0];
      expect(clause.content).toContain('2026年04月05日');
      expect(clause.content).toContain('2026年07月05日');
      expect(clause.content).not.toContain('2026年04月05日2026年07月05日');

      // Check blocks
      const dateBlocks = (clause.blocks || []).filter((b) => b.primaryText?.includes('2026年'));
      expect(dateBlocks.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract and reconstruct signatory contact info as a table block', () => {
      const sample = `二十、合同附则
1.双方按本合同约定向对方发送书面通知。
2.本合同正本一式2份。
021-51099399
200127
上海市浦东新区浦东南路2240号
上海艾顿实业有限公司
传真:
联系电话:
邮政编码:
联系地址:
法定代表人
或授权代表:
乙方:
+86(21)58871000
200120
上海浦东新区陆家嘴环路1000号
富士通（中国）信息系统有限公司
传真:
联系电话:
邮政编码:
联系地址:
法定代表人
或授权代表:
甲方:`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBeGreaterThanOrEqual(1);

      const tableBlock = clauses
        .flatMap((c) => c.blocks || [])
        .find((b) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock?.tableData?.headers).toEqual(
        expect.arrayContaining([expect.stringContaining('甲方'), expect.stringContaining('乙方')])
      );
    });

    it('should keep unnumbered continuation lines under list items without dropping to root margin', () => {
      const sample = `四、支付方式
1. 技术服务费总额为：人民币 贰拾肆万贰仟壹佰肆拾捌元整 ( CNY 242,148.00 )。
其中，不含税金额为：( CNY 235,095.16 )，增值税率为：3%，增值税额为：( CNY 7,052.84 )
2. 技术服务费由甲方： 四次 支付乙方。
3. 具体支付方式和时间如下：
每次验收通过且收到发票后次月末支付人民币陆万零伍佰叁拾柒圆整（即 CNY 60,537.00）。
4. 乙方应及时提供发票。`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBe(1);
      const blocks = clauses[0].blocks || [];

      // List items 1, 2, 3, 4 should be 4 list_item blocks
      const listItems = blocks.filter((b) => b.type === 'list_item');
      expect(listItems.length).toBe(4);

      // Item 1 should contain its sub-breakdown
      expect(listItems[0].prefix).toBe('1.');
      expect(listItems[0].primaryText).toContain('其中，不含税金额为：( CNY 235,095.16 )');

      // Item 3 should contain its schedule
      expect(listItems[2].prefix).toBe('3.');
      expect(listItems[2].primaryText).toContain('每次验收通过且收到发票后次月末支付');
    });

    it('should smoothly merge long sentences (>200 chars) wrapped across lines without mid-word breaks', () => {
      const sample = `十二、出口
双方确认本合同项下提供的产品、服务、双方各自的文档或其他资料应遵守美国、日本及中国的出口限制的法律法规。乙方应自负费用取得所有当地和其他国家法律法规所不时要求的影响或规范该等出口的许可、同意及批准，包括但不限于美国出口管理条例、日本及中国的出口管理法律。乙方应根据要求向甲方提供该许可、同意或批准的复印件及与产品、服务及文档的进口和后续出口有关的出口管制分类编码、关税代码、原产国及甲方合理要求的其他信息。由于乙方违反本条款或乙方、其代理
商、员工的疏忽大意或任何代表乙方行使义务的其他人的疏忽大意而引起的对甲方的诉讼，乙方应为甲方辩护。`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBe(1);
      const blocks = clauses[0].blocks || [];

      // Should be 1 single continuous paragraph block, NOT split mid-word at 其代理 / 商
      expect(blocks.length).toBe(1);
      expect(blocks[0].primaryText).toContain('其代理商、员工的疏忽大意');
      expect(blocks[0].primaryText).not.toContain('其代理\n');
    });

    it('should NOT treat 4-digit years like (2010) as list prefixes, and merge inline Roman numerals cleanly', () => {
      const sample = `十一、企业社会责任
乙方应始终遵守与反腐败有关的相关法律，包括但不限于经合组织公约的反腐败政策、美国的海外反腐败法、英国的反腐败法
（2010） 及中国的反腐败法律（“适用的反腐败法律”）。乙方不得参与任何犯罪。乙方应拥有维持政策。乙方(i)不得使用童工；
(ii)应给予所有其员工尊严和尊重；(iii)在招聘和雇佣实践中，不得非法歧视。
乙方若违反上述规定，将被认为已经对甲方构成实质性损害。`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBe(1);
      const blocks = clauses[0].blocks || [];

      // (2010) must NOT be a standalone list item
      const yearPrefixBlock = blocks.find((b) => b.prefix === '（2010）' || b.prefix === '(2010)');
      expect(yearPrefixBlock).toBeUndefined();

      // (2010) should be cleanly merged with 英国的反腐败法
      expect(clauses[0].content).toContain('英国的反腐败法（2010） 及中国的反腐败法律');

      // (ii) should merge as inline continuation after inline (i)
      expect(clauses[0].content).toContain('(i)不得使用童工；(ii)应给予所有其员工尊严和尊重');
    });

    it('should render HTML tables with full width and proportioned headers', () => {
      const htmlOutput = htmlRenderer.renderHtmlReport({
        fileName: '测试表格.pdf',
        contractType: 'software_development',
        contractTypeName: '软件技术服务合同',
        myPosition: 'buyer',
        clauses: [
          {
            clauseIndex: 1,
            clauseNumber: '落款',
            title: '双方签署与联系信息',
            originalContent: '表格信息',
            riskLevel: 'PASS',
            riskSummary: '',
            legalAdvice: '',
            matchedCheckpoints: [],
            blocks: [
              {
                id: 'blk-tbl',
                type: 'table',
                tableData: {
                  headers: ['签署项目', '甲方: 富士通', '乙方: 艾顿'],
                  rows: [['联系地址', '上海浦东', '上海浦南']],
                },
              },
            ],
          },
        ],
        missingClauses: [],
        metrics: {
          healthScore: 100,
          totalClauses: 1,
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          passCount: 1,
          missingClausesCount: 0,
          isTruncated: false,
          warnings: [],
        },
        artifactId: 'test-tbl',
      });

      // Verify table styling and percentage proportions
      expect(htmlOutput).toContain('class="w-full min-w-full text-xs text-left');
      expect(htmlOutput).toContain('style="width: 20%;"');
      expect(htmlOutput).toContain('style="width: 40%;"');
      expect(htmlOutput).toContain('.min-w-full { min-width: 100%; }');
    });
  });

  describe('End-to-End PDF Parsing Integration', () => {
    it('should successfully parse binary contract PDF and render compliant HTML with table', async () => {
      const pdfPath = path.join(process.cwd(), 'apps', 'backend', 'var', 'outputs', 'input_contract.pdf');
      if (!fs.existsSync(pdfPath)) {
        return; // Skip if test fixture not in standard path
      }

      const fileBase64 = fs.readFileSync(pdfPath).toString('base64');
      const result = await astParser.parseToAstDetailed({
        base64: fileBase64,
        fileName: '技术服务合同（采购）1.pdf',
      });

      expect(result.clauses.length).toBeGreaterThan(15);
      expect(result.metadata.format).toBe('pdf');

      // Verify no page number glued contamination
      const page1Glued = result.clauses.some((c) => c.content.includes('1甲方') || c.title.includes('1甲方'));
      const page3Glued = result.clauses.some((c) => c.content.includes('3故') || c.title.includes('3故'));
      expect(page1Glued).toBe(false);
      expect(page3Glued).toBe(false);

      // Verify HTML report rendering
      const htmlOutput = htmlRenderer.renderHtmlReport({
        fileName: '技术服务合同（采购）1.pdf',
        contractType: 'software_development',
        contractTypeName: '软件技术服务合同',
        myPosition: 'buyer',
        clauses: result.clauses.map((c, idx) => ({
          ...c,
          clauseIndex: idx,
          riskLevel: 'PASS',
          riskSummary: '',
          legalAdvice: '',
          matchedCheckpoints: [],
          originalContent: c.content,
        })),
        missingClauses: [],
        metrics: {
          healthScore: 100,
          totalClauses: result.clauses.length,
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          passCount: result.clauses.length,
          missingClausesCount: 0,
          isTruncated: false,
          warnings: [],
        },
        artifactId: 'test-artifact-e2e',
      });

      expect(htmlOutput).toContain('技术服务合同');
      expect(htmlOutput).toContain('<table');
      expect(htmlOutput).toContain('2026年04月05日');
      expect(htmlOutput).not.toContain('2026年04月05日2026年07月05日');
    });

    it('should seamlessly merge multiline addresses in preamble into a single key_value_grid', () => {
      const sample = `技术服务合同
签订日期：2025 年 10 月
签订地点：上海市浦东新区陆家嘴环
路 1000 号恒生银行大厦 19 楼 012 室
合同编号：S63539
委托方：上海立山商业设备有限公司 （下称甲方）
受托方：富士通（中国）信息系统有限公司 （下称乙方）
本合同甲方委托乙方就 Prones 系统手持设备系统导入 项目进行专项技术服务。`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBeGreaterThanOrEqual(1);

      const preamble = clauses[0];
      const grid = preamble.blocks?.find((b) => b.type === 'key_value_grid');
      expect(grid).toBeDefined();

      const addrMeta = grid?.metadata?.find((m) => m.key.includes('签订地点'));
      expect(addrMeta).toBeDefined();
      expect(addrMeta?.value).toBe('上海市浦东新区陆家嘴环路 1000 号恒生银行大厦 19 楼 012 室');

      // Only 1 grid block should be generated, not split into two grids by an orphan paragraph
      const gridCount = preamble.blocks?.filter((b) => b.type === 'key_value_grid').length;
      expect(gridCount).toBe(1);
    });

    it('should extract signatory table block when text has spaced characters and trailing position in clause', () => {
      const sample = `十六、 合同附则：
1、 本合同发生之一切税费，由双方各自承担。
2、 双方按本合同约定向对方发送书面通知。
3、 本合同正本一式 2 份，甲乙双方各执 1 份。
甲 方： 上海立山商业设备有限公
司
乙 方： 富士通（中国）信息系统有限公
司
法 定 代 表 人
或 授 权 代
表：
法 定 代 表 人
或授权代表：
联系地址： 上海市嘉定区兴荣路 1111
号
联系地址： 上海市浦东新区陆家嘴环路 1000
号恒生银行大厦 19 楼 012 室
邮政编码： 邮政编码： 20012 0
联系电话： 021-6259-0369 联系电话： +86(21)58871000
传真： 021-6259-0266 传真： +86(21)5877528 0`;

      const clauses = parseContractTextWithStateMachine(sample);
      expect(clauses.length).toBe(2);

      // Clause 1: 十六、合同附则 (retains the 3 numbered items)
      expect(clauses[0].clauseNumber).toBe('十六、');
      expect(clauses[0].content).toContain('双方各执 1 份');

      // Clause 2: 落款
      expect(clauses[1].clauseNumber).toBe('落款');
      const tableBlock = clauses[1].blocks?.find((b) => b.type === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock?.tableData?.headers).toEqual([
        '签署项目',
        '甲方: 上海立山商业设备有限公司',
        '乙方: 富士通（中国）信息系统有限公司',
      ]);
      expect(tableBlock?.tableData?.rows.length).toBe(5);
    });

    it('should extract commercial quotation and fee breakdown table with summary rows from annex text', () => {
      const sample = `附件一 服务规格书
乙方为甲方提供以下服务：
合同号：S63539
1）作业明细&费用明细：
（单位：RMB）
Ｎｏ 备考
1）明细
项 作业费用 型号 数量 单价 总价 税率 备注
1.1 Prones 系统改造费用 0 一式 35,400.00 35,400.00 6% 1）采购接收（手持终端）
1.2 Prones 系统改造费用 一式 39,000.00 39,000.00 6% 2）生产实绩（手持终端）
1.3 Prones 系统改造费用 一式 15,000.00 15,000.00 6% 3）现品票发行
小计 89,400.00
特别折扣 -5,000.00
总合计（含税） 84,400.00
■环保告知
1） “服务器”运行噪声`;

      const clauses = parseContractTextWithStateMachine(sample);
      const annexClause = clauses[0];
      const table = annexClause.blocks?.find((b) => b.type === 'table');
      expect(table).toBeDefined();
      expect(table?.tableData?.rows.length).toBe(6); // 3 items + 3 summary rows

      const summaryRow = table?.tableData?.rows[5];
      expect(typeof summaryRow?.[0]).toBe('object');
      expect((summaryRow?.[0] as any)?.text).toBe('总合计（含税）');
      expect((summaryRow?.[1] as any)?.text).toBe('84,400.00');
    });

    it('should render semantic u tags and template variable terms with distinct legal underline styling in HTML', () => {
      const sampleHtml = htmlRenderer.renderHtmlReport({
        fileName: '测试下划线与变量合同.pdf',
        contractType: 'software_development',
        contractTypeName: '测试合同',
        myPosition: 'neutral',
        clauses: [
          {
            clauseIndex: 1,
            clauseNumber: '前言',
            title: '前言',
            riskLevel: 'PASS',
            riskSummary: '',
            legalAdvice: '',
            matchedCheckpoints: [],
            originalContent:
              '本合同甲方委托乙方就 Prones 系统手持设备系统导入 项目进行专项技术服务，约定 <u>特定关键技术成果</u> 归甲方所有，签署日期为：2026年___月___日。',
            blocks: [
              {
                id: 'blk-0',
                type: 'paragraph',
                primaryText:
                  '本合同甲方委托乙方就 Prones 系统手持设备系统导入 项目进行专项技术服务，约定 <u>特定关键技术成果</u> 归甲方所有，签署日期为：2026年___月___日。',
              },
            ],
          },
        ],
        missingClauses: [],
        metrics: {
          healthScore: 100,
          totalClauses: 1,
          highRiskCount: 0,
          mediumRiskCount: 0,
          lowRiskCount: 0,
          passCount: 1,
          missingClausesCount: 0,
          isTruncated: false,
          warnings: [],
        },
      });

      expect(sampleHtml).toContain('contract-variable-term');
      expect(sampleHtml).toContain('contract-underlined-term');
      expect(sampleHtml).toContain('inline-blank');
      expect(sampleHtml).toContain('Prones 系统手持设备系统导入');
      expect(sampleHtml).toContain('特定关键技术成果');
    });
  });
});
