import type { ContentMatchSnippet } from './dto/workspace.dto';


export interface QueryTokenProfile {
  rawQuery: string;
  cleanedQuery: string;
  tokens: string[];
  coreEntities: string[];
  genericTokens: string[];
  hasCoreEntities: boolean;
  exactIdentifiers: string[];
  isStrictVerification: boolean;
}

export interface DocumentRelevanceEvaluation {
  totalScore: number;
  hasExactQueryMatch: boolean;
  hasCoreEntityMatch: boolean;
  admitted: boolean;
  matchedTokens: string[];
  relevanceConfidence: 'high' | 'medium' | 'low' | 'rejected';
  consistencyVerified: boolean;
  isPartialMatchOnly: boolean;
  physicalVerified: boolean;
}

/**
 * 标准通用分词/实体边界对齐校验
 * 检验 token 是否以完整实体边界（非更长复合标识符的中间切片或前后缀）出现在 text 中。
 * 针对 ASCII/字母数字/连词（[a-zA-Z0-9_-]）：要求前后不能紧邻同类字符。
 * 针对 CJK 等多语言实体：要求前后不能紧邻未断词的字符。
 */
export function hasTokenBoundaryAlignment(token: string, text: string): boolean {
  if (!token || !text) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isIdentifier = /^[a-zA-Z0-9_-]+$/.test(token);
  if (isIdentifier) {
    // 标识符前后不能紧邻字母、数字、下划线或连字符
    const pattern = new RegExp(`(?<![a-zA-Z0-9_-])${escaped}(?![a-zA-Z0-9_-])`, 'i');
    return pattern.test(text);
  }
  const startsWithWord = /^[\w\u4e00-\u9fa5]/.test(token);
  const endsWithWord = /[\w\u4e00-\u9fa5]$/.test(token);
  const prefix = startsWithWord ? '(?<![a-zA-Z0-9])' : '';
  const suffix = endsWithWord ? '(?![a-zA-Z0-9])' : '';
  const pattern = new RegExp(`${prefix}${escaped}${suffix}`, 'i');
  return pattern.test(text);
}

/**
 * 判断两个词是否属于子串/前后缀部分包含（非完全相等）
 */
export function isPartialTokenMatch(queryToken: string, candidateToken: string): boolean {
  const q = queryToken.toLowerCase().trim();
  const c = candidateToken.toLowerCase().trim();
  if (!q || !c || q === c) return false;
  return q.includes(c) || c.includes(q);
}

/**
 * 判断是否为高确定性业务编号/口令/标识符（如 AD-Q8VN-9999, KS-7Q4M-9286, GREPE2E1792117407979-A17, UNSEEN1792117757998）
 */
export function isExactIdentifier(token: string): boolean {
  const t = (token || '').trim();
  if (t.length < 3) return false;
  // 连字符/下划线/冒号分段的字母数字编号
  if (/^[a-zA-Z0-9]+(?:[-_.:#][a-zA-Z0-9]+)+$/i.test(t)) return true;
  // 字母与数字复合编号 (如 GREPE2E1792117407979-A17, UNSEEN1792117757998, SN1024, DOC-99)
  if (/^[a-zA-Z]+[0-9]+[a-zA-Z0-9_-]*$/i.test(t) || /^[0-9]+[a-zA-Z]+[a-zA-Z0-9_-]*$/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * 低信息量通用操作词/属性词表（在代码与运维知识库中极高频出现，不具备独立区分度）
 */
export const GENERIC_ACTION_TERMS = new Set([
  '安装', '配置', '使用', '说明', '教程', '指南', '步骤', '脚本', '部署',
  '运行', '开发', '测试', '系统', '文件', '服务', '平台', '接口', '版本',
  '项目', '代码', '环境', '文档', '数据', '更新', '下载', '创建', '执行',
  '管理', '操作', '启动', '停止', '重启', '查询', '查看', '记录', '列表',
  '规范', '流程', '工具', '方法', '问题', '处理', '方案', '排查', '总结',
  'install', 'setup', 'config', 'configuration', 'guide', 'doc', 'docs',
  'readme', 'manual', 'run', 'start', 'test', 'script', 'deploy', 'help',
]);

/**
 * 停用词列表（无检索价值的口语化虚词、疑问词）
 */
export const STOP_WORDS = new Set([
  '请问', '请帮我', '帮我', '查找', '查阅', '搜索', '关于', '有什么', '介绍一下', '解释一下',
  '总结', '具体', '怎么', '如何', '的', '了', '中', '在', '与', '及',
  '和', '分别', '是什么', '是多少', '有哪些', '内容', '请附', '附上', '来源', '资料来源', '出处',
  '请列出', '请给出', '分别是什么', '分别是多少', '分别有哪些',
]);

/**
 * 判断一个词是否属于纯通用操作/属性词（或由多个通用词复合拼接而成，如“安装配置”、“部署教程”）
 */
export function isGenericActionTerm(term: string): boolean {
  const lower = term.toLowerCase().trim();
  if (!lower) return false;
  if (GENERIC_ACTION_TERMS.has(lower)) return true;

  // 纯英文/数字标识符（如 dsh, ks-01, python）优先视为实体
  if (/^[a-z0-9_\-]+$/i.test(lower) && !GENERIC_ACTION_TERMS.has(lower)) {
    return false;
  }

  // 检查是否全由通用词切片拼接而成（如“安装配置说明”、“部署方法”）
  for (const generic of GENERIC_ACTION_TERMS) {
    if (lower.includes(generic)) {
      const remainder = lower.replace(new RegExp(generic, 'gi'), '');
      if (remainder.length === 0 || GENERIC_ACTION_TERMS.has(remainder) || remainder.length <= 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 分词预处理并对关键词进行信息量（实体 vs 通用词）分级
 */
export function buildQueryTokenProfile(query: string): QueryTokenProfile {
  const q = (query || '').trim();
  if (!q) {
    return {
      rawQuery: '',
      cleanedQuery: '',
      tokens: [],
      coreEntities: [],
      genericTokens: [],
      hasCoreEntities: false,
      exactIdentifiers: [],
      isStrictVerification: false,
    };
  }

  // 1. 分词切分：优先保留连字符字母数字复合标识符（如 KS-7Q4M-9286、dsh-v1.0），并在标点、引号、连词与疑问词处切分
  const rawTokens = q
    .split(/[\s，,。？?！!；;、/""''“”‘’\(\)（）\[\]【】]+/)
    .flatMap((part) =>
      part.split(/(?:关于|对于|和|与|及|以及|的|分别|是|什么|是多少|有哪些|请附|资料来源|来源|方法|教程|指南|步骤|说明)/)
    )
    .map((t) => t.replace(/["“'‘"”'’]/g, '').trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t.toLowerCase()));

  const tokens = rawTokens.length > 0 ? Array.from(new Set(rawTokens)) : [q];

  const coreEntities: string[] = [];
  const genericTokens: string[] = [];
  const exactIdentifiers: string[] = [];

  // 提取用户显式引号包裹的精确词
  const quoteMatches = q.match(/["“'‘]([^"”'’]{2,})["”'’]/g);
  if (quoteMatches) {
    for (const qm of quoteMatches) {
      const stripped = qm.replace(/["“'‘"”'’]/g, '').trim();
      if (stripped.length >= 2) {
        exactIdentifiers.push(stripped);
      }
    }
  }

  for (const token of tokens) {
    const isGeneric = isGenericActionTerm(token);
    if (isGeneric) {
      genericTokens.push(token);
    } else {
      coreEntities.push(token);
      if (isExactIdentifier(token)) {
        exactIdentifiers.push(token);
      }
    }
  }

  // 若存在非通用实体，则开启核心实体门禁
  const hasCoreEntities = coreEntities.length > 0;

  // 严格查证模式判定（如用户明确要求精确检索、未命中明确说明、不要返回其他文档等）
  const isStrictVerification =
    /(?:全文精确检索|精确检索|精确查询|不要拆分|未命中请明确说明|未命中明确说明|不要返回其他|从原文核对|逐项核对|纯原文|查证)/i.test(
      q
    ) || exactIdentifiers.length > 0;

  return {
    rawQuery: q,
    cleanedQuery: q,
    tokens,
    coreEntities,
    genericTokens,
    hasCoreEntities,
    exactIdentifiers: Array.from(new Set(exactIdentifiers)),
    isStrictVerification,
  };
}

/**
 * 针对候选节点的初步打分（元数据阶段：基于文件名、AI 摘要、扩展名）
 */
export function scoreCandidateNode(
  node: { name: string; digestJson?: any },
  profile: QueryTokenProfile
): number {
  let score = 0;
  const lowerName = node.name.toLowerCase();
  const lowerQuery = profile.rawQuery.toLowerCase();

  // 1. 文件名完整匹配整句（最高置信度）
  if (lowerName.includes(lowerQuery)) {
    score += 100;
  }

  // 2. 文件名核心实体与通用词命中
  for (const entity of profile.coreEntities) {
    if (lowerName.includes(entity.toLowerCase())) {
      score += 40;
    }
  }
  for (const generic of profile.genericTokens) {
    if (lowerName.includes(generic.toLowerCase())) {
      score += 8;
    }
  }

  // 3. 伴生结构化摘要、AI 清洗正文、核心标签与关键业务数据命中
  const digest = node.digestJson as {
    summary?: string;
    cleanedContent?: string;
    keyTopics?: string[];
    extractedData?: Record<string, any>;
  } | undefined;

  if (digest?.summary) {
    const lowerSummary = digest.summary.toLowerCase();
    if (lowerSummary.includes(lowerQuery)) {
      score += 50;
    }
    for (const entity of profile.coreEntities) {
      if (lowerSummary.includes(entity.toLowerCase())) {
        score += 25;
      }
    }
    for (const generic of profile.genericTokens) {
      if (lowerSummary.includes(generic.toLowerCase())) {
        score += 5;
      }
    }
  }

  // 3.1 充分利用 AI 提取的核心主题标签 (Key Topics & Entities)
  if (Array.isArray(digest?.keyTopics) && digest.keyTopics.length > 0) {
    const topicsLower = digest.keyTopics.map((t) => String(t).toLowerCase());
    if (topicsLower.some((t) => t === lowerQuery || t.includes(lowerQuery))) {
      score += 60;
    }
    for (const entity of profile.coreEntities) {
      const lowerEntity = entity.toLowerCase();
      if (topicsLower.includes(lowerEntity)) {
        score += 35;
      } else if (topicsLower.some((t) => isPartialTokenMatch(lowerEntity, t))) {
        // 短前缀/子串匹配（如长编号包含短标签）：允许部分一致找回，给适度粗排分进入候选池，但不给完全命中高分
        score += 10;
      }
    }
    for (const generic of profile.genericTokens) {
      const lowerGeneric = generic.toLowerCase();
      if (topicsLower.some((t) => t.includes(lowerGeneric))) {
        score += 6;
      }
    }
  }

  // 3.2 充分利用 AI 结构化抽取的数据 (Extracted Data: 如验收口令、预算金额、参数等)
  if (digest?.extractedData && typeof digest.extractedData === 'object') {
    try {
      const extractedStr = JSON.stringify(digest.extractedData).toLowerCase();
      if (extractedStr.includes(lowerQuery)) {
        score += 60;
      }
      for (const entity of profile.coreEntities) {
        if (extractedStr.includes(entity.toLowerCase())) {
          score += 40;
        }
      }
    } catch {
      // ignore json serialize error
    }
  }

  // 3.3 充分利用 AI 清洗后的高浓度纯事实正文 (Cleaned Content)
  if (digest?.cleanedContent) {
    const lowerCleaned = digest.cleanedContent.toLowerCase();
    if (lowerCleaned.includes(lowerQuery)) {
      score += 45;
    }
    for (const entity of profile.coreEntities) {
      if (lowerCleaned.includes(entity.toLowerCase())) {
        score += 25;
      }
    }
  }

  // 4. 文档类文件格式加分
  const ext = lowerName.slice(lowerName.lastIndexOf('.'));
  if (['.md', '.txt', '.docx', '.pdf'].includes(ext)) {
    score += 10;
  }

  return score;
}

/**
 * 综合评估文档的真实内容相关性，执行联合门禁（Co-occurrence Filter）与一致性门控验证
 * 遵循“初筛允许部分一致找回，后续门控严格验证一致性”原则。
 */
export function evaluateDocumentRelevance(params: {
  nodeName: string;
  digestSummary?: string;
  digestJson?: any;
  profile: QueryTokenProfile;
  contentMatches: ContentMatchSnippet[];
  baseScore: number;
}): DocumentRelevanceEvaluation {
  const { nodeName, digestSummary, digestJson, profile, contentMatches, baseScore } = params;

  let totalScore = baseScore;
  const lowerQuery = profile.rawQuery.toLowerCase();
  const lowerName = nodeName.toLowerCase();
  const lowerSummary = (digestSummary || digestJson?.summary || '').toLowerCase();
  const matchedTokens = new Set<string>();

  let hasExactQueryMatch =
    lowerName.includes(lowerQuery) || lowerSummary.includes(lowerQuery);

  let hasCoreEntityMatch = false;

  // 1. 检查文件名与摘要中的实体命中（带边界对齐）
  for (const entity of profile.coreEntities) {
    if (
      hasTokenBoundaryAlignment(entity, nodeName) ||
      hasTokenBoundaryAlignment(entity, lowerSummary)
    ) {
      hasCoreEntityMatch = true;
      matchedTokens.add(entity);
    }
  }

  const digest = digestJson || {};
  let hasPartialPrefixMatch = false;
  const exactMatchedTopics = new Set<string>();

  // 2. 检查核心主题标签 (Key Topics)
  if (Array.isArray(digest.keyTopics)) {
    const topicsLower = digest.keyTopics.map((t: any) => String(t).toLowerCase());
    for (const entity of profile.coreEntities) {
      const lowerEntity = entity.toLowerCase();

      if (topicsLower.includes(lowerEntity)) {
        // 真正完全命中核心实体标签
        hasCoreEntityMatch = true;
        totalScore += 35;
        matchedTokens.add(entity);
        exactMatchedTopics.add(lowerEntity);
      } else if (topicsLower.some((t: string) => isPartialTokenMatch(lowerEntity, t))) {
        // 短前缀/子串匹配（如查询 AD-Q8VN-9999 仅命中标签 AD-Q8VN）
        hasPartialPrefixMatch = true;
        totalScore += 10;
      }
    }
  }

  // 3. 结构化抽取数据 (Extracted Data)
  if (digest.extractedData && typeof digest.extractedData === 'object') {
    try {
      const dataStr = JSON.stringify(digest.extractedData).toLowerCase();
      if (dataStr.includes(lowerQuery)) {
        hasExactQueryMatch = true;
        totalScore += 50;
      }
      for (const entity of profile.coreEntities) {
        if (hasTokenBoundaryAlignment(entity, dataStr)) {
          hasCoreEntityMatch = true;
          totalScore += 35;
          matchedTokens.add(entity);
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. 清洗后的高浓度纯事实正文 (Cleaned Content)
  if (digest.cleanedContent && typeof digest.cleanedContent === 'string') {
    const lowerCleaned = digest.cleanedContent.toLowerCase();
    if (lowerCleaned.includes(lowerQuery)) {
      hasExactQueryMatch = true;
      totalScore += 40;
    }
    for (const entity of profile.coreEntities) {
      if (hasTokenBoundaryAlignment(entity, lowerCleaned)) {
        hasCoreEntityMatch = true;
        totalScore += 25;
        matchedTokens.add(entity);
      }
    }
  }

  // 5. 正文物理行匹配 (Content Matches)
  if (contentMatches.length > 0) {
    for (const match of contentMatches) {
      const lowerSnippet = match.snippet.toLowerCase();

      if (lowerSnippet.includes(lowerQuery)) {
        hasExactQueryMatch = true;
        totalScore += 60;
        matchedTokens.add(profile.rawQuery);
      }

      for (const entity of profile.coreEntities) {
        if (hasTokenBoundaryAlignment(entity, lowerSnippet)) {
          hasCoreEntityMatch = true;
          totalScore += 30;
          matchedTokens.add(entity);
        }
      }

      for (const generic of profile.genericTokens) {
        const lowerGeneric = generic.toLowerCase();
        if (lowerSnippet.includes(lowerGeneric)) {
          totalScore += 5;
          matchedTokens.add(generic);
        }
      }
    }
  }

  // 6. 后置一致性门控核验（Consistency Verification Gate）
  // 严格基于实体边界对齐验证核心实体是否真实存在
  const verifiedCoreEntities = new Set<string>();
  for (const entity of profile.coreEntities) {
    const inName = hasTokenBoundaryAlignment(entity, nodeName);
    const inSummary = hasTokenBoundaryAlignment(entity, lowerSummary);
    const inMatches = contentMatches.some((m) => hasTokenBoundaryAlignment(entity, m.snippet));
    const inCleaned = Boolean(
      digest.cleanedContent && hasTokenBoundaryAlignment(entity, digest.cleanedContent)
    );
    const inExtracted = Boolean(
      digest.extractedData &&
        typeof digest.extractedData === 'object' &&
        hasTokenBoundaryAlignment(entity, JSON.stringify(digest.extractedData))
    );
    const inTopics = exactMatchedTopics.has(entity.toLowerCase());

    if (inName || inSummary || inMatches || inCleaned || inExtracted || inTopics) {
      verifiedCoreEntities.add(entity);
    }
  }

  const verifiedExactIds = new Set<string>();
  for (const exactId of profile.exactIdentifiers) {
    if (verifiedCoreEntities.has(exactId)) {
      verifiedExactIds.add(exactId);
    }
  }

  const consistencyVerified =
    profile.exactIdentifiers.length > 0
      ? verifiedExactIds.size === profile.exactIdentifiers.length
      : profile.coreEntities.length === 0 || verifiedCoreEntities.size > 0;

  const isPartialMatchOnly = hasPartialPrefixMatch && verifiedCoreEntities.size === 0;

  // 综合门控裁决：
  let admitted = true;

  if (contentMatches.length === 0 && !hasExactQueryMatch && !hasCoreEntityMatch) {
    admitted = false;
  } else if (profile.hasCoreEntities && !hasExactQueryMatch && !hasCoreEntityMatch) {
    // 命中仅发生在高频通用词上（如单单出现“安装”），直接拦截并剔除！
    admitted = false;
  } else if (!consistencyVerified) {
    // 【一致性门控断言】：未通过实体一致性验证（仅命中短前缀，或查询的编号未完整命中）
    // 若在严格查证模式或仅有部分前缀匹配，彻底阻断剔除！
    if (profile.isStrictVerification || isPartialMatchOnly || !hasExactQueryMatch) {
      admitted = false;
    }
  } else if (totalScore < 25 && !hasExactQueryMatch) {
    // 最低相关度阈值截断（剔除偶发边缘弱命中）
    admitted = false;
  }

  let relevanceConfidence: 'high' | 'medium' | 'low' | 'rejected' = 'rejected';
  if (admitted) {
    if (totalScore >= 80 || hasExactQueryMatch || verifiedCoreEntities.size > 0) {
      relevanceConfidence = 'high';
    } else if (totalScore >= 45) {
      relevanceConfidence = 'medium';
    } else {
      relevanceConfidence = 'low';
    }
  }

  // 检查是否在物理正文片段中得到了真实验证（而非仅仅依赖模型生成的 AI 摘要/清洗正文）
  let physicalVerified = false;
  if (profile.exactIdentifiers.length > 0) {
    const physicallyVerifiedExactIds = profile.exactIdentifiers.filter((id) =>
      contentMatches.some(
        (m: any) =>
          (!m.sourceKind || m.sourceKind === 'physical_line') &&
          hasTokenBoundaryAlignment(id, m.snippet)
      )
    );
    physicalVerified = physicallyVerifiedExactIds.length === profile.exactIdentifiers.length;
  } else if (profile.coreEntities.length > 0) {
    const physicallyVerifiedEntities = profile.coreEntities.filter((entity) =>
      contentMatches.some(
        (m: any) =>
          (!m.sourceKind || m.sourceKind === 'physical_line') &&
          hasTokenBoundaryAlignment(entity, m.snippet)
      )
    );
    physicalVerified = profile.isStrictVerification
      ? physicallyVerifiedEntities.length === profile.coreEntities.length
      : physicallyVerifiedEntities.length > 0;
  } else {
    physicalVerified = contentMatches.some(
      (m: any) => !m.sourceKind || m.sourceKind === 'physical_line'
    );
  }

  return {
    totalScore,
    hasExactQueryMatch,
    hasCoreEntityMatch,
    admitted,
    matchedTokens: Array.from(matchedTokens),
    relevanceConfidence,
    consistencyVerified,
    isPartialMatchOnly,
    physicalVerified,
  };
}

/**
 * 从文档伴生元数据（结构化抽取数据、核心主题标签、摘要、精炼正文）中提取匹配片段，
 * 显式赋予结构化 sourceKind 与安全行号（line: 0，杜绝伪造原文物理行号）
 */
export function extractMetadataMatchSnippets(params: {
  digestJson?: any;
  searchTokens: string[];
  rawQuery: string;
}): ContentMatchSnippet[] {
  const { digestJson, searchTokens, rawQuery } = params;
  const matches: ContentMatchSnippet[] = [];
  if (!digestJson || typeof digestJson !== 'object') return matches;

  const q = (rawQuery || '').toLowerCase();

  // 1. 优先匹配 AI 抽取的特定业务结构化数据（如验收口令、预算金额等核心字段）
  if (digestJson.extractedData && typeof digestJson.extractedData === 'object') {
    try {
      for (const [k, v] of Object.entries(digestJson.extractedData)) {
        const strV = typeof v === 'object' ? JSON.stringify(v) : String(v);
        if (
          searchTokens.some(
            (t) =>
              k.toLowerCase().includes(t.toLowerCase()) ||
              strV.toLowerCase().includes(t.toLowerCase())
          ) ||
          strV.toLowerCase().includes(q)
        ) {
          matches.push({
            line: 0,
            snippet: `[结构化数据提取] ${k}: ${strV.slice(0, 160)}`,
            sourceKind: 'structured_data',
          });
          if (matches.length >= 3) break;
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. 匹配 AI 提炼的核心主题标签（使用 sourceKind: 'metadata_topic'，line: 0）
  if (matches.length === 0 && Array.isArray(digestJson.keyTopics)) {
    for (const topic of digestJson.keyTopics) {
      const strT = String(topic);
      if (
        searchTokens.some(
          (t) =>
            strT.toLowerCase().includes(t.toLowerCase()) ||
            t.toLowerCase().includes(strT.toLowerCase())
        ) ||
        strT.toLowerCase().includes(q)
      ) {
        matches.push({
          line: 0,
          snippet: `[核心主题标签] #${strT}`,
          sourceKind: 'metadata_topic',
        });
        if (matches.length >= 3) break;
      }
    }
  }

  // 3. 匹配执行摘要或 AI 清洗后的核心精要正文（使用 sourceKind: 'metadata_summary'，line: 0）
  if (matches.length === 0) {
    if (
      digestJson.summary &&
      (searchTokens.some((t) => digestJson.summary!.toLowerCase().includes(t.toLowerCase())) ||
        digestJson.summary.toLowerCase().includes(q))
    ) {
      matches.push({
        line: 0,
        snippet: `[文档摘要] ${digestJson.summary.slice(0, 200)}`,
        sourceKind: 'metadata_summary',
      });
    } else if (
      digestJson.cleanedContent &&
      searchTokens.some((t) => digestJson.cleanedContent!.toLowerCase().includes(t.toLowerCase()))
    ) {
      const matchingLines = digestJson.cleanedContent
        .split('\n')
        .filter((l: string) =>
          searchTokens.some((t) => l.toLowerCase().includes(t.toLowerCase()))
        )
        .slice(0, 3);
      for (const line of matchingLines) {
        matches.push({
          line: 0,
          snippet: line.slice(0, 200),
          sourceKind: 'metadata_summary',
        });
      }
    }
  }

  return matches;
}
