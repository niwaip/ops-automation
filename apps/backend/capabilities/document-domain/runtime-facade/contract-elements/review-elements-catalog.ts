import { Injectable } from '@nestjs/common';
import type {
  ExtractedLegalFacts,
  ReviewElement,
} from './review-element.types';
import type { ReviewElementConfig } from './review-element-config.types';
import { BUILTIN_REVIEW_ELEMENTS } from './builtin-review-elements.default';

export * from './builtin-review-elements.default';

/**
 * Convert a declarative ReviewElementConfig into an executable ReviewElement
 */
export function createExecutableReviewElement(config: ReviewElementConfig): ReviewElement {
  return {
    id: config.id,
    code: config.code,
    version: config.version,
    title: config.title,
    category: config.category,
    applicableContractTypes: config.applicableContractTypes,
    applicablePosition: config.applicablePosition,
    severity: config.severity,
    checkType: config.checkType,
    thresholds: config.thresholds,
    criteria: config.criteria,
    positionPolarity: config.positionPolarity,
    compareRule: config.compareRule,
    riskSummary: config.riskSummary,
    legalAdvice: config.legalAdvice,
    recommendedRevision: config.recommendedRevision,

    factMatcher: (facts: ExtractedLegalFacts, clauseText: string, clauseTitle: string) => {
      if (!config.criteria) return false;
      const { factField, factCondition } = config.criteria;
      if (!factField || !factCondition) return false;
      const val = facts[factField];
      if (factCondition.operator === 'equals') return val === factCondition.targetValue;
      if (factCondition.operator === 'notEquals') return val !== factCondition.targetValue;
      if (factCondition.operator === 'isTrue') return Boolean(val);
      if (factCondition.operator === 'isFalse') return !val;
      if (factCondition.operator === 'exists') return val !== undefined && val !== null;
      if (factCondition.operator === 'greaterThan') return typeof val === 'number' && val > factCondition.targetValue;
      if (factCondition.operator === 'lessThan') return typeof val === 'number' && val < factCondition.targetValue;
      return false;
    },

    textMatcher: (clauseText: string, clauseTitle: string) => {
      if (!config.criteria?.patterns || config.criteria.patterns.length === 0) return false;
      const combined = `${clauseTitle} ${clauseText}`;
      const hasPattern = config.criteria.patterns.some((p) => new RegExp(p, 'i').test(combined));
      if (!hasPattern) return false;

      // Check negation patterns (if negation matched, do not flag as violation)
      if (config.criteria.negationPatterns && config.criteria.negationPatterns.length > 0) {
        const isNegated = config.criteria.negationPatterns.some((p) => new RegExp(p, 'i').test(combined));
        if (isNegated) return false;
      }
      return true;
    },

    missingDetector: (fullText: string) => {
      if (config.checkType !== 'PRESENCE') return false;

      // 1. Multi-item statutory coverage (e.g. NDA-04 5 statutory exceptions)
      if (config.criteria?.requiredSubItems && config.criteria.requiredSubItems.length > 0) {
        const requiredCount = config.thresholds?.minRequiredSubItemsCount ?? config.criteria.requiredSubItems.length;
        const coveredCount = config.criteria.requiredSubItems.filter((p) => new RegExp(p, 'i').test(fullText)).length;
        return coveredCount < requiredCount;
      }

      // 2. Affirmative delivery requirement (e.g. SOFT-01 source code delivery)
      if (config.criteria?.affirmativePatterns && config.criteria.affirmativePatterns.length > 0) {
        // Negation check takes precedence
        if (config.criteria.negationPatterns && config.criteria.negationPatterns.length > 0) {
          const isExplicitlyDenied = config.criteria.negationPatterns.some((p) => new RegExp(p, 'i').test(fullText));
          if (isExplicitlyDenied) return true; // Missing mandatory delivery!
        }
        const hasAffirmative = config.criteria.affirmativePatterns.some((p) => new RegExp(p, 'i').test(fullText));
        return !hasAffirmative;
      }

      // 3. Regular pattern presence check (missing if pattern not found)
      if (config.criteria?.patterns && config.criteria.patterns.length > 0) {
        const hasPattern = config.criteria.patterns.some((p) => new RegExp(p, 'i').test(fullText));
        return !hasPattern;
      }

      return false;
    },
  };
}

/**
 * Standard array of executable review elements
 */
export const REVIEW_ELEMENTS_CATALOG: ReviewElement[] = BUILTIN_REVIEW_ELEMENTS.map(createExecutableReviewElement);

/**
 * Find review element by element ID or element code (e.g. 'SOFT-01', 'missing_source_code_delivery')
 */
export function findReviewElement(idOrCode?: string): ReviewElement | undefined {
  if (!idOrCode) return undefined;
  const lower = idOrCode.toLowerCase();
  return REVIEW_ELEMENTS_CATALOG.find(
    (el) => el.id === idOrCode || el.code.toLowerCase() === lower
  );
}

/**
 * Configuration Registry Service for Dynamic Enterprise Overrides
 */
@Injectable()
export class ReviewElementsRegistryService {
  private elementConfigs: Map<string, ReviewElementConfig> = new Map();

  constructor() {
    this.resetToDefaults();
  }

  resetToDefaults(): void {
    this.elementConfigs.clear();
    for (const el of BUILTIN_REVIEW_ELEMENTS) {
      this.elementConfigs.set(el.id, { ...el });
    }
  }

  getAllConfigs(): ReviewElementConfig[] {
    return Array.from(this.elementConfigs.values());
  }

  getConfig(id: string): ReviewElementConfig | undefined {
    return this.elementConfigs.get(id);
  }

  findConfig(idOrCode?: string): ReviewElementConfig | undefined {
    if (!idOrCode) return undefined;
    const lower = idOrCode.toLowerCase();
    for (const el of this.elementConfigs.values()) {
      if (el.id === idOrCode || el.code.toLowerCase() === lower) {
        return el;
      }
    }
    return undefined;
  }

  /**
   * Apply enterprise or runtime custom rules to override or augment element configs
   */
  mergeCustomRules(customRules?: any[]): void {
    if (!customRules || !Array.isArray(customRules)) return;
    for (const c of customRules) {
      const id = c.id || c.elementId;
      if (!id) continue;
      const existing = this.elementConfigs.get(id);
      if (existing) {
        this.elementConfigs.set(id, {
          ...existing,
          title: c.title || existing.title,
          severity: c.severity || existing.severity,
          thresholds: {
            ...existing.thresholds,
            ...(c.thresholds || {}),
          },
          riskSummary: c.riskSummary || c.rule || existing.riskSummary,
          legalAdvice: c.legalAdvice || c.recommendedRevision || existing.legalAdvice,
        });
      }
    }
  }

  getExecutableElements(): ReviewElement[] {
    return this.getAllConfigs().map(createExecutableReviewElement);
  }
}
