import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { ContractAstParserService } from '../contract-compare/contract-ast-parser.service';
import { ContractReviewEngineService } from './contract-review-engine.service';
import { ContractReviewHtmlRendererService } from './contract-review-html-renderer.service';
import { ContractReviewService } from './contract-review.service';
import { ContractTypeClassifierService } from './contract-type-classifier.service';
import { ContractChecklistMatrixService } from './contract-checklist-matrix.service';

/**
 * Helper to construct a realistic enterprise .docx package with native OpenXML comments,
 * specifically covering the multi-comment scenario where multiple reviewers annotate the EXACT SAME text anchor.
 */
export async function buildTestDocxWithComments(): Promise<Buffer> {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>
  <Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.ms-word.commentsExtended+xml"/>
</Types>`
  );

  // 2. _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // 3. word/_rels/document.xml.rels
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>
  <Relationship Id="rIdCommentsExtended" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>
</Relationships>`
  );

  // 4. word/comments.xml (6 Realistic Review Comments, with #1, #2, #3 on the exact same phrase)
  zip.file(
    'word/comments.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <!-- Anchor Point A: Comment 1 (Legal Compliance) -->
  <w:comment w:id="1" w:author="王建国 (法务合规总监)" w:date="2026-09-29T10:15:00Z" w:initials="WJG">
    <w:p w14:paraId="1111AAAA">
      <w:r>
        <w:t>此处60个工作日付账周期严重违反《保障中小企业款项支付条例》，且以买方内部审核作为付款前置条件存在恶意拖延风险，建议强制约定收到合规发票后15个工作日内电汇结清。</w:t>
      </w:r>
    </w:p>
  </w:comment>

  <!-- Anchor Point A: Comment 2 (Commercial Finance - Same Anchor as Comment 1) -->
  <w:comment w:id="2" w:author="李晓敏 (高级商业法务)" w:date="2026-09-29T11:30:00Z" w:initials="LXM">
    <w:p w14:paraId="2222AAAA">
      <w:r>
        <w:t>赞同王总风控意见。从资金链安全评估，建议优化为三期里程碑付款：首期预付款30%、阶段初验通过付50%、终验质保期满付20%，并明确约定逾期付款利息。</w:t>
      </w:r>
    </w:p>
  </w:comment>

  <!-- Anchor Point A: Comment 3 (Delivery Architecture - Same Anchor as Comment 1 & 2) -->
  <w:comment w:id="3" w:author="张朝阳 (交付负责人 / 架构专家)" w:date="2026-09-29T14:10:00Z" w:initials="ZCY">
    <w:p w14:paraId="3333AAAA">
      <w:r>
        <w:t>从工程交付排期评估，若款项拖延超过30天未到账，我方技术团队应有权单方暂停云上基础设施环境部署及源代码移交，交付工期相应顺延。</w:t>
      </w:r>
    </w:p>
  </w:comment>

  <!-- Anchor Point B: Comment 4 (Open Source SCA Compliance) -->
  <w:comment w:id="4" w:author="陈思齐 (法务合规顾问)" w:date="2026-09-29T15:20:00Z" w:initials="CSQ">
    <w:p w14:paraId="4444BBBB">
      <w:r>
        <w:t>需严控GPL/AGPL等强传染性开源协议引入风险，建议在附件中强制要求乙方随源码交付第三方SCA组件合规扫描认证报告及依赖漏洞修补承诺。</w:t>
      </w:r>
    </w:p>
  </w:comment>

  <!-- Anchor Point C: Comment 5 (Liquidated Damages Cap) -->
  <w:comment w:id="5" w:author="李晓敏 (高级商业法务)" w:date="2026-09-29T16:00:00Z" w:initials="LXM">
    <w:p w14:paraId="5555CCCC">
      <w:r>
        <w:t>30%违约金过高，超出《民法典》司法解释中通常支持的实际损失30%合理浮动上限。建议调整为每日万分之五并设立最高20%封顶上限。</w:t>
      </w:r>
    </w:p>
  </w:comment>

  <!-- Anchor Point D: Comment 6 (Arbitration Clause) -->
  <w:comment w:id="6" w:author="陈思齐 (法务合规顾问)" w:date="2026-09-29T16:45:00Z" w:initials="CSQ">
    <w:p w14:paraId="6666DDDD">
      <w:r>
        <w:t>双方处于不同省份，异地诉讼维权差旅与取证成本过高。建议优先争取选定上海国际仲裁中心（SHIAC）进行仲裁，一裁终局且保密性更好。</w:t>
      </w:r>
    </w:p>
  </w:comment>
</w:comments>`
  );

  // 5. word/commentsExtended.xml (Resolved status tracking)
  zip.file(
    'word/commentsExtended.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w15:commentEx w15:paraId="1111AAAA" w15:done="0"/>
  <w15:commentEx w15:paraId="2222AAAA" w15:done="0"/>
  <w15:commentEx w15:paraId="3333AAAA" w15:done="0"/>
  <w15:commentEx w15:paraId="4444BBBB" w15:done="0"/>
  <w15:commentEx w15:paraId="5555CCCC" w15:done="0"/>
  <w15:commentEx w15:paraId="6666DDDD" w15:done="1"/>
</w15:commentsEx>`
  );

  // 6. word/document.xml (Rich 8-clause Enterprise Software & Cloud Operations Service Contract)
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Document Title -->
    <w:p>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>企业级数字化协同平台定制开发与系统运维服务合同</w:t></w:r>
    </w:p>

    <!-- Clause 0: Preamble & Parties -->
    <w:p>
      <w:r><w:t>甲方（委托方）：上海汇智未来信息技术有限公司</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>法定代表人：刘振华   住所地：上海市浦东新区张江高科技园区博云路111号</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>乙方（受托开发方）：北京深蓝智控软件开发有限公司</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>法定代表人：赵建国   住所地：北京市海淀区中关村南大街5号科技大厦B座</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>鉴于甲方因数字化业务转型需要，拟委托乙方定制研发“企业级智能运营协同中台”，乙方具备深厚行业架构经验与高并发云原生开发能力，双方经友好协商达成如下合同条款共同恪守。</w:t></w:r>
    </w:p>

    <!-- Clause 1: Project Scope and Deliverables -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第一条 项目开发范围与技术成果交付</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>1.1 乙方应按照本合同附件一《系统需求规格说明书》及技术方案要求，完成协同中台微服务后端架构、Web前端管理后台及移动端响应式界面的全流程开发。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>1.2 乙方应向甲方完整交付软件生产环境源代码、Git仓库提交记录、容器镜像构建Dockerfile、Kubernetes编排脚本、数据库DDL及详细API开发文档。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>1.3 交付成果须经双方联合项目组按照附件二《系统验收与性能压测规范》实施功能初验与压力性能终验，终验达标方可签署正式上线交接证书。</w:t></w:r>
    </w:p>

    <!-- Clause 2: Contract Price and Payment Terms (Multi-comment scenario on the EXACT SAME point) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第二条 合同价款、支付结算周期与商务里程碑</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>2.1 本合同技术开发与首年系统运维服务总金额为人民币叁佰陆拾万元整（¥3,600,000.00）。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>2.2 付款进度：项目初验合格并提供阶段报告后，款项需经</w:t></w:r>
      <!-- Triple-nested comment ranges on the exact same text run -->
      <w:commentRangeStart w:id="1"/>
      <w:commentRangeStart w:id="2"/>
      <w:commentRangeStart w:id="3"/>
      <w:r><w:t>内部财务审核无异议后于60个工作日内支付</w:t></w:r>
      <w:commentRangeEnd w:id="1"/>
      <w:commentRangeEnd w:id="2"/>
      <w:commentRangeEnd w:id="3"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="1"/>
      </w:r>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="2"/>
      </w:r>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="3"/>
      </w:r>
      <w:r><w:t>首期开发款项。</w:t></w:r>
    </w:p>

    <!-- Clause 3: Intellectual Property and Open Source Compliance (Comment 4 & Audit Finding) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第三条 知识产权归属、源码交接与开源合规</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>3.1 乙方为本项目专门定制开发的业务逻辑源代码、数据模型及交互设计图，自甲方支付完毕对应阶段款项之日起全部归甲方独占所有。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>3.2 乙方保留其在签约前已独立研发拥有的基础平台框架底层组件与通用算法库的著作权。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>3.3 针对引入的第三方开源组件，</w:t></w:r>
      <w:commentRangeStart w:id="4"/>
      <w:r><w:t>乙方承诺严格遵守开源协议规范，且交付成果不含有GPL或AGPL等具有传染性开源许可证</w:t></w:r>
      <w:commentRangeEnd w:id="4"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="4"/>
      </w:r>
      <w:r><w:t>的代码或组件。</w:t></w:r>
    </w:p>

    <!-- Clause 4: Breach of Contract and Damages (Comment 5) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第四条 违约责任、迟延交付与损害赔偿限额</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>4.1 任一方违反本合同约定义务造成对方直接经济损失的，违约方应承担全额赔偿责任。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>4.2 如乙方因自身技术管理原因未能在工期节点完成阶段交付，</w:t></w:r>
      <w:commentRangeStart w:id="5"/>
      <w:r><w:t>违约金应按合同总金额的30%计算，且不免除进一步损害赔偿</w:t></w:r>
      <w:commentRangeEnd w:id="5"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="5"/>
      </w:r>
      <w:r><w:t>责任。</w:t></w:r>
    </w:p>

    <!-- Clause 5: Data Security and Personal Information Protection -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第五条 数据安全、个人信息保护与保密义务</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>5.1 乙方接触或处理甲方的业务运营数据、用户个人信息时，须严格遵循《中华人民共和国数据安全法》与《个人信息保护法》，开发测试环节须全面使用脱敏仿真数据，严禁通过外网下载或留存生产数据副本。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>5.2 双方在本协议签订及履行过程中获悉的对方技术秘密、商业秘密及未公开财务数据负有严格保密义务，保密期限为合同终止后永久有效。</w:t></w:r>
    </w:p>

    <!-- Clause 6: Service Level Agreement (SLA) & Long-Term Operations -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第六条 服务可用性SLA与系统运维支持</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>6.1 终验合格上线之日起，乙方提供为期12个月的免费质保运维支持，提供7×24小时应急故障热线响应与紧急故障修复团队。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>6.2 系统高可用指标保证：服务年度可用率不得低于99.95%，一级核心系统崩溃故障的恢复时间目标（RTO）应小于2小时，数据恢复点目标（RPO）小于10分钟。</w:t></w:r>
    </w:p>

    <!-- Clause 7: Force Majeure -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第七条 不可抗力事件与免责通知</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>7.1 因发生不可预见、不能避免且不能克服的严重地震、洪涝海啸、战争或重大政策变动导致合同无法履行的，受阻方在提供有效公证证明后免除相应违约责任。</w:t></w:r>
    </w:p>

    <!-- Clause 8: Dispute Resolution and Arbitration (Comment 6) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第八条 争议解决与法律管辖</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>8.1 双方因本合同履行或违约产生的任何纠纷，应首先本着诚信原则友好协商解决。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>8.2 协商不成的，任何一方均有权</w:t></w:r>
      <w:commentRangeStart w:id="6"/>
      <w:r><w:t>向上海国际经济贸易仲裁委员会（上海国际仲裁中心SHIAC）申请仲裁</w:t></w:r>
      <w:commentRangeEnd w:id="6"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="6"/>
      </w:r>
      <w:r><w:t>，仲裁裁决为终局裁决，对双方均具有强制约束力。</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
  );

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

describe('Word OpenXML Comments End-to-End Extraction & Rendering', () => {
  let docxBuffer: Buffer;
  let astParser: ContractAstParserService;
  let reviewEngine: ContractReviewEngineService;
  let htmlRenderer: ContractReviewHtmlRendererService;
  let reviewService: ContractReviewService;

  beforeAll(async () => {
    docxBuffer = await buildTestDocxWithComments();
    astParser = new ContractAstParserService();
    reviewEngine = new ContractReviewEngineService(
      astParser,
      new ContractTypeClassifierService(),
      new ContractChecklistMatrixService()
    );
    htmlRenderer = new ContractReviewHtmlRendererService();
    reviewService = new ContractReviewService(reviewEngine, htmlRenderer);
  });

  it('1. should accurately extract Word native comments from OpenXML (including multiple comments on the exact same text anchor)', async () => {
    const parseResult = await astParser.parseToAstDetailed({
      base64: docxBuffer.toString('base64'),
      fileName: '企业级数字化协同平台定制开发与系统运维服务合同.docx',
    });

    expect(parseResult.clauses.length).toBeGreaterThanOrEqual(8);
    expect(parseResult.comments).toBeDefined();
    expect(parseResult.comments!.length).toBe(6);

    // Verify Anchor Point A: Multiple comments on the exact same phrase
    const c1 = parseResult.comments!.find((c) => c.id === '1');
    const c2 = parseResult.comments!.find((c) => c.id === '2');
    const c3 = parseResult.comments!.find((c) => c.id === '3');

    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    expect(c3).toBeDefined();

    expect(c1!.selectedText).toBe('内部财务审核无异议后于60个工作日内支付');
    expect(c2!.selectedText).toBe('内部财务审核无异议后于60个工作日内支付');
    expect(c3!.selectedText).toBe('内部财务审核无异议后于60个工作日内支付');

    expect(c1!.author).toContain('王建国');
    expect(c2!.author).toContain('李晓敏');
    expect(c3!.author).toContain('张朝阳');

    expect(c1!.isResolved).toBe(false);
    expect(c2!.isResolved).toBe(false);
    expect(c3!.isResolved).toBe(false);

    // Verify Anchor Point B (Comment 4: Open source SCA)
    const c4 = parseResult.comments!.find((c) => c.id === '4');
    expect(c4).toBeDefined();
    expect(c4!.author).toContain('陈思齐');
    expect(c4!.selectedText).toContain('具有传染性开源许可证');

    // Verify Anchor Point C (Comment 5: Liquidated damages)
    const c5 = parseResult.comments!.find((c) => c.id === '5');
    expect(c5).toBeDefined();
    expect(c5!.author).toContain('李晓敏');
    expect(c5!.selectedText).toContain('按合同总金额的30%计算');

    // Verify Anchor Point D (Comment 6: SHIAC Arbitration - Resolved)
    const c6 = parseResult.comments!.find((c) => c.id === '6');
    expect(c6).toBeDefined();
    expect(c6!.author).toContain('陈思齐');
    expect(c6!.selectedText).toContain('上海国际经济贸易仲裁委员会');
    expect(c6!.isResolved).toBe(true);
  });

  it('2. should bind multi-comment anchors and individual comments to their respective contract clauses', async () => {
    const parseResult = await astParser.parseToAstDetailed({
      base64: docxBuffer.toString('base64'),
      fileName: '企业级数字化协同平台定制开发与系统运维服务合同.docx',
    });

    // Clause 2 (价款与支付结算周期) should hold all 3 co-anchored comments
    const paymentClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('2') || c.title.includes('价款'));
    expect(paymentClause).toBeDefined();
    expect(paymentClause!.comments).toBeDefined();
    expect(paymentClause!.comments!.length).toBeGreaterThanOrEqual(3);
    expect(paymentClause!.comments!.some((c) => c.id === '1')).toBe(true);
    expect(paymentClause!.comments!.some((c) => c.id === '2')).toBe(true);
    expect(paymentClause!.comments!.some((c) => c.id === '3')).toBe(true);

    // Clause 3 (知识产权) should hold comment 4
    const ipClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('3') || c.title.includes('知识产权'));
    expect(ipClause).toBeDefined();
    expect(ipClause!.comments!.some((c) => c.id === '4')).toBe(true);

    // Clause 4 (违约责任) should hold comment 5
    const breachClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('4') || c.title.includes('违约责任'));
    expect(breachClause).toBeDefined();
    expect(breachClause!.comments!.some((c) => c.id === '5')).toBe(true);

    // Clause 8 (争议解决) should hold comment 6
    const disputeClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('8') || c.title.includes('争议解决'));
    expect(disputeClause).toBeDefined();
    expect(disputeClause!.comments!.some((c) => c.id === '6')).toBe(true);
  });

  it('3. should generate complete end-to-end interactive HTML report with unified multi-comment badges and cards', async () => {
    const reviewResult = await reviewService.reviewContract({
      fileBase64: docxBuffer.toString('base64'),
      fileName: '企业级数字化协同平台定制开发与系统运维服务合同.docx',
      skipLlmReview: true,
    });

    expect(reviewResult.comments).toBeDefined();
    expect(reviewResult.comments!.length).toBe(6);

    const html = reviewResult.htmlReport;

    // Check Document Paper Multi-Comment Anchor: Single highlight with 3-comment badge
    expect(html).toContain('id="comment-target-1"');
    expect(html).toContain('data-comment-ids="1,2,3"');
    expect(html).toContain('批注 (3条) #1/2/3');

    // Check Other Document Highlights
    expect(html).toContain('id="comment-target-4"');
    expect(html).toContain('id="comment-target-5"');
    expect(html).toContain('id="comment-target-6"');

    // Check Workbench Comment Cards for all 6 comments
    expect(html).toContain('id="comment-card-1"');
    expect(html).toContain('id="comment-card-2"');
    expect(html).toContain('id="comment-card-3"');
    expect(html).toContain('id="comment-card-4"');
    expect(html).toContain('id="comment-card-5"');
    expect(html).toContain('id="comment-card-6"');

    // Check Reviewer names & roles
    expect(html).toContain('王建国 (法务合规总监)');
    expect(html).toContain('李晓敏 (高级商业法务)');
    expect(html).toContain('张朝阳 (交付负责人 / 架构专家)');
    expect(html).toContain('陈思齐 (法务合规顾问)');

    // Check Workbench Mode Switch Tabs (Word批注) & Return Action Handlers
    expect(html).toContain('Word批注');
    expect(html).toContain('id="tab-btn-comments"');
    expect(html).toContain('handleFinishAndReturn()');
    expect(html).toContain('handleStageAndReturn()');
    expect(html).toContain('convertFindingToComment');

    // Check Sidebar Comment Creation Workspace & Floating Selection Bubble
    expect(html).toContain('id="comment-create-workspace"');
    expect(html).toContain('拟定新批注');
    expect(html).toContain('id="comment-create-author"');
    expect(html).toContain('id="comment-create-text"');
    expect(html).toContain('submitCommentCreateFromSidebar()');
    expect(html).toContain('id="text-selection-bubble"');
    expect(html).toContain('openCommentFromSelection(event)');
    expect(html).toContain('openReviewFromSelection(event)');
    expect(html).toContain('写入审批');
    expect(html).toContain('标记核实');
    expect(html).toContain('待处理');
    expect(html).toContain('dispatchReviewResult');
    expect(html).toContain('showSyncCompleteModal');
    expect(html).toContain('confirmApprovalOpinion');
    expect(html).toContain('toggleApprovalOpinionBox');
    expect(html).toContain('copyPureText');
    expect(html).toContain('toggleRevisionExpand');
    expect(html).toContain('id="mode-btn-view"');
    expect(html).toContain('id="mode-btn-review"');
    expect(html).toContain('setInteractionMode');
    expect(html).toContain('initInteractionMode');
    expect(html).toContain('mode-review-only');

    // Check Comment & Finding Hover Popover with debouncing & robust finding ID matching
    expect(html).toContain('id="comment-hover-popover"');
    expect(html).toContain('showFindingHoverPopover');
    expect(html).toContain('findFindingObject');
    expect(html).toContain('HOVER_SHOW_DELAY = 220');
    expect(html).toContain('data-finding-id="finding-nda_perpetual_duration"');

    // Check Collapsible Author Input & Chronological Threaded comments
    expect(html).toContain('id="comment-reply-author-container"');
    expect(html).toContain('id="comment-create-author-container"');
    expect(html).toContain('toggleReplyAuthorEdit');
    expect(html).toContain('toggleCreateAuthorEdit');
    expect(html).toContain('id="comment-detail-thread-container"');
    expect(html).toContain('renderTimelineComments');
    expect(html).toContain('toggleSingleCommentCollapse');
    expect(html).toContain('历史批注默认收起，最新批注默认展开');

    // Verify linkage scroll and anchor finder
    expect(html).toContain('function scrollTargetToUpperMiddle(el)');
    expect(html).toContain('function findCommentMark(commentId)');

    // Verify right workbench stream order: findings-cards-container is placed before comments-stream-container
    const findingsPos = html.indexOf('id="findings-cards-container"');
    const commentsPos = html.indexOf('id="comments-stream-container"');
    expect(findingsPos).toBeGreaterThan(0);
    expect(commentsPos).toBeGreaterThan(0);
    expect(findingsPos).toBeLessThan(commentsPos);

    // Save test docx and generated preview HTML for browser verification
    const { WORKSPACE_ROOT } = await import('../document-payload-resolver.helper');
    const outputDir = path.join(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine', 'renders');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const testDocxPath = path.join(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine', '企业级数字化协同平台定制开发与系统运维服务合同.docx');
    fs.writeFileSync(testDocxPath, docxBuffer);

    const previewHtmlPath = path.join(outputDir, 'test_word_comments_preview.html');
    fs.writeFileSync(previewHtmlPath, html, 'utf8');

    expect(fs.existsSync(testDocxPath)).toBe(true);
    expect(fs.existsSync(previewHtmlPath)).toBe(true);
  });
});
