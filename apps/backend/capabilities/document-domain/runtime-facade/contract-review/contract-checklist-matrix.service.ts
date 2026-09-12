import { Injectable, Optional } from '@nestjs/common';
import type {
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
        /[\s,，、;；|:：/\\_\-()（）\[\]【】\d+%]+|是否|不得|应当|必须|超过|高于|低于|约定|排查|检查|若|如果|如/g;
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
            const coveredCount = el.criteria.requiredSubItems.filter((p: string) =>
              new RegExp(p, 'i').test(clauseBody)
            ).length;
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
          const coveredCount = el.criteria.requiredSubItems.filter((p: string) => new RegExp(p, 'i').test(fullText)).length;
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
