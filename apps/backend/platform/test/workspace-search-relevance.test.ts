import {
  buildQueryTokenProfile,
  scoreCandidateNode,
  evaluateDocumentRelevance,
} from '../../governance/workbench/src/workspace/workspace-search-relevance.helper';

describe('WorkspaceSearchRelevanceHelper', () => {
  describe('buildQueryTokenProfile', () => {
    it('correctly classifies core entities vs generic action terms for "deepseek harness的安装方法"', () => {
      const profile = buildQueryTokenProfile('deepseek harness的安装方法');
      expect(profile.hasCoreEntities).toBe(true);
      expect(profile.coreEntities).toContain('deepseek');
      expect(profile.coreEntities).toContain('harness');
      expect(profile.genericTokens).toContain('安装');
    });

    it('correctly identifies compound identifiers as core entities', () => {
      const profile = buildQueryTokenProfile('查询 AD-Q8VN-6173 的相关记录');
      expect(profile.hasCoreEntities).toBe(true);
      expect(profile.coreEntities).toContain('AD-Q8VN-6173');
    });

    it('handles purely generic queries gracefully without failing', () => {
      const profile = buildQueryTokenProfile('安装配置说明');
      expect(profile.hasCoreEntities).toBe(false);
      expect(profile.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateDocumentRelevance - Gating and Noise Pruning', () => {
    const profile = buildQueryTokenProfile('deepseek harness的安装方法');

    it('PRUNES irrelevant document that merely mentions "安装" without any core entities', () => {
      const evaluation = evaluateDocumentRelevance({
        nodeName: 'docker_deploy_mysql.md',
        digestSummary: 'MySQL 数据库的部署流程与环境准备',
        profile,
        contentMatches: [
          { line: 12, snippet: '请执行 apt-get 安装必要的依赖包' },
        ],
        baseScore: 10,
      });

      // Crucial test: MUST be rejected!
      expect(evaluation.admitted).toBe(false);
      expect(evaluation.hasCoreEntityMatch).toBe(false);
      expect(evaluation.relevanceConfidence).toBe('rejected');
    });

    it('ADMITS document that mentions "deepseek" or "harness" with high confidence', () => {
      const evaluation = evaluateDocumentRelevance({
        nodeName: 'deepseek_harness_setup.md',
        digestSummary: 'DeepSeek Harness CLI 与 Python SDK 快速起步安装教程',
        profile,
        contentMatches: [
          { line: 5, snippet: 'DeepSeek Harness (dsh) 提供了全方位的安装部署形态' },
        ],
        baseScore: 50,
      });

      expect(evaluation.admitted).toBe(true);
      expect(evaluation.hasCoreEntityMatch).toBe(true);
      expect(evaluation.totalScore).toBeGreaterThan(80);
      expect(evaluation.relevanceConfidence).toBe('high');
    });

    it('ADMITS exact query match regardless of generic words', () => {
      const evaluation = evaluateDocumentRelevance({
        nodeName: 'notes.txt',
        digestSummary: undefined,
        profile,
        contentMatches: [
          { line: 1, snippet: 'deepseek harness的安装方法 如下：' },
        ],
        baseScore: 0,
      });

      expect(evaluation.admitted).toBe(true);
      expect(evaluation.hasExactQueryMatch).toBe(true);
      expect(evaluation.totalScore).toBeGreaterThanOrEqual(60);
    });

    it('ADMITS document whose keyTopics contain core entities even if contentMatches is empty', () => {
      const evaluation = evaluateDocumentRelevance({
        nodeName: 'system_manual.pdf',
        digestSummary: '系统整体使用规程与部署',
        digestJson: {
          keyTopics: ['DeepSeek', 'Harness', 'DSH'],
        },
        profile,
        contentMatches: [],
        baseScore: 0,
      });

      expect(evaluation.admitted).toBe(true);
      expect(evaluation.hasCoreEntityMatch).toBe(true);
      expect(evaluation.totalScore).toBeGreaterThanOrEqual(35);
    });

    it('ADMITS document whose extractedData matches specific queried entity or credential', () => {
      const idProfile = buildQueryTokenProfile('AD-Q8VN-6173 验收结果');
      const evaluation = evaluateDocumentRelevance({
        nodeName: 'project_report.docx',
        digestSummary: '项目交付验收总结',
        digestJson: {
          extractedData: {
            '验收口令': 'AD-Q8VN-6173',
            '负责人': '张工',
            '预算': '120万元',
          },
        },
        profile: idProfile,
        contentMatches: [],
        baseScore: 0,
      });

      expect(evaluation.admitted).toBe(true);
      expect(evaluation.hasCoreEntityMatch).toBe(true);
      expect(evaluation.totalScore).toBeGreaterThanOrEqual(35);
    });
  });

  describe('scoreCandidateNode - Digest Weighting', () => {
    it('awards high bonus when keyTopics, extractedData, or cleanedContent match query', () => {
      const profile = buildQueryTokenProfile('AD-Q8VN-6173 验收口令');
      const score = scoreCandidateNode(
        {
          name: 'acceptance.md',
          digestJson: {
            summary: '项目终审验收报告',
            keyTopics: ['AD-Q8VN-6173', 'SWE-CI'],
            extractedData: { '验收口令': 'AD-Q8VN-6173' },
            cleanedContent: '经自动化流水线核验，口令 AD-Q8VN-6173 判定符合准出标准。',
          },
        },
        profile
      );

      // Score should be boosted significantly by keyTopics (45) + extractedData (40) + cleanedContent
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('awards partial recall score for short prefix in keyTopics (recall phase is lenient)', () => {
      const profile = buildQueryTokenProfile('全文精确检索“AD-Q8VN-9999”');
      const score = scoreCandidateNode(
        {
          name: 'personal_summary.md',
          digestJson: {
            summary: '个人第四季度工作总结',
            keyTopics: ['AD-Q8VN'], // 仅含短前缀
          },
        },
        profile
      );

      // 短前缀作为初步找回线索获得一定分数（>0），但低于完整命中的高分
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(35);
    });
  });

  describe('evaluateDocumentRelevance - Consistency Verification Gate', () => {
    it('REJECTS candidate that only matches short prefix #AD-Q8VN when full ID AD-Q8VN-9999 is queried', () => {
      const profile = buildQueryTokenProfile('全文精确检索“AD-Q8VN-9999”');
      expect(profile.exactIdentifiers).toContain('AD-Q8VN-9999');
      expect(profile.isStrictVerification).toBe(true);

      const evaluation = evaluateDocumentRelevance({
        nodeName: 'personal_notes.md',
        digestSummary: '个人工作与技术沉淀',
        digestJson: {
          keyTopics: ['AD-Q8VN', 'Ops'], // 仅短前缀
        },
        profile,
        contentMatches: [],
        baseScore: 10,
      });

      // 关键门控验证：必须拦截！不能冒充完整编号命中！
      expect(evaluation.admitted).toBe(false);
      expect(evaluation.consistencyVerified).toBe(false);
      expect(evaluation.isPartialMatchOnly).toBe(true);
      expect(evaluation.matchedTokens).not.toContain('AD-Q8VN-9999');
      expect(evaluation.relevanceConfidence).toBe('rejected');
    });

    it('ADMITS candidate that genuinely contains full ID AD-Q8VN-6173 in content matches', () => {
      const profile = buildQueryTokenProfile('全文精确检索“AD-Q8VN-6173”');
      const evaluation = evaluateDocumentRelevance({
        nodeName: 'company_acceptance.md',
        digestSummary: '星桥项目验收报告',
        digestJson: {
          keyTopics: ['星桥项目', '验收'],
        },
        profile,
        contentMatches: [
          { line: 8, snippet: '【终审口令】AD-Q8VN-6173 判定符合准出标准' },
        ],
        baseScore: 20,
      });

      expect(evaluation.admitted).toBe(true);
      expect(evaluation.consistencyVerified).toBe(true);
      expect(evaluation.hasCoreEntityMatch).toBe(true);
      expect(evaluation.relevanceConfidence).toBe('high');
      expect(evaluation.matchedTokens).toContain('AD-Q8VN-6173');
    });

    it('REJECTS batch-prefix collision (e.g. GREPE2E...-A17 vs ABSENT files sharing same prefix)', () => {
      const profile = buildQueryTokenProfile('精确检索 GREPE2E1792117407979-A17，未命中请明确说明');
      expect(profile.exactIdentifiers).toContain('GREPE2E1792117407979-A17');

      // 候选文件只共享了批次前缀 GREPE2E1792117407979，但是不包含 A17 后缀
      const collisionEvaluation = evaluateDocumentRelevance({
        nodeName: 'GREPE2E1792117407979-ABSENT.md',
        digestSummary: '批次未命中测试文件 GREPE2E1792117407979-ABSENT',
        profile,
        contentMatches: [
          { line: 1, snippet: '这是批次 GREPE2E1792117407979 的 ABSENT 文件' },
        ],
        baseScore: 10,
      });

      // 门控断言失败：后缀不一致，拦截！
      expect(collisionEvaluation.admitted).toBe(false);
      expect(collisionEvaluation.consistencyVerified).toBe(false);
    });

    it('REJECTS unhyphenated entity prefix spoofing (e.g. UNSEEN12345 vs UNSEEN)', () => {
      const profile = buildQueryTokenProfile('全文精确检索“UNSEEN12345”');
      expect(profile.exactIdentifiers).toContain('UNSEEN12345');

      const evaluation = evaluateDocumentRelevance({
        nodeName: 'general_notes.md',
        digestSummary: '未见过的测试记录',
        digestJson: {
          keyTopics: ['UNSEEN'], // 仅短前缀
        },
        profile,
        contentMatches: [],
        baseScore: 10,
      });

      expect(evaluation.admitted).toBe(false);
      expect(evaluation.consistencyVerified).toBe(false);
      expect(evaluation.isPartialMatchOnly).toBe(true);
    });

    it('REJECTS Chinese entity prefix spoofing when query demands full entity in strict verification', () => {
      const profile = buildQueryTokenProfile('全文精确检索“星桥特级管理工程”，未命中请明确说明');
      expect(profile.exactIdentifiers).toContain('星桥特级管理工程');

      const evaluation = evaluateDocumentRelevance({
        nodeName: 'xingqiao_basic.md',
        digestSummary: '普通星桥资料',
        digestJson: {
          keyTopics: ['星桥'], // 仅短前缀
        },
        profile,
        contentMatches: [],
        baseScore: 10,
      });

      expect(evaluation.admitted).toBe(false);
      expect(evaluation.consistencyVerified).toBe(false);
    });
  });

  describe('extractMetadataMatchSnippets - Structured Attribution & Safe Line Numbers', () => {
    it('populates sourceKind and safe line 0 for structured data, topics, and summary', () => {
      const { extractMetadataMatchSnippets } = require('../../governance/workbench/src/workspace/workspace-search-relevance.helper');
      const snippets = extractMetadataMatchSnippets({
        digestJson: {
          extractedData: { '验收口令': 'AD-Q8VN-6173' },
          keyTopics: ['星桥项目'],
          summary: '项目终审完成',
        },
        searchTokens: ['AD-Q8VN-6173'],
        rawQuery: 'AD-Q8VN-6173',
      });

      expect(snippets.length).toBeGreaterThan(0);
      expect(snippets[0].line).toBe(0);
      expect(snippets[0].sourceKind).toBe('structured_data');
      expect(snippets[0].snippet).toContain('AD-Q8VN-6173');
    });
  });
});



