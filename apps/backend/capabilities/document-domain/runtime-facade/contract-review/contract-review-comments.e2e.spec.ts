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
 * Helper to construct an authoritative .docx package with native OpenXML comments.
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

  // 4. word/comments.xml (Word Native Comments)
  zip.file(
    'word/comments.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="1" w:author="王建国 (法务合规总监)" w:date="2026-09-29T10:15:00Z" w:initials="WJG">
    <w:p w14:paraId="1111AAAA">
      <w:r>
        <w:t>此处60个工作日付账周期严重违反《保障中小企业款项支付条例》，且以买方内部审核作为付款前置条件存在恶意拖延风险，建议强制约定收到合规发票后15个工作日内电汇结清。</w:t>
      </w:r>
    </w:p>
  </w:comment>
  <w:comment w:id="2" w:author="李晓敏 (高级商业法务)" w:date="2026-09-29T11:40:00Z" w:initials="LXM">
    <w:p w14:paraId="2222BBBB">
      <w:r>
        <w:t>30% 违约金比例明显超出《民法典》司法解释中通常认可的实际损失30%合理浮动上限，在诉讼中极易被法院予以调低。建议调优为每日万分之五并设立最高20%封顶上限。</w:t>
      </w:r>
    </w:p>
  </w:comment>
  <w:comment w:id="3" w:author="陈思齐 (法务合规顾问)" w:date="2026-09-29T14:20:00Z" w:initials="CSQ">
    <w:p w14:paraId="3333CCCC">
      <w:r>
        <w:t>双方处于不同省份，异地诉讼维权差旅与取证成本过高。建议优先争取选定上海国际仲裁中心（SHIAC）进行仲裁，一裁终局且保密性更好。</w:t>
      </w:r>
    </w:p>
  </w:comment>
</w:comments>`
  );

  // 5. word/commentsExtended.xml (Resolved status)
  zip.file(
    'word/commentsExtended.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">
  <w15:commentEx w15:paraId="1111AAAA" w15:done="0"/>
  <w15:commentEx w15:paraId="2222BBBB" w15:done="0"/>
  <w15:commentEx w15:paraId="3333CCCC" w15:done="1"/>
</w15:commentsEx>`
  );

  // 6. word/document.xml with contract clauses and anchored comment ranges
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Title -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>智能企业级软件定制开发与系统运维服务合同</w:t></w:r>
    </w:p>

    <!-- Clause 0: Preamble -->
    <w:p>
      <w:r><w:t>甲方（委托方）：上海汇智未来信息技术有限公司</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>乙方（开发方）：北京深蓝智控软件开发有限公司</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>鉴于甲方需要定制开发企业智能运营中台系统，乙方具备专业技术能力与软件架构经验，双方经友好协商达成如下协议。</w:t></w:r>
    </w:p>

    <!-- Clause 1: Service Content -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第一条 项目服务内容与技术成果交付</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>1.1 乙方应按照本合同附件一《软件技术规格说明书》及技术方案要求，完成系统后端架构搭建与前端UI界面开发。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>1.2 乙方应向甲方交付全部软件源代码、编译构建脚本、数据库DDL结构及详细部署架构文档。</w:t></w:r>
    </w:p>

    <!-- Clause 2: Payment Terms (with Comment 1) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第二条 合同价款与支付结算周期</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>2.1 本合同技术开发与服务总金额为人民币贰佰捌拾万元整（¥2,800,000.00）。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>2.2 付款进度：项目初验合格并提供阶段报告后，款项需经</w:t></w:r>
      <w:commentRangeStart w:id="1"/>
      <w:r><w:t>内部财务审核无异议后于60个工作日内支付</w:t></w:r>
      <w:commentRangeEnd w:id="1"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="1"/>
      </w:r>
      <w:r><w:t>首期开发款项。</w:t></w:r>
    </w:p>

    <!-- Clause 3: Intellectual Property -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第三条 知识产权与成果归属保护</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>3.1 乙方为本项目定制开发的业务逻辑源代码自甲方支付完毕全部阶段款项之日起归甲方所有。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>3.2 乙方保留其在签约前已独立研发拥有的基础平台框架底层组件与通用算法库的著作权。</w:t></w:r>
    </w:p>

    <!-- Clause 4: Breach of Contract (with Comment 2) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第四条 违约责任与损害赔偿限额</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>4.1 任一方违反本合同约定义务造成对方直接经济损失的，应承担违约赔偿责任。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>4.2 如乙方未能在规定工期内交付系统，</w:t></w:r>
      <w:commentRangeStart w:id="2"/>
      <w:r><w:t>违约金应按合同总金额的30%计算，且不免除进一步损害赔偿</w:t></w:r>
      <w:commentRangeEnd w:id="2"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="2"/>
      </w:r>
      <w:r><w:t>责任。</w:t></w:r>
    </w:p>

    <!-- Clause 5: Dispute Resolution (with Comment 3) -->
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>第五条 争议解决与管辖法院</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>5.1 因本合同履行引起的任何争议，双方应首先通过友好协商解决。</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>5.2 协商不成的，任何一方均有权</w:t></w:r>
      <w:commentRangeStart w:id="3"/>
      <w:r><w:t>向甲方所在地有管辖权的人民法院提起诉讼</w:t></w:r>
      <w:commentRangeEnd w:id="3"/>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:commentReference w:id="3"/>
      </w:r>
      <w:r><w:t>。</w:t></w:r>
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

  it('1. should accurately extract Word native comments from OpenXML', async () => {
    const parseResult = await astParser.parseToAstDetailed({
      base64: docxBuffer.toString('base64'),
      fileName: '智能企业级软件定制开发与系统运维服务合同.docx',
    });

    expect(parseResult.clauses.length).toBeGreaterThanOrEqual(5);
    expect(parseResult.comments).toBeDefined();
    expect(parseResult.comments!.length).toBe(3);

    const c1 = parseResult.comments!.find((c) => c.id === '1');
    expect(c1).toBeDefined();
    expect(c1!.author).toContain('王建国');
    expect(c1!.selectedText).toBe('内部财务审核无异议后于60个工作日内支付');
    expect(c1!.text).toContain('《保障中小企业款项支付条例》');
    expect(c1!.isResolved).toBe(false);

    const c2 = parseResult.comments!.find((c) => c.id === '2');
    expect(c2).toBeDefined();
    expect(c2!.author).toContain('李晓敏');
    expect(c2!.selectedText).toBe('违约金应按合同总金额的30%计算，且不免除进一步损害赔偿');
    expect(c2!.isResolved).toBe(false);

    const c3 = parseResult.comments!.find((c) => c.id === '3');
    expect(c3).toBeDefined();
    expect(c3!.author).toContain('陈思齐');
    expect(c3!.selectedText).toBe('向甲方所在地有管辖权的人民法院提起诉讼');
    expect(c3!.isResolved).toBe(true);
  });

  it('2. should bind comments to their respective contract clauses', async () => {
    const parseResult = await astParser.parseToAstDetailed({
      base64: docxBuffer.toString('base64'),
      fileName: '智能企业级软件定制开发与系统运维服务合同.docx',
    });

    // Clause 2 (价款与支付结算周期) should have comment 1
    const paymentClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('2') || c.title.includes('价款'));
    expect(paymentClause).toBeDefined();
    expect(paymentClause!.comments).toBeDefined();
    expect(paymentClause!.comments!.some((c) => c.id === '1')).toBe(true);

    // Clause 4 (违约责任) should have comment 2
    const breachClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('4') || c.title.includes('违约责任'));
    expect(breachClause).toBeDefined();
    expect(breachClause!.comments).toBeDefined();
    expect(breachClause!.comments!.some((c) => c.id === '2')).toBe(true);

    // Clause 5 (争议解决) should have comment 3
    const disputeClause = parseResult.clauses.find((c) => c.clauseNumber?.includes('5') || c.title.includes('争议解决'));
    expect(disputeClause).toBeDefined();
    expect(disputeClause!.comments).toBeDefined();
    expect(disputeClause!.comments!.some((c) => c.id === '3')).toBe(true);
  });

  it('3. should generate complete end-to-end interactive HTML report with comment highlights and cards', async () => {
    const reviewResult = await reviewService.reviewContract({
      fileBase64: docxBuffer.toString('base64'),
      fileName: '智能企业级软件定制开发与系统运维服务合同.docx',
      skipLlmReview: true,
    });

    expect(reviewResult.comments).toBeDefined();
    expect(reviewResult.comments!.length).toBe(3);

    const html = reviewResult.htmlReport;

    // Check Document Paper comment highlight elements
    expect(html).toContain('id="comment-target-1"');
    expect(html).toContain('id="comment-target-2"');
    expect(html).toContain('id="comment-target-3"');
    expect(html).toContain('docx-comment-highlight');
    expect(html).toContain('💬 批注 #1');
    expect(html).toContain('💬 批注 #2');
    expect(html).toContain('💬 批注 #3');

    // Check Workbench comment cards
    expect(html).toContain('id="comment-card-1"');
    expect(html).toContain('id="comment-card-2"');
    expect(html).toContain('id="comment-card-3"');
    expect(html).toContain('王建国 (法务合规总监)');
    expect(html).toContain('李晓敏 (高级商业法务)');
    expect(html).toContain('陈思齐 (法务合规顾问)');
    expect(html).toContain('《保障中小企业款项支付条例》');
    expect(html).toContain('待处理');
    expect(html).toContain('已解决');

    // Check Top Bar Filter Tab for comments
    expect(html).toContain('💬 批注');
    expect(html).toContain('applyFilter(\'comments\', this)');

    // Check Sidebar Comment Creation Workspace
    expect(html).toContain('id="comment-create-workspace"');
    expect(html).toContain('拟定新批注');
    expect(html).toContain('id="comment-create-author"');
    expect(html).toContain('id="comment-create-text"');
    expect(html).toContain('submitCommentCreateFromSidebar()');

    // Check Comment Hover Popover
    expect(html).toContain('id="comment-hover-popover"');

    // Save test docx and generated preview HTML for browser verification
    const { WORKSPACE_ROOT } = await import('../document-payload-resolver.helper');
    const outputDir = path.join(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine', 'renders');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const testDocxPath = path.join(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine', '智能企业级软件定制开发与系统运维服务合同.docx');
    fs.writeFileSync(testDocxPath, docxBuffer);

    const previewHtmlPath = path.join(outputDir, 'test_word_comments_preview.html');
    fs.writeFileSync(previewHtmlPath, html, 'utf8');

    expect(fs.existsSync(testDocxPath)).toBe(true);
    expect(fs.existsSync(previewHtmlPath)).toBe(true);
  });
});
