import { Injectable, Optional } from '@nestjs/common';
import type {
  ExtractedLegalFacts,
  PartyPosition,
  ReviewElementCategory,
  ReviewSeverity,
  StandardContractType,
  ClauseLegalFinding,
} from './review-element.types';
import type {
  ReviewElementConfig,
  PolarityOutcome,
  PositionPolarityTarget,
  PositionPolarityRule,
} from './review-element-config.types';
import { ReviewFactExtractorService } from './review-fact-extractor.service';
import { BUILTIN_REVIEW_ELEMENTS } from './builtin-review-elements.default';

export interface DiffInsight {
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  summary: string;
  legalAdvice?: string;
  elementId?: string;
  elementCode?: string;
  keyChange?: string;
  shortSummary?: string;
}

export interface PolarityResolved {
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  summaryTemplate?: string;
  adviceTemplate?: string;
  elementId?: string;
  elementCode?: string;
  keyChange?: string;
  shortSummary?: string;
}

export function toRiskLevel(sev?: string): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  if (sev === 'HIGH') return 'HIGH';
  if (sev === 'MEDIUM') return 'MEDIUM';
  if (sev === 'LOW') return 'LOW';
  return 'NONE';
}

export interface ClauseDiffPairInput {
  status: 'UNCHANGED' | 'MODIFIED' | 'ADDED' | 'DELETED';
  sourceClause?: { title?: string; content?: string };
  targetClause?: { title?: string; content?: string };
}

@Injectable()
export class ReviewElementEvaluatorService {
  constructor(
    @Optional()
    private readonly factExtractor: ReviewFactExtractorService = new ReviewFactExtractorService()
  ) {}

  /**
   * Normalize input position to standard 'buyer' | 'seller' | 'both'
   */
  normalizePosition(position?: string): 'buyer' | 'seller' | 'both' {
    if (!position) return 'both';
    const p = String(position).toLowerCase();
    if (
      p === 'buyer' ||
      p === 'party_a' ||
      p === 'client' ||
      p === '甲方' ||
      p === '采购方' ||
      p === '委托方' ||
      p === '雇主' ||
      p === '出租方'
    ) {
      return 'buyer';
    }
    if (
      p === 'seller' ||
      p === 'party_b' ||
      p === 'supplier' ||
      p === 'vendor' ||
      p === '乙方' ||
      p === '受托方' ||
      p === '开发方' ||
      p === '供货方' ||
      p === '雇员' ||
      p === '承租方'
    ) {
      return 'seller';
    }
    return 'both';
  }

  // =========================================================================
  // 1. Evidence Extraction & Sentence Boundary Expansion (No hardcoded ID regex)
  // =========================================================================

  /**
   * Locate evidence slice in clauseText using rule's criteria patterns or fact quotes.
   * If not found, explicitly returns { evidenceQuote: '待定位' }.
   */
  locateEvidence(
    clauseText: string,
    rule: {
      id?: string;
      elementId?: string;
      elementCode?: string;
      title?: string;
      riskSummary?: string;
      criteria?: { patterns?: string[]; factField?: keyof ExtractedLegalFacts };
    },
    facts?: ExtractedLegalFacts
  ): { evidenceQuote: string; charStart?: number; charEnd?: number } {
    if (!clauseText) {
      return { evidenceQuote: '待定位' };
    }

    let matchIndex = -1;
    let matchLen = 0;

    // 1. Check declarative pattern list in rule criteria or element config fallback
    let patterns = rule.criteria?.patterns;
    if (!patterns || patterns.length === 0) {
      const el = BUILTIN_REVIEW_ELEMENTS.find(
        (e) => e.id === rule.elementId || e.id === rule.id
      );
      if (el?.criteria?.patterns) {
        patterns = el.criteria.patterns;
      }
    }

    if (patterns && patterns.length > 0) {
      for (const patStr of patterns) {
        try {
          const reg = new RegExp(patStr, 'i');
          const m = reg.exec(clauseText);
          if (m) {
            matchIndex = m.index;
            matchLen = m[0].length;
            break;
          }
        } catch {
          // ignore invalid regex string
        }
      }
    }

    // 2. Fallback: search by keywords from rule title & summary
    if (matchIndex === -1) {
      const stopWords =
        /[\s,，、;；|:：/\\_\-()（）\[\]【】\d+%]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如|双方|甲方|乙方|开展|合作|合同|协议|条款|内容|规定|软件|系统|项目|业务/g;
      const tokens = ((rule.title || '') + ' ' + (rule.riskSummary || ''))
        .split(stopWords)
        .filter((k) => k && k.length >= 2)
        .sort((a, b) => b.length - a.length);

      for (const tok of tokens) {
        const idx = clauseText.indexOf(tok);
        if (idx !== -1) {
          matchIndex = idx;
          matchLen = tok.length;
          break;
        }
      }
    }

    // 3. Expand matched slice to sentence boundaries
    if (matchIndex !== -1) {
      return this.expandToSentence(clauseText, matchIndex, matchLen);
    }

    // 4. Localization failed: explicit "待定位" marker, NEVER return first sentence
    return { evidenceQuote: '待定位' };
  }

  /**
   * Locate evidence for LLM semantic review result
   */
  locateEvidenceForSemanticRisk(
    clauseText: string,
    semantic: { evidenceQuote?: string; riskSummary?: string }
  ): { evidenceQuote: string; charStart?: number; charEnd?: number } {
    if (!clauseText) {
      return { evidenceQuote: '待定位' };
    }

    if (
      semantic.evidenceQuote &&
      semantic.evidenceQuote !== '待定位' &&
      clauseText.includes(semantic.evidenceQuote)
    ) {
      const idx = clauseText.indexOf(semantic.evidenceQuote);
      return {
        evidenceQuote: semantic.evidenceQuote,
        charStart: idx,
        charEnd: idx + semantic.evidenceQuote.length,
      };
    }

    if (semantic.riskSummary) {
      const stopWords =
        /[\s,，、;；|:：/\\_\-()（）\[\]【】\d+%]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如|双方|甲方|乙方|开展|合作|合同|协议|条款|内容|规定|软件|系统|项目|业务|连续性|风险|存在|严重|可能/g;
      const tokens = semantic.riskSummary
        .split(stopWords)
        .filter((k: string) => k && k.length >= 2)
        .sort((a, b) => b.length - a.length);
      for (const tok of tokens) {
        const idx = clauseText.indexOf(tok);
        if (idx !== -1) {
          return this.expandToSentence(clauseText, idx, tok.length);
        }
      }
    }

    return { evidenceQuote: '待定位' };
  }

  /**
   * Expand match to sentence boundaries (delimiters: 。, \n, ；, ;)
   */
  expandToSentence(
    text: string,
    matchIndex: number,
    matchLen: number
  ): { evidenceQuote: string; charStart: number; charEnd: number } {
    let start = 0;
    for (let i = matchIndex - 1; i >= 0; i--) {
      if (text[i] === '。' || text[i] === '\n' || text[i] === '；' || text[i] === ';') {
        start = i + 1;
        break;
      }
    }
    let end = text.length;
    for (let i = matchIndex + matchLen; i < text.length; i++) {
      if (text[i] === '。' || text[i] === '\n' || text[i] === '；' || text[i] === ';') {
        end = i + 1;
        break;
      }
    }

    const raw = text.substring(start, end);
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        evidenceQuote: text.slice(matchIndex, matchIndex + matchLen),
        charStart: matchIndex,
        charEnd: matchIndex + matchLen,
      };
    }
    const realStart = text.indexOf(trimmed, start);
    const realEnd = realStart + trimmed.length;
    return {
      evidenceQuote: trimmed,
      charStart: realStart,
      charEnd: realEnd,
    };
  }

  // =========================================================================
  // 2. Generic Token / Character Bigram Similarity for Deduplication
  // =========================================================================

  /**
   * Extract tokens: word tokens for alphanumeric/Latin and character bigrams for CJK
   */
  extractTokens(text: string): Set<string> {
    const tokens = new Set<string>();
    if (!text) return tokens;

    // Latin / alphanumeric words
    const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const words = clean.split(/\s+/).filter((w) => w.length >= 2);
    for (const w of words) {
      tokens.add(w);
    }

    // CJK character bigrams
    const cjkText = text.replace(/[^\u4e00-\u9fa5]/g, '');
    for (let i = 0; i < cjkText.length - 1; i++) {
      tokens.add(cjkText.slice(i, i + 2));
    }

    return tokens;
  }

  /**
   * Generic Jaccard similarity between two text snippets (No hardcoded domain keywords!)
   */
  calculateTokenSimilarity(textA: string, textB: string): number {
    const setA = this.extractTokens(textA);
    const setB = this.extractTokens(textB);
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Overlap Coefficient (Szymkiewicz–Simpson): measures subset containment
   */
  calculateOverlapCoefficient(textA: string, textB: string): number {
    const setA = this.extractTokens(textA);
    const setB = this.extractTokens(textB);
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    return intersection / Math.min(setA.size, setB.size);
  }

  /**
   * Determine if a semantic risk is already covered by existing findings
   */
  isCoveredByExistingFindings(
    semantic: { riskSummary?: string; legalAdvice?: string; title?: string },
    findings: ClauseLegalFinding[]
  ): boolean {
    if (!findings || findings.length === 0 || !semantic.riskSummary) {
      return false;
    }

    const sSummary = semantic.riskSummary;
    const sTitle = (semantic.title || semantic.riskSummary.split(/[，。：:；;\n]/)[0] || '').slice(0, 30);
    const sCombined = `${semantic.riskSummary} ${semantic.legalAdvice || ''}`;

    return findings.some((f) => {
      // 1. Direct elementCode match (e.g. "SOFT-03", "COMM-01")
      if (f.elementCode && sSummary.includes(f.elementCode)) {
        return true;
      }

      // 2. Direct title substring match (min 4 chars)
      const fTitle = (f.title || '').replace(/[【】\[\]()（）]/g, '').trim();
      if (fTitle.length >= 4 && sSummary.includes(fTitle)) {
        return true;
      }

      // 3. Generic token / bigram similarity (>= 0.25 indicates same core legal issue)
      const fCombined = `${f.title} ${f.riskSummary}`;
      const sim = this.calculateTokenSimilarity(sCombined, fCombined);
      if (sim >= 0.25) return true;

      // 4. Overlap coefficient between semantic topic/title/summary and finding
      const overlapTitle = this.calculateOverlapCoefficient(sTitle, fCombined);
      if (overlapTitle >= 0.3) return true;

      const overlapSummary = this.calculateOverlapCoefficient(sSummary, fCombined);
      if (overlapSummary >= 0.35) return true;

      return false;
    });
  }

  // =========================================================================
  // 3. Diff & Redline Evaluation Entrypoint (Comparator & Reviewer shared)
  // =========================================================================

  /**
   * Unified diff risk evaluation for an aligned clause pair
   */
  evaluateDiff(
    pair: ClauseDiffPairInput,
    customRules?: any[],
    myPosition?: string,
    elements: ReviewElementConfig[] = BUILTIN_REVIEW_ELEMENTS
  ): DiffInsight {
    const srcText = pair.sourceClause?.content || '';
    const tgtText = pair.targetClause?.content || '';
    const title = (pair.targetClause?.title || pair.sourceClause?.title || '').toLowerCase();
    const combined = `${title} ${srcText} ${tgtText}`;
    const pos = this.normalizePosition(myPosition);

    let riskLevel: ReviewSeverity = 'LOW';
    let summary = '';
    let legalAdvice = '';
    let elementId: string | undefined;
    let elementCode: string | undefined;

    // 0. Priority: Custom Checklist Rules
    if (customRules && Array.isArray(customRules)) {
      const stopWords =
        /[\s,，、;；|:：/\\_\-()（）\[\]【】\d+%]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如/g;
      for (const c of customRules) {
        const explicitKeywords = Array.isArray(c.keywords) ? c.keywords : [];
        const autoTokens = ((c.title || '') + ' ' + (c.rule || ''))
          .split(stopWords)
          .filter((k: string) => k && k.length >= 2);
        const subTokens = autoTokens.flatMap((tok: string) => {
          if (tok.length >= 4) return [tok, tok.slice(0, 3), tok.slice(0, 2)];
          return [tok];
        });
        const allKeywords = Array.from(
          new Set([...explicitKeywords, ...autoTokens, ...subTokens])
        ).filter((k: string) => k.length >= 2);

        if (allKeywords.some((kw: string) => combined.includes(kw.toLowerCase()))) {
          const ruleRiskLevel = toRiskLevel(c.severity || 'HIGH');
          elementId = c.id || c.elementId;
          elementCode = c.elementCode;
          summary = `[企业专属比对要点] ${c.title}：${c.rule}`;
          if (c.recommendedRevision) {
            legalAdvice = c.recommendedRevision;
          }
          return {
            riskLevel: ruleRiskLevel,
            summary,
            legalAdvice,
            elementId,
            elementCode,
            keyChange: c.title ? `触发专属规则：${c.title}` : summary,
            shortSummary: c.title || '企业专属规则',
          };
        }
      }
    }

    // 1. ADDED CLAUSE
    if (pair.status === 'ADDED') {
      const tgtFacts = this.factExtractor.extractClauseFacts(tgtText, title);
      const matched = this.evaluateAddedClause(tgtText, title, tgtFacts, pos, elements);
      return matched;
    }

    // 2. DELETED CLAUSE
    if (pair.status === 'DELETED') {
      const matched = this.evaluateDeletedClause(srcText, title, pos, elements);
      return matched;
    }

    // 3. MODIFIED CLAUSE
    if (pair.status === 'MODIFIED') {
      const srcFacts = this.factExtractor.extractClauseFacts(srcText, title);
      const tgtFacts = this.factExtractor.extractClauseFacts(tgtText, title);
      const matched = this.evaluateModifiedClause(
        srcText,
        tgtText,
        title,
        srcFacts,
        tgtFacts,
        pos,
        elements
      );
      return matched;
    }

    // 4. UNCHANGED
    return {
      riskLevel: 'LOW',
      summary: '条款内容保持一致，未发生变更。',
    };
  }

  // =========================================================================
  // Private Evaluation Helpers for Added, Deleted, and Modified Clauses
  // =========================================================================

  private evaluateAddedClause(
    tgtText: string,
    title: string,
    tgtFacts: ExtractedLegalFacts,
    pos: 'buyer' | 'seller' | 'both',
    elements: ReviewElementConfig[]
  ): DiffInsight {
    const combined = `${title} ${tgtText}`;

    // A. Check Calendar Day Trap
    if (tgtFacts.deliveryDayType === 'calendar_day') {
      const el = elements.find((e) => e.id === 'soft_calendar_day_trap');
      return {
        riskLevel: 'HIGH',
        elementId: el?.id || 'soft_calendar_day_trap',
        elementCode: el?.code || 'SOFT-03',
        summary: '新增条款将工期计算口径约定为自然日/日历日，剥夺节假日研发时间，大幅增加违约风险。',
        legalAdvice: '建议坚持采用工作日口径或约定节假日自动顺延。',
        keyChange: '新增工期按自然日/日历日口径计算',
        shortSummary: '新增自然日工期陷阱',
      };
    }

    // B. Check Dispute Forum Location
    if (tgtFacts.forumLocation && tgtFacts.forumLocation !== 'unspecified') {
      const el = elements.find((e) => e.id === 'comm_dispute_unfavorable_forum');
      const polarity = el?.positionPolarity?.[tgtFacts.forumLocation];
      if (polarity) {
        const outcome = this.resolvePolarityOutcome(polarity, pos);
        if (outcome) {
          return {
            riskLevel: outcome.riskLevel,
            elementId: outcome.elementId || (outcome.riskLevel === 'HIGH' ? el?.id : undefined),
            elementCode: outcome.elementCode || (outcome.riskLevel === 'HIGH' ? el?.code : undefined),
            summary: outcome.summaryTemplate || (outcome.riskLevel === 'HIGH' ? el!.riskSummary : '管辖约定对我方有利。'),
            legalAdvice: outcome.adviceTemplate || (outcome.riskLevel === 'HIGH' ? el!.legalAdvice : undefined),
            keyChange: outcome.keyChange || `管辖约定变更为：${tgtFacts.forumLocation}`,
            shortSummary: outcome.shortSummary || '新增管辖法院条款',
          };
        }
      }
    }

    // C. Check Damages Scope (Exclusion vs Inclusion)
    const damagesEl = elements.find((e) => e.id === 'comm_excessive_damages_scope');
    const isDamagesClause = /惩罚性赔偿|间接损失|商业机会损失|可得利益损失|预期利润/i.test(combined);
    if (isDamagesClause && damagesEl) {
      const isDamagesExclusion =
        damagesEl.criteria?.negationPatterns?.some((p) => new RegExp(p, 'i').test(combined)) ?? false;

      if (isDamagesExclusion) {
        return {
          riskLevel: 'LOW',
          summary: '新增条款明确排除了间接损失、商业机会损失或惩罚性赔偿，符合将责任限定于直接实际损失的风控原则。',
          legalAdvice: '该条款有利于锁定责任边界，防范不可预见的大额索赔，建议确认保留。',
          keyChange: '明确排除间接损失与惩罚性赔偿',
          shortSummary: '排除间接损失',
        };
      } else {
        return {
          riskLevel: 'HIGH',
          elementId: damagesEl.id,
          elementCode: damagesEl.code,
          summary: '新增条款包含惩罚性赔偿或间接损失追偿，增加不可控赔偿敞口。',
          legalAdvice: damagesEl.legalAdvice,
          keyChange: '新增承担惩罚性赔偿或间接损失',
          shortSummary: '扩大间接赔偿责任',
        };
      }
    }

    // D. Check Payment Tied to Internal Audit
    if (tgtFacts.isPaymentTiedToInternalAudit) {
      const el = elements.find((e) => e.id === 'soft_payment_tied_to_internal_audit');
      const polarity = el?.positionPolarity?.internal_audit_tied;
      if (polarity) {
        const outcome = this.resolvePolarityOutcome(polarity, pos);
        if (outcome) {
          return {
            riskLevel: outcome.riskLevel,
            elementId: outcome.elementId || (outcome.riskLevel === 'HIGH' ? el?.id : undefined),
            elementCode: outcome.elementCode || (outcome.riskLevel === 'HIGH' ? el?.code : undefined),
            summary: outcome.summaryTemplate || (outcome.riskLevel === 'HIGH' ? el!.riskSummary : '付款内控流程对我方有利。'),
            legalAdvice: outcome.adviceTemplate || (outcome.riskLevel === 'HIGH' ? el!.legalAdvice : undefined),
            keyChange: '新增内部财务与IT审计作为付款前置条件',
            shortSummary: '付款条件增加内部审计',
          };
        }
      }
    }

    // E. Generic Technical / Compliance Check
    if (/开源|gpl|sbom|商业机密|竞业/i.test(combined)) {
      return {
        riskLevel: 'MEDIUM',
        summary: '修订版新增了开源合规/知识产权限制条款，需核查交付物依赖库许可。',
        legalAdvice: '请技术负责人确认项目中引用的第三方组件协议是否满足要求。',
        keyChange: '新增开源许可及相关保证要求',
        shortSummary: '新增开源合规与SBOM限制',
      };
    }

    return {
      riskLevel: 'LOW',
      summary: '修订版新增了独立约定条款，请确认是否超出原商务合作范围。',
      keyChange: '新增该条款独立约定',
      shortSummary: '新增独立条款',
    };
  }

  private evaluateDeletedClause(
    srcText: string,
    title: string,
    pos: 'buyer' | 'seller' | 'both',
    elements: ReviewElementConfig[]
  ): DiffInsight {
    // 1. Deleted dispute resolution
    if (/仲裁|争议解决|管辖|诉讼/i.test(srcText)) {
      const el = elements.find((e) => e.id === 'missing_dispute_resolution');
      return {
        elementId: el?.id || 'missing_dispute_resolution',
        elementCode: el?.code || 'COMM-05',
        riskLevel: 'HIGH',
        summary: '删除了原合同关键的争议管辖与司法救济条款，可能导致涉诉时管辖法院不确定。',
        legalAdvice: '建议保留明确的争议解决地及管辖法院条款。',
        keyChange: '原争议解决条款被删除',
        shortSummary: '删除争议解决条款',
      };
    }

    // 2. Deleted liability cap
    if (/赔偿上限|责任上限|责任限制|实际支付.*为限/i.test(srcText)) {
      if (pos === 'buyer') {
        return {
          riskLevel: 'MEDIUM',
          summary: '删除了原合同约定的赔偿责任上限条款，需确认是否符合双方商业风险分配预期。',
          legalAdvice: '买方无需承担主要交付赔偿责任，但建议确认双方救济权对等。',
          keyChange: '原合同约定的赔偿上限条款被删除',
          shortSummary: '删除赔偿上限条款',
        };
      } else {
        const el = elements.find((e) => e.id === 'comm_excessive_damages_scope');
        return {
          elementId: el?.id || 'comm_excessive_damages_scope',
          elementCode: el?.code || 'COMM-02',
          riskLevel: 'HIGH',
          summary: '删除了原合同对乙方的责任上限限制条款，导致我方承担无上限重大赔偿敞口。',
          legalAdvice: '建议恢复设定合理的累计赔偿上限条款（如不超过已付合同总价款）。',
          keyChange: '原赔偿责任上限限制被删除',
          shortSummary: '取消违约赔偿责任上限',
        };
      }
    }

    // 3. Deleted NDA exceptions
    if (/例外情况|除外情形|保密信息不包括|不属于保密信息/i.test(srcText)) {
      const el = elements.find((e) => e.id === 'missing_nda_exceptions');
      return {
        elementId: el?.id || 'missing_nda_exceptions',
        elementCode: el?.code || 'NDA-04',
        riskLevel: 'HIGH',
        summary: '删除了保密协议关键的法定除外披露情形条款，构成严重合规风控漏洞。',
        legalAdvice: '必须恢复公知、已知、独立开发及依法强制披露等法定除外情形。',
        keyChange: '删除了保密协议法定除外披露情形条款',
        shortSummary: '删除保密例外条款',
      };
    }

    // 4. Deleted source code delivery
    if (/源代码|源码|未经混淆|构建脚本|数据库字典/i.test(srcText)) {
      const el = elements.find((e) => e.id === 'missing_source_code_delivery');
      if (pos === 'seller') {
        return {
          riskLevel: 'LOW',
          summary: '删除了向买方交付源代码及构建脚本的义务，有助于保护我方底层软件资产与商业秘密。',
          legalAdvice: '删除源码交付对我方（开发方）有利，建议保留。',
          keyChange: '删除交付源代码及构建脚本的义务',
          shortSummary: '免除源代码交付',
        };
      } else {
        return {
          elementId: el?.id || 'missing_source_code_delivery',
          elementCode: el?.code || 'SOFT-01',
          riskLevel: 'HIGH',
          summary: '删除了交付成果物包含源代码与构建脚本的约定，存在严重技术锁定风险。',
          legalAdvice: '必须恢复完整的源代码、开发文档与构建脚本交付条款。',
          keyChange: '删除了交付成果物包含源代码与构建脚本的约定',
          shortSummary: '删除源码交付要求',
        };
      }
    }

    // 5. Deleted IP indemnity
    if (/侵权抗辩|免受损害|不侵犯任何第三方.*知识产权/i.test(srcText)) {
      const el = elements.find((e) => e.id === 'missing_thirdparty_infringement_indemnity');
      if (pos === 'seller') {
        return {
          riskLevel: 'LOW',
          summary: '删除了供货方承担第三方知识产权侵权连带抗辩与无限赔偿的义务，减轻了我方连带责任。',
          legalAdvice: '该删除减轻了卖方连带侵权风险，建议保留。',
          keyChange: '删除供货方连带侵权抗辩与赔偿义务',
          shortSummary: '免除连带侵权赔偿',
        };
      } else {
        return {
          elementId: el?.id || 'missing_thirdparty_infringement_indemnity',
          elementCode: el?.code || 'SOFT-05',
          riskLevel: 'HIGH',
          summary: '删除了第三方知识产权侵权兜底免责与抗辩赔偿条款，丧失免责保护。',
          legalAdvice: '建议恢复供应商知识产权不侵权担保及抗辩条款。',
          keyChange: '删除第三方知识产权侵权兜底免责与抗辩条款',
          shortSummary: '删除侵权免责保护',
        };
      }
    }

    return {
      riskLevel: 'LOW',
      summary: '修订版删除了原合同条款，需评估是否有实质权利减损。',
      keyChange: '原合同条款被删除',
      shortSummary: '删除原条款',
    };
  }

  private evaluateModifiedClause(
    srcText: string,
    tgtText: string,
    title: string,
    srcFacts: ExtractedLegalFacts,
    tgtFacts: ExtractedLegalFacts,
    pos: 'buyer' | 'seller' | 'both',
    elements: ReviewElementConfig[]
  ): DiffInsight {
    const changeInsights: DiffInsight[] = [];

    // -------------------------------------------------------------
    // 维度 1: 工期口径与工期天数联合研判
    // 核心原则：工作日换算比例由配置提供；未配置时返回“不确定”，禁止硬编码！
    // -------------------------------------------------------------
    const hasDeliveryFacts =
      srcFacts.deliveryDays !== undefined ||
      tgtFacts.deliveryDays !== undefined ||
      srcFacts.deliveryDayType !== undefined ||
      tgtFacts.deliveryDayType !== undefined;
    const isDeliveryClause = /交付|工期|周期|开发进度|交货/i.test(title + srcText + tgtText);

    if (isDeliveryClause && hasDeliveryFacts) {
      const deliveryEl = elements.find((e) => e.id === 'soft_calendar_day_trap');
      const thresholds = deliveryEl?.thresholds || {};
      const tolerance = thresholds.durationReductionToleranceRatio ?? 0.2;
      const ratio = thresholds.calendarToWorkDayRatio; // Notice: NO hardcoded fallback here!

      const srcDays = srcFacts.deliveryDays;
      const tgtDays = tgtFacts.deliveryDays;
      const srcType = srcFacts.deliveryDayType || 'unspecified';
      const tgtType = tgtFacts.deliveryDayType || 'unspecified';

      const srcUnit = srcType === 'calendar_day' ? '自然日' : srcType === 'working_day' ? '工作日' : '天';
      const tgtUnit = tgtType === 'calendar_day' ? '自然日' : tgtType === 'working_day' ? '工作日' : '天';

      if (srcDays !== undefined && tgtDays !== undefined) {
        // Different units: Working Day vs Calendar Day
        if (srcType !== tgtType && (srcType === 'calendar_day' || tgtType === 'calendar_day')) {
          if (ratio === undefined || ratio === null) {
            // Unconfigured ratio: Engine strictly returns uncertain, NO hardcoded assumptions!
            changeInsights.push({
              riskLevel: 'MEDIUM',
              elementId: deliveryEl?.id,
              elementCode: deliveryEl?.code,
              summary:
                deliveryEl?.compareRule?.summaryTemplates?.uncertain ||
                '工期计算口径在工作日与自然日之间发生变动，由于未配置工作日换算比例，无法确定实际工期是否缩水，需人工核实。',
              legalAdvice:
                deliveryEl?.compareRule?.adviceTemplates?.uncertain ||
                '建议在配置中心明确工作日与自然日的折算比例或人工复核项目排期。',
              keyChange: `工期口径由 ${srcUnit} 变更为 ${tgtUnit}`,
              shortSummary: '工期换算口径变动',
            });
          } else {
            const srcEff = srcType === 'calendar_day' ? srcDays * ratio : srcDays;
            const tgtEff = tgtType === 'calendar_day' ? tgtDays * ratio : tgtDays;

            if (tgtEff < srcEff * (1 - tolerance)) {
              // Reduction exceeds tolerance
              changeInsights.push({
                elementId: 'soft_calendar_day_trap',
                elementCode: 'SOFT-03',
                riskLevel: 'HIGH',
                summary: `交付工期被大幅压缩（由 ${srcDays} 个${srcUnit}缩短至 ${tgtDays} 个${tgtUnit}，折算有效工期大幅缩水），严重加重延期违约风险。`,
                legalAdvice:
                  '建议评估实际研发进度与资源安排，避免承诺难以达成的紧迫周期，或增设需求延迟对等顺延条款。',
                keyChange: `工期：${srcDays} ${srcUnit} → ${tgtDays} ${tgtUnit}`,
                shortSummary: '工期大幅缩短',
              });
            } else if (srcType === 'working_day' && tgtType === 'calendar_day') {
              if (tgtEff < srcEff) {
                changeInsights.push({
                  elementId: 'soft_calendar_day_trap',
                  elementCode: 'SOFT-03',
                  riskLevel: 'HIGH',
                  summary: `交付周期口径被修改为自然日/日历日（由 ${srcDays} 工作日变更为 ${tgtDays} 自然日，有效履约时间被压缩），剥夺法定节假日与周末研发时间，加重延期违约风险。`,
                  legalAdvice: '建议坚持采用“工作日”口径计算，或增设节假日自动顺延条款。',
                  keyChange: `工期：${srcDays} 工作日 → ${tgtDays} 自然日`,
                  shortSummary: '工期口径改为自然日',
                });
              } else {
                changeInsights.push({
                  riskLevel: 'LOW',
                  summary: `交付工期有所宽限（由 ${srcDays} 个${srcUnit}调整为 ${tgtDays} 个${tgtUnit}，折算有效工期大幅增加），履约时间更为充裕。`,
                  legalAdvice: '工期大幅放宽有利于平稳交付，建议确认项目整体排期。',
                  keyChange: `工期：${srcDays} ${srcUnit} → ${tgtDays} ${tgtUnit}`,
                  shortSummary: '工期有所放宽',
                });
              }
            } else if (srcType === 'calendar_day' && tgtType === 'working_day') {
              changeInsights.push({
                riskLevel: 'LOW',
                summary: `交付周期由“自然日”放宽调整为“工作日”（由 ${srcDays} 自然日调整为 ${tgtDays} 工作日），排除了法定节假日占用，履约时间更为充裕。`,
                legalAdvice: '该项口径放宽对履约方有利，建议确认并保留。',
                keyChange: `工期：${srcDays} 自然日 → ${tgtDays} 工作日`,
                shortSummary: '工期放宽为工作日',
              });
            } else if (tgtDays < srcDays) {
              changeInsights.push({
                riskLevel: tgtDays < srcDays * (1 - tolerance) ? 'HIGH' : 'MEDIUM',
                summary: `交付工期有所缩短（由 ${srcDays} ${srcUnit}缩减至 ${tgtDays} ${tgtUnit}），履约节奏加快。`,
                legalAdvice: '建议确认团队当前排期与交付能力是否足以支撑缩短后的工期。',
                keyChange: `工期：${srcDays} ${srcUnit} → ${tgtDays} ${tgtUnit}`,
                shortSummary: '工期缩短',
              });
            } else if (tgtDays > srcDays) {
              changeInsights.push({
                riskLevel: 'LOW',
                summary: `交付工期有所宽限（由 ${srcDays} ${srcUnit}延长至 ${tgtDays} ${tgtUnit}），有利于平稳交付。`,
                legalAdvice: '该项工期放宽有利于降低延期风险。',
                keyChange: `工期：${srcDays} ${srcUnit} → ${tgtDays} ${tgtUnit}`,
                shortSummary: '工期延长',
              });
            }
          }
        } else if (tgtDays < srcDays) {
          changeInsights.push({
            riskLevel: tgtDays < srcDays * (1 - tolerance) ? 'HIGH' : 'MEDIUM',
            summary: `交付工期有所缩短（由 ${srcDays} ${srcUnit}缩减至 ${tgtDays} ${tgtUnit}），履约节奏加快。`,
            legalAdvice: '建议确认团队当前排期与交付能力是否足以支撑缩短后的工期。',
            keyChange: `工期：${srcDays} ${srcUnit} → ${tgtDays} ${tgtUnit}`,
            shortSummary: '工期缩短',
          });
        } else if (tgtDays > srcDays) {
          changeInsights.push({
            riskLevel: 'LOW',
            summary: `交付工期有所宽限（由 ${srcDays} ${srcUnit}延长至 ${tgtDays} ${tgtUnit}），有利于平稳交付。`,
            legalAdvice: '该项工期放宽有利于降低延期风险。',
            keyChange: `工期：${srcDays} ${srcUnit} → ${tgtDays} ${tgtUnit}`,
            shortSummary: '工期延长',
          });
        }
      } else if (srcType === 'working_day' && tgtType === 'calendar_day') {
        changeInsights.push({
          elementId: 'soft_calendar_day_trap',
          elementCode: 'SOFT-03',
          riskLevel: 'HIGH',
          summary: '交付周期口径被修改为自然日/日历日，剥夺法定节假日与周末研发时间，加重延期违约风险。',
          legalAdvice: '建议坚持采用“工作日”口径计算，或增设节假日自动顺延条款。',
          keyChange: '工期口径由工作日调整为自然日',
          shortSummary: '工期改为自然日',
        });
      } else if (srcType === 'calendar_day' && tgtType === 'working_day') {
        changeInsights.push({
          riskLevel: 'LOW',
          summary: '交付周期由“自然日”放宽调整为“工作日”，排除了法定节假日占用，履约时间更为充裕。',
          legalAdvice: '该项变更对交付方有利，建议确认并保留。',
          keyChange: '工期口径由自然日调整为工作日',
          shortSummary: '工期放宽为工作日',
        });
      }
    }

    // -------------------------------------------------------------
    // 维度 2: 赔偿责任上限删除或放宽
    // -------------------------------------------------------------
    if (srcFacts.hasLiabilityCap && (!tgtFacts.hasLiabilityCap || tgtFacts.liabilityCapType === 'unlimited')) {
      if (pos === 'buyer') {
        changeInsights.push({
          riskLevel: 'MEDIUM',
          summary: '原合同的累计赔偿责任上限被删除，买方索赔敞口得以放宽，但需关注双方对等性。',
          legalAdvice: '建议确认是否符合买方整体商务诉求。',
          keyChange: '原合同赔偿上限被删除',
          shortSummary: '放宽赔偿上限',
        });
      } else {
        const el = elements.find((e) => e.id === 'comm_excessive_damages_scope');
        changeInsights.push({
          elementId: el?.id || 'comm_excessive_damages_scope',
          elementCode: el?.code || 'COMM-02',
          riskLevel: 'HIGH',
          summary: '原合同的违约赔偿上限被删除或放宽为无限责任，实质扩大合同责任敞口。',
          legalAdvice: '建议恢复设定合理的累计赔偿上限（如不超过已付合同总价款）。',
          keyChange: '原合同赔偿上限被删除（无限责任）',
          shortSummary: '取消赔偿上限',
        });
      }
    }

    // -------------------------------------------------------------
    // 维度 3: 违约金费率变动
    // -------------------------------------------------------------
    if (
      srcFacts.dailyDamagesRate !== undefined &&
      tgtFacts.dailyDamagesRate !== undefined &&
      srcFacts.dailyDamagesRate !== tgtFacts.dailyDamagesRate
    ) {
      if (tgtFacts.dailyDamagesRate > srcFacts.dailyDamagesRate) {
        const el = elements.find((e) => e.id === 'comm_excessive_damages_scope');
        changeInsights.push({
          elementId: el?.id || 'comm_excessive_damages_scope',
          elementCode: el?.code || 'COMM-02',
          riskLevel: 'HIGH',
          summary: `违约金费率被实质上调（由 ${(srcFacts.dailyDamagesRate * 100).toFixed(2)}% 上调为 ${(tgtFacts.dailyDamagesRate * 100).toFixed(2)}%），加重违约赔偿成本。`,
          legalAdvice: '建议恢复原较低违约金费率，或设定合理的累计赔偿上限。',
          keyChange: `日违约金：${(srcFacts.dailyDamagesRate * 100).toFixed(2)}% → ${(tgtFacts.dailyDamagesRate * 100).toFixed(2)}%`,
          shortSummary: '日违约金提高',
        });
      } else {
        changeInsights.push({
          riskLevel: 'LOW',
          summary: `违约金费率有所下调（由 ${(srcFacts.dailyDamagesRate * 100).toFixed(2)}% 下降至 ${(tgtFacts.dailyDamagesRate * 100).toFixed(2)}%），减轻违约赔偿负担。`,
          legalAdvice: '该项下调对责任方有利。',
          keyChange: `日违约金：${(srcFacts.dailyDamagesRate * 100).toFixed(2)}% → ${(tgtFacts.dailyDamagesRate * 100).toFixed(2)}%`,
          shortSummary: '日违约金下调',
        });
      }
    }

    // -------------------------------------------------------------
    // 维度 4: 内部审计前置付款
    // -------------------------------------------------------------
    if (!srcFacts.isPaymentTiedToInternalAudit && tgtFacts.isPaymentTiedToInternalAudit) {
      const el = elements.find((e) => e.id === 'soft_payment_tied_to_internal_audit');
      const polarity = el?.positionPolarity?.internal_audit_tied;
      const outcome = polarity ? this.resolvePolarityOutcome(polarity, pos) : null;
      if (outcome) {
        changeInsights.push({
          riskLevel: outcome.riskLevel,
          elementId: outcome.elementId || (outcome.riskLevel === 'HIGH' ? el?.id : undefined),
          elementCode: outcome.elementCode || (outcome.riskLevel === 'HIGH' ? el?.code : undefined),
          summary: outcome.summaryTemplate || (outcome.riskLevel === 'HIGH' ? el!.riskSummary : '付款内控流程对我方有利。'),
          legalAdvice: outcome.adviceTemplate || (outcome.riskLevel === 'HIGH' ? el!.legalAdvice : undefined),
          keyChange: '付款前置条件新增内部财务与IT审计',
          shortSummary: '付款条件增加内部审计',
        });
      }
    }

    // -------------------------------------------------------------
    // 维度 5: 永久保密期限
    // -------------------------------------------------------------
    if (!srcFacts.isPerpetualDuration && tgtFacts.isPerpetualDuration && !tgtFacts.isTradeSecretSurvivalDifferentiated) {
      const el = elements.find((e) => e.id === 'nda_perpetual_duration');
      changeInsights.push({
        elementId: el?.id || 'nda_perpetual_duration',
        elementCode: el?.code || 'NDA-01',
        riskLevel: 'HIGH',
        summary: '保密期限被修改为永久有效且未区分商业秘密，产生长期无限期保密合规风险。',
        legalAdvice: '建议将一般商业信息限定为 2~3 年，仅商业秘密存续期有效。',
        keyChange: '保密期限被修改为永久有效',
        shortSummary: '保密期延长为永久',
      });
    }

    // -------------------------------------------------------------
    // 维度 6: 知识产权归属
    // -------------------------------------------------------------
    if (
      srcFacts.ipOwnershipType === 'custom_exclusive' &&
      (tgtFacts.ipOwnershipType === 'supplier_retained' || tgtFacts.ipOwnershipType === 'license_only')
    ) {
      const el = elements.find((e) => e.id === 'soft_ip_ownership_retained');
      const polarity = el?.positionPolarity?.[tgtFacts.ipOwnershipType];
      const outcome = polarity ? this.resolvePolarityOutcome(polarity, pos) : null;
      if (outcome) {
        changeInsights.push({
          riskLevel: outcome.riskLevel,
          elementId: outcome.elementId || (outcome.riskLevel === 'HIGH' ? el?.id : undefined),
          elementCode: outcome.elementCode || (outcome.riskLevel === 'HIGH' ? el?.code : undefined),
          summary: outcome.summaryTemplate || (outcome.riskLevel === 'HIGH' ? el!.riskSummary : '保留源码知识产权对我方有利。'),
          legalAdvice: outcome.adviceTemplate || (outcome.riskLevel === 'HIGH' ? el!.legalAdvice : undefined),
          keyChange: '定制代码知识产权归属变更为开发方保留',
          shortSummary: '知识产权归属变更',
        });
      }
    }

    // -------------------------------------------------------------
    // 维度 7: 争议管辖法院
    // -------------------------------------------------------------
    if (srcFacts.forumLocation !== tgtFacts.forumLocation && tgtFacts.forumLocation && tgtFacts.forumLocation !== 'unspecified') {
      const el = elements.find((e) => e.id === 'comm_dispute_unfavorable_forum');
      const polarity = el?.positionPolarity?.[tgtFacts.forumLocation];
      const outcome = polarity ? this.resolvePolarityOutcome(polarity, pos) : null;
      if (outcome) {
        changeInsights.push({
          riskLevel: outcome.riskLevel,
          elementId: outcome.elementId || (outcome.riskLevel === 'HIGH' ? el?.id : undefined),
          elementCode: outcome.elementCode || (outcome.riskLevel === 'HIGH' ? el?.code : undefined),
          summary: outcome.summaryTemplate || (outcome.riskLevel === 'HIGH' ? el!.riskSummary : '管辖变更对我方有利。'),
          legalAdvice: outcome.adviceTemplate || (outcome.riskLevel === 'HIGH' ? el!.legalAdvice : undefined),
          keyChange: `管辖法院变更为：${tgtFacts.forumLocation}`,
          shortSummary: '管辖法院变更',
        });
      }
    }

    // -------------------------------------------------------------
    // 维度 8: 损害赔偿范围与间接损失排除
    // -------------------------------------------------------------
    if (
      /惩罚性赔偿|间接损失|商业机会损失|可得利益损失/i.test(tgtText) &&
      !/惩罚性赔偿|间接损失|商业机会损失|可得利益损失/i.test(srcText)
    ) {
      const damagesEl = elements.find((e) => e.id === 'comm_excessive_damages_scope');
      const isExclusion =
        damagesEl?.criteria?.negationPatterns?.some((p) => new RegExp(p, 'i').test(tgtText)) ?? false;

      if (isExclusion) {
        changeInsights.push({
          riskLevel: 'LOW',
          summary: '修订条款明确排除了间接损失、商业机会损失或惩罚性赔偿，符合锁定直接损失的风控原则。',
          legalAdvice: '该排除条款有利于控制合同责任敞口，建议保留。',
          keyChange: '明确排除间接损失与惩罚性赔偿',
          shortSummary: '排除间接损失',
        });
      } else {
        changeInsights.push({
          elementId: damagesEl?.id || 'comm_excessive_damages_scope',
          elementCode: damagesEl?.code || 'COMM-02',
          riskLevel: 'HIGH',
          summary: '修订条款新增了承担惩罚性赔偿或全部间接/可得利益损失，扩大合同赔偿敞口。',
          legalAdvice: '建议将赔偿责任严格限定为直接实际财产损失。',
          keyChange: '新增承担惩罚性赔偿或全部间接损失',
          shortSummary: '扩大赔偿责任至间接损失',
        });
      }
    }

    // -------------------------------------------------------------
    // 汇总多维度变更研判结果（避免单一分支吞掉后续风险）
    // -------------------------------------------------------------
    if (changeInsights.length === 0) {
      return {
        riskLevel: 'LOW',
        summary: '条款具体文本有词句修订，整体权责结构未见显著恶化。',
        keyChange: '条款文本词句微调',
        shortSummary: '文本修改',
      };
    }

    const severityRank: Record<'HIGH' | 'MEDIUM' | 'LOW' | 'NONE', number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    changeInsights.sort((a, b) => severityRank[b.riskLevel] - severityRank[a.riskLevel]);

    const primaryInsight = changeInsights[0];
    const primaryWithElement = changeInsights.find((c) => c.elementId);

    const mergedSummary = changeInsights.map((c) => c.summary).join('；');
    const advices = Array.from(new Set(changeInsights.map((c) => c.legalAdvice).filter(Boolean)));
    const mergedAdvice = advices.join(' ');
    const keyChanges = changeInsights.map((c) => c.keyChange).filter(Boolean);
    const shortSummaries = changeInsights.map((c) => c.shortSummary).filter(Boolean);
    const mergedKeyChange = keyChanges.length > 0 ? keyChanges.join('；') : undefined;
    const mergedShortSummary = shortSummaries.length > 0 ? shortSummaries.join('；') : undefined;

    return {
      riskLevel: primaryInsight.riskLevel,
      summary: mergedSummary,
      legalAdvice: mergedAdvice || undefined,
      elementId: primaryWithElement?.elementId,
      elementCode: primaryWithElement?.elementCode,
      keyChange: mergedKeyChange,
      shortSummary: mergedShortSummary,
    };
  }

  private resolvePolarityOutcome(
    polarityItem: PositionPolarityRule[string],
    pos: 'buyer' | 'seller' | 'both'
  ): PolarityResolved | null {
    if (!polarityItem) return null;

    let target: PositionPolarityTarget | undefined;
    if (pos === 'seller') {
      target = polarityItem.seller ?? polarityItem.default;
    } else if (pos === 'buyer') {
      target = polarityItem.buyer ?? polarityItem.default;
    } else {
      target = polarityItem.both ?? polarityItem.default ?? polarityItem.buyer;
    }

    if (!target) return null;

    if (typeof target === 'string') {
      return { riskLevel: toRiskLevel(target) };
    }
    return {
      ...target,
      riskLevel: toRiskLevel(target.riskLevel),
    };
  }
}
