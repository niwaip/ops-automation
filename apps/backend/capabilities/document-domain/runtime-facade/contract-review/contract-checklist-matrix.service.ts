import { Injectable, Optional } from '@nestjs/common';
import type {
  CandidateRuleItem,
  ContractType,
  CustomCheckpointDto,
  MissingClauseAlert,
  PartyPositionInput,
  ReviewRiskLevel,
  StandardContractType,
} from './contract-review.types';
import {
  REVIEW_ELEMENTS_CATALOG,
  ReviewFactExtractorService,
  type ExtractedLegalFacts,
  type ReviewElement,
} from '../contract-elements';

export interface CheckpointRule {
  id: string;
  title: string;
  category: string;
  severity: ReviewRiskLevel;
  matcher: (clauseText: string, title: string) => boolean;
  riskSummary: string;
  legalAdvice: string;
  recommendRevision: (original: string) => string;
  recommendedRevision?: string;
  elementId?: string;
  elementCode?: string;
  criteria?: any;
}

@Injectable()
export class ContractChecklistMatrixService {
  constructor(
    @Optional() private readonly factExtractor: ReviewFactExtractorService = new ReviewFactExtractorService()
  ) {}

  /**
   * Normalize contract type to standard key (e.g. software_dev -> software_development)
   */
  private normalizeType(type: ContractType): StandardContractType {
    if (type === 'software_dev' || type === 'software_development') {
      return 'software_development';
    }
    if (type === 'labor' || type === 'employment') {
      return 'employment';
    }
    if (type === 'nda' || type === 'procurement' || type === 'lease' || type === 'general') {
      return type;
    }
    return 'general';
  }

  normalizePosition(position?: PartyPositionInput | string): 'buyer' | 'seller' | 'both' {
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

  /**
   * Type-specific & position-filtered rule checkpoints for individual clauses
   */
  getRulesForType(
    type: ContractType,
    positionOrCustom?: PartyPositionInput | string | CustomCheckpointDto[],
    custom?: CustomCheckpointDto[]
  ): CheckpointRule[] {
    let position: PartyPositionInput | string = 'both';
    let customList: CustomCheckpointDto[] | undefined = custom;

    if (Array.isArray(positionOrCustom)) {
      customList = positionOrCustom;
      position = 'both';
    } else if (typeof positionOrCustom === 'string') {
      position = positionOrCustom;
    }

    const customRules = this.convertCustomCheckpoints(customList);
    const normalizedType = this.normalizeType(type);
    const normalizedPos = this.normalizePosition(position);

    // Filter substantive / form review elements applicable to this contract type & position
    const catalogRules = REVIEW_ELEMENTS_CATALOG.filter((el) => {
      if (el.checkType === 'PRESENCE') return false;

      // 1. Type matching: prevent commercial general rules from polluting employment and nda
      const typeMatched =
        el.applicableContractTypes.includes(normalizedType) ||
        (normalizedType !== 'employment' && normalizedType !== 'nda' && el.applicableContractTypes.includes('general'));
      if (!typeMatched) return false;

      // 2. Position matching: filter rules according to user's party position
      const posMatched =
        normalizedPos === 'both' ||
        el.applicablePosition === 'both' ||
        el.applicablePosition === normalizedPos;

      return posMatched;
    }).map((el) => this.mapElementToRule(el, customList));

    // Custom organization/user checkpoints take highest priority
    return [...customRules, ...catalogRules];
  }

  /**
   * Map catalog ReviewElement to runtime CheckpointRule with fact extractor support and custom overrides
   */
  private mapElementToRule(el: ReviewElement, custom?: CustomCheckpointDto[]): CheckpointRule {
    const customOverride = custom?.find(
      (c) =>
        c.id === el.id ||
        (c as any).elementId === el.id ||
        (c as any).elementCode === el.code ||
        c.title === el.title
    );

    return {
      id: el.id,
      elementId: el.id,
      elementCode: el.code,
      title: customOverride?.title || el.title,
      category: el.category,
      severity: (customOverride?.severity || el.severity) as ReviewRiskLevel,
      criteria: el.criteria,
      matcher: (clauseText: string, title: string) => {
        // 1. Structured fact matching
        if (el.factMatcher) {
          const facts = this.factExtractor.extractClauseFacts(clauseText, title);
          if (el.factMatcher(facts, clauseText, title)) {
            return true;
          }
        }
        // 2. Regular expression / pattern matching
        if (el.textMatcher) {
          return el.textMatcher(clauseText, title);
        }
        return false;
      },
      riskSummary: customOverride?.rule || el.riskSummary,
      legalAdvice: el.legalAdvice,
      recommendRevision: (orig: string) => {
        if (customOverride?.recommendedRevision) {
          return customOverride.recommendedRevision;
        }
        if (typeof el.recommendedRevision === 'function') {
          return el.recommendedRevision(orig);
        }
        if (typeof el.recommendedRevision === 'string') {
          return el.recommendedRevision;
        }
        return orig;
      },
    };
  }

  convertCustomCheckpoints(custom?: CustomCheckpointDto[]): CheckpointRule[] {
    if (!custom || !Array.isArray(custom)) return [];
    return custom.map((c, index) => {
      const explicitKeywords = Array.isArray((c as any).keywords)
        ? (c as any).keywords
        : [];
      const stopWords =
        /[\s,，、;；|:：/\\_\-()（）[\]【】\d+%]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如/g;
      const autoTokens = (c.title + ' ' + (c.rule || ''))
        .split(stopWords)
        .filter((k) => k && k.length >= 2);

      const subTokens = autoTokens.flatMap((tok) => {
        if (tok.length >= 4) {
          return [tok, tok.slice(0, 3), tok.slice(0, 2)];
        }
        return [tok];
      });

      const allKeywords = Array.from(
        new Set([...explicitKeywords, ...autoTokens, ...subTokens])
      ).filter((k) => k.length >= 2);

      return {
        id: c.id || `custom-${index}`,
        elementId: c.id || `custom-${index}`,
        elementCode: `CUST-${index + 1}`,
        title: c.title || `自定义审查项 ${index + 1}`,
        category: c.category || '自定义审查要点',
        severity: (c.severity || 'HIGH') as ReviewRiskLevel,
        matcher: (clauseText: string, title: string) => {
          const combined = `${title} ${clauseText}`.toLowerCase();
          return allKeywords.some((kw) => combined.includes(kw.toLowerCase()));
        },
        riskSummary: `[专属要点] ${c.title}：${c.rule}`,
        legalAdvice: `该条款触发了企业/个人自定义审查要点【${c.title}】，请重点核查。`,
        recommendRevision: (original: string) => {
          if (c.recommendedRevision) {
            return c.recommendedRevision;
          }
          return original;
        },
      };
    });
  }

  /**
   * Recall the most relevant 1-3 candidate review rules for a clause based on
   * clause title keywords, text semantics, extracted facts, and category matching.
   * This decouples candidate rules (given to LLM for substantive evaluation)
   * from matchedRules (deterministic regex/hard violations).
   */
  recallCandidateRulesForClause(
    clauseText: string,
    clauseTitle: string,
    rules: CheckpointRule[],
    facts?: ExtractedLegalFacts
  ): CandidateRuleItem[] {
    if (!rules || rules.length === 0) return [];

    const normTitle = (clauseTitle || '').toLowerCase();
    const normText = (clauseText || '').slice(0, 800).toLowerCase();

    const scored = rules.map((r) => {
      let score = 0;
      const rCode = (r.elementCode || '').toUpperCase();
      const rTitle = (r.title || '').toLowerCase();
      const rCat = (r.category || '').toUpperCase();

      // 1. Topic & Element Specific Associations (Highest priority for NDA and standard contracts)
      if (rCode === 'NDA-01' || r.id === 'nda_perpetual_duration') {
        if (/期限|有效期|终止|生效|存续|年限|期间/.test(normTitle)) score += 12;
        if (/期限|有效期|终止|永久|无期限|存续|长期有效/.test(normText)) score += 5;
      } else if (rCode === 'NDA-02' || r.id === 'nda_overbroad_scope') {
        if (/范围|定义|界定|保密信息|秘密|材料|载体/.test(normTitle)) score += 12;
        if (/保密信息|机密信息|定义|范围|任何信息|一切信息|书面标记/.test(normText)) score += 5;
      } else if (rCode === 'NDA-03' || r.id === 'nda_strict_duty_of_care') {
        if (/义务|责任|措施|安全|保管|注意|使用|防范/.test(normTitle)) score += 12;
        if (/保密义务|保护措施|审慎|合理注意|保管|绝对安全|同等重要/.test(normText)) score += 5;
      } else if (rCode === 'NDA-06' || r.id === 'nda_excessive_liquidated_damages') {
        if (/违约|违约金|赔偿|损失|追偿|救济|责任/.test(normTitle)) score += 12;
        if (/违约金|损害赔偿|赔偿损失|惩罚性|违约责任|直接经济损失/.test(normText)) score += 5;
      } else {
        // Generic Category-based matching
        if (rCat === 'PAYMENT' && /付款|支付|费用|报酬|价格|发票|结算/.test(normTitle)) score += 10;
        if (rCat === 'DELIVERY_AND_ACCEPTANCE' && /交付|验收|工期|标准|成果/.test(normTitle)) score += 10;
        if (rCat === 'INTELLECTUAL_PROPERTY' && /知识产权|著作权|专利|版权|归属|授权/.test(normTitle)) score += 10;
        if (rCat === 'LIABILITY_AND_REMEDY' && /违约|赔偿|责任|免责|追偿|救济/.test(normTitle)) score += 10;
        if (rCat === 'TERMINATION' && /解除|终止|中止/.test(normTitle)) score += 10;
        if (rCat === 'DISPUTE_RESOLUTION' && /争议|管辖|诉讼|仲裁|法律适用/.test(normTitle)) score += 10;
        if (rCat === 'CONFIDENTIALITY' && /保密|机密|商业秘密/.test(normTitle)) score += 6;
      }

      // 2. Rule title keywords matching in clause title
      const titleTokens = rTitle
        .split(/[\s,，、;；|:：/\\_\-()（）[\]【】\d+%]+|是否|不得|应当|必须|约定|排查|检查|过严|不切实际|过于|且未|及/g)
        .filter((t) => t.length >= 2);
      for (const tok of titleTokens) {
        if (normTitle.includes(tok)) score += 4;
        else if (normText.includes(tok)) score += 1;
      }

      // 3. Extracted facts matching
      if (r.criteria?.factField && facts && (facts as any)[r.criteria.factField]) {
        score += 8;
      }

      // 4. Deterministic pattern partial match
      if (r.criteria?.patterns && Array.isArray(r.criteria.patterns)) {
        for (const p of r.criteria.patterns) {
          try {
            if (new RegExp(p, 'i').test(`${normTitle} ${normText}`)) {
              score += 6;
              break;
            }
          } catch {}
        }
      }

      // 5. Deterministic rule matcher match
      try {
        if (r.matcher(clauseText, clauseTitle)) {
          score += 15;
        }
      } catch {}

      return { rule: r, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ rule: r }) => ({
        id: r.id,
        elementId: r.elementId,
        elementCode: r.elementCode,
        title: r.title,
        category: r.category,
        severity: r.severity,
        riskSummary: r.riskSummary,
        legalAdvice: r.legalAdvice,
        recommendRevision: r.recommendRevision,
        recommendedRevision: typeof r.recommendRevision === 'function' ? r.recommendRevision(clauseText) : undefined,
        criterion: r.title,
      }));
  }

  /**
   * Missing clause detectors across the whole document using the review elements catalog with position & type filtering
   */
  detectMissingClauses(
    type: ContractType,
    fullText: string,
    position?: PartyPositionInput | string,
    existingClauses?: Array<{ title?: string; clauseNumber?: string; originalContent?: string; content?: string }>
  ): MissingClauseAlert[] {
    const normalizedType = this.normalizeType(type);
    const normalizedPos = this.normalizePosition(position);
    const alerts: MissingClauseAlert[] = [];

    // Filter missing clause review elements (checkType === 'PRESENCE')
    const presenceElements = REVIEW_ELEMENTS_CATALOG.filter((el) => {
      if (el.checkType !== 'PRESENCE') return false;

      const typeMatched =
        el.applicableContractTypes.includes(normalizedType) ||
        (normalizedType !== 'employment' && normalizedType !== 'nda' && el.applicableContractTypes.includes('general'));
      if (!typeMatched) return false;

      const posMatched =
        normalizedPos === 'both' ||
        el.applicablePosition === 'both' ||
        el.applicablePosition === normalizedPos;

      return posMatched;
    });

    for (const el of presenceElements) {
      // 1. If parsed AST clauses are provided, check whether this element is already substantively covered by an existing clause
      if (existingClauses && existingClauses.length > 0) {
        const matchingClause = existingClauses.find((c) => {
          const t = `${c.title || ''} ${c.clauseNumber || ''}`.toLowerCase();
          const body = (c.originalContent || c.content || '').toLowerCase();
          if (el.id === 'missing_nda_exceptions' || el.code === 'NDA-04') {
            return (
              /例外|除外|不适用|非保密|保密范围除外/.test(t) ||
              /(?:保密信息|上述信息)?(?:不包括|不属于|不应包括|除外情形)/.test(body)
            );
          }
          if (el.id === 'missing_force_majeure' || el.code === 'COMM-04') {
            return /不可抗力|情势变更|免责事由/.test(t) || /不可抗力/.test(body);
          }
          if (el.id === 'missing_dispute_resolution' || el.code === 'COMM-05') {
            return /争议解决|管辖|法律适用|诉讼|仲裁/.test(t) || /管辖法院|仲裁委员会/.test(body);
          }
          if (el.id === 'missing_nda_return_destroy' || el.code === 'NDA-05') {
            return /返还|销毁|交回|资料归还/.test(t) || /(?:返还|销毁).*(?:保密|文件|资料|载体)/.test(body);
          }
          if (el.id === 'missing_source_code_delivery' || el.code === 'SOFT-01') {
            return /源代码|源码|交付物/.test(t) && /(?:交付|提供).*(?:源代码|源码)/.test(body);
          }
          return false;
        });

        if (matchingClause) {
          // The contract has this clause. Check subitems coverage if required
          if (el.criteria?.requiredSubItems && el.criteria.requiredSubItems.length > 0) {
            const clauseBody = matchingClause.originalContent || matchingClause.content || '';
            const coveredCount = el.criteria.requiredSubItems.filter((p: string) => {
              try {
                return new RegExp(p, 'i').test(clauseBody);
              } catch {
                return clauseBody.toLowerCase().includes(p.toLowerCase());
              }
            }).length;
            const totalCount = el.criteria.requiredSubItems.length;
            if (coveredCount < 3) {
              // Severely incomplete coverage -> HIGH severity alert
              alerts.push({
                id: el.id,
                elementId: el.id,
                elementCode: el.code,
                title: el.title,
                category: el.category,
                severity: 'HIGH',
                reason: el.riskSummary,
                recommendedClause:
                  typeof el.recommendedRevision === 'string' ? el.recommendedRevision : '',
              });
            } else if (coveredCount < totalCount) {
              // Partially covered (>= 3 items) -> MEDIUM refinement alert
              alerts.push({
                id: el.id,
                elementId: el.id,
                elementCode: el.code,
                title: '保密除外情形约定不够周延',
                category: el.category,
                severity: 'MEDIUM',
                reason: `除外条款已约定核心除外情形（命中 ${coveredCount}/${totalCount} 项），但法定覆盖不够周全，建议核验并补充约定未明确列明的除外情形（如独立研发等），消除履约抗辩隐患。`,
                recommendedClause:
                  typeof el.recommendedRevision === 'string' ? el.recommendedRevision : '',
              });
            }
          }
          // Already covered by an existing clause in the contract; skip hardcoded fullText missing detector
          continue;
        }
      }

      if (el.missingDetector && el.missingDetector(fullText)) {
        let title = el.title;
        let severity = el.severity as ReviewRiskLevel;
        let reason = el.riskSummary;

        // Subitems coverage refinement (e.g. NDA-04 exceptions partially covered)
        if (el.criteria?.requiredSubItems && el.criteria.requiredSubItems.length > 0) {
          const coveredCount = el.criteria.requiredSubItems.filter((p: string) => {
            try {
              return new RegExp(p, 'i').test(fullText);
            } catch {
              return fullText.toLowerCase().includes(p.toLowerCase());
            }
          }).length;
          const totalCount = el.criteria.requiredSubItems.length;
          if (coveredCount >= 3 && coveredCount < totalCount) {
            title = '保密除外情形约定不够周延';
            severity = 'MEDIUM';
            reason = `除外条款已约定核心除外情形（命中 ${coveredCount}/${totalCount} 项），但法定覆盖不够周全，建议核验并补充约定未明确列明的除外情形（如独立研发等），消除履约抗辩隐患。`;
          }
        }

        alerts.push({
          id: el.id,
          elementId: el.id,
          elementCode: el.code,
          title,
          category: el.category,
          severity,
          reason,
          recommendedClause:
            typeof el.recommendedRevision === 'string' ? el.recommendedRevision : '',
        });
      }
    }

    return alerts;
  }
}
