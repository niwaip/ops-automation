import { ContractReviewHtmlRendererService } from './contract-review-html-renderer.service';
import type { ClauseReviewItem, ReviewChapterGroup } from './contract-review.types';

describe('ContractReviewHtmlRendererService - Bilingual & Section Title Logic', () => {
  let renderer: ContractReviewHtmlRendererService;

  beforeEach(() => {
    renderer = new ContractReviewHtmlRendererService();
  });

  it('renders Japanese bilingual contract with proper chapter title and no heading duplication', () => {
    const clauses: ClauseReviewItem[] = [
      {
        clauseIndex: 1,
        clauseNumber: '一、',
        title: '技术服务内容、方式',
        titleJa: '技術サービスの内容、方式：',
        originalContent: '技术服务内容、方式',
        riskLevel: 'PASS',
        riskSummary: '',
        legalAdvice: '',
        matchedCheckpoints: [],
        blocks: [
          {
            id: 'blk-0',
            type: 'heading',
            primaryText: '一、技术服务内容、方式：',
            secondaryText: '技術サービスの内容、方式：',
            isBold: true,
          },
          {
            id: 'blk-1',
            type: 'bilingual_pair',
            primaryText: '本合同项下之技术服务内容、方式详见附件一。',
            secondaryText: '本契約に規定される技術サービスの内容及び実行方式についての詳細は付属文書一を参照。',
          },
        ],
      },
    ];

    const chapters: ReviewChapterGroup[] = [
      {
        chapterIndex: 1,
        chapterNumber: '正文',
        chapterTitle: '合同正文条款',
        clauses,
        highRiskCount: 0,
        mediumRiskCount: 0,
        passCount: 1,
      },
    ];

    const html = renderer.renderHtmlReport({
      fileName: '技术服务合同_中日双语.docx',
      contractType: 'general',
      contractTypeName: '技术服务合同',
      myPosition: 'buyer',
      metrics: {
        totalClauses: 1,
        healthScore: 100,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        missingClausesCount: 0,
        passCount: 1,
      },
      clauses,
      chapters,
      missingClauses: [],
    });

    // 1. Language switcher shows "日文"
    expect(html).toContain('日文');
    expect(html).toContain('id="lang-btn-ja"');

    // 2. Default chapter "合同正文条款" has Japanese translation "契約本文条項"
    expect(html).toContain('合同正文条款');
    expect(html).toContain('契約本文条項');
    expect(html).toContain('chapter-title-zh');
    expect(html).toContain('chapter-title-ja');

    // 3. Clause heading row contains both Chinese title and Japanese title
    expect(html).toContain('一、 技术服务内容、方式');
    expect(html).toContain('技術サービスの内容、方式：');

    // 4. Duplicate heading block is suppressed from clause body
    // Should NOT contain a standalone h3 with duplicated text
    expect(html).not.toMatch(/<h3[^>]*>[\s\S]*?一、技术服务内容、方式[\s\S]*?<\/h3>/);

    // 5. No hardcoded "/ " prefix on secondary text
    expect(html).not.toContain('/ 技術サービスの内容');
  });

  it('renders English bilingual contract and dynamically labels button as "English"', () => {
    const clauses: ClauseReviewItem[] = [
      {
        clauseIndex: 1,
        clauseNumber: '1.',
        title: 'Scope of Services',
        titleJa: 'Scope of Services and Deliverables',
        originalContent: '服务范围与交付物',
        riskLevel: 'PASS',
        riskSummary: '',
        legalAdvice: '',
        matchedCheckpoints: [],
        blocks: [
          {
            id: 'blk-0',
            type: 'heading',
            primaryText: '1. 服务范围与交付物',
            secondaryText: '1. Scope of Services and Deliverables',
            isBold: true,
          },
          {
            id: 'blk-1',
            type: 'bilingual_pair',
            primaryText: '乙方应按本协议约定提供服务。',
            secondaryText: 'Party B shall provide the Services in accordance with this Agreement.',
          },
        ],
      },
    ];

    const chapters: ReviewChapterGroup[] = [
      {
        chapterIndex: 1,
        chapterNumber: '正文',
        chapterTitle: '合同正文条款',
        clauses,
        highRiskCount: 0,
        mediumRiskCount: 0,
        passCount: 1,
      },
    ];

    const html = renderer.renderHtmlReport({
      fileName: 'Master_Services_Agreement_EN_CN.docx',
      contractType: 'general',
      contractTypeName: '技术服务合同',
      myPosition: 'buyer',
      metrics: {
        totalClauses: 1,
        healthScore: 100,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        missingClausesCount: 0,
        passCount: 1,
      },
      clauses,
      chapters,
      missingClauses: [],
    });

    // 1. Language button dynamically adapts to English
    expect(html).toContain('English');
    expect(html).not.toContain('>日文<');

    // 2. Default chapter has English translation
    expect(html).toContain('Contract Terms &amp; Conditions');
  });

  it('hides language switcher when contract is pure Chinese monolingual', () => {
    const clauses: ClauseReviewItem[] = [
      {
        clauseIndex: 1,
        clauseNumber: '第一条',
        title: '保密信息定义',
        originalContent: '本协议所称保密信息是指一方披露给另一方的商业秘密。',
        riskLevel: 'PASS',
        riskSummary: '',
        legalAdvice: '',
        matchedCheckpoints: [],
        blocks: [
          {
            id: 'blk-0',
            type: 'heading',
            primaryText: '第一条 保密信息定义',
            isBold: true,
          },
          {
            id: 'blk-1',
            type: 'paragraph',
            primaryText: '本协议所称保密信息是指一方披露给另一方的商业秘密。',
          },
        ],
      },
    ];

    const html = renderer.renderHtmlReport({
      fileName: '保密协议_单语版.docx',
      contractType: 'nda',
      contractTypeName: '保密协议',
      myPosition: 'buyer',
      metrics: {
        totalClauses: 1,
        healthScore: 100,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
        missingClausesCount: 0,
        passCount: 1,
      },
      clauses,
      missingClauses: [],
    });

    // Language switcher should not be present
    expect(html).not.toContain('id="lang-btn-both"');
    expect(html).not.toContain('id="lang-btn-zh"');
    expect(html).not.toContain('id="lang-btn-ja"');
  });
});
