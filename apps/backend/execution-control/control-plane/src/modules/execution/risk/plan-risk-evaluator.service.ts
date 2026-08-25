import { Injectable } from '@nestjs/common';

export type PlanRiskLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface PlanRiskEvaluation {
  riskLevel: PlanRiskLevel;
  requiresApproval: boolean;
  reasonCodes: string[];
}

const SIDE_EFFECT_RISK: Record<string, PlanRiskEvaluation> = {
  none: { riskLevel: 'L0', requiresApproval: false, reasonCodes: [] },
  read: { riskLevel: 'L0', requiresApproval: false, reasonCodes: [] },
  internal_write: { riskLevel: 'L1', requiresApproval: false, reasonCodes: [] },
  external_write: { riskLevel: 'L2', requiresApproval: true, reasonCodes: [] },
  destructive: { riskLevel: 'L3', requiresApproval: true, reasonCodes: [] },
  financial: { riskLevel: 'L3', requiresApproval: true, reasonCodes: [] },
  privilege_change: { riskLevel: 'L3', requiresApproval: true, reasonCodes: [] },
};

@Injectable()
export class PlanRiskEvaluatorService {
  evaluate(plan: unknown, options?: { requireDeclaredSideEffects?: boolean }): PlanRiskEvaluation {
    const record = this.asRecord(plan);
    const evaluations: PlanRiskEvaluation[] = [];
    const legacyRisk = this.asRecord(record.risk_summary);
    if (Object.keys(legacyRisk).length > 0) evaluations.push(this.evaluateLegacyRisk(legacyRisk));

    const nodes = Array.isArray(record.nodes) ? record.nodes : [];
    for (const item of nodes) {
      const node = this.asRecord(item);
      const metadata = this.asRecord(node.metadata);
      const declared = [
        node.sideEffectClass,
        node.side_effect_class,
        metadata.sideEffectClass,
      ].find((value) => typeof value === 'string' && value.trim() !== '');
      if (typeof declared === 'string') {
        const normalized = declared.trim().toLowerCase();
        const mapped = SIDE_EFFECT_RISK[normalized] || {
          riskLevel: 'L2' as const,
          requiresApproval: true,
          reasonCodes: ['unknown_side_effect_class'],
        };
        evaluations.push({
          ...mapped,
          reasonCodes: [...mapped.reasonCodes, `side_effect:${normalized}`],
        });
      } else if (options?.requireDeclaredSideEffects && node.kind === 'skill') {
        evaluations.push({
          riskLevel: 'L2',
          requiresApproval: true,
          reasonCodes: ['missing_side_effect_declaration'],
        });
      }

      const dataClassification = [
        node.dataClassification,
        node.data_classification,
        metadata.dataClassification,
      ].find((value) => typeof value === 'string');
      if (dataClassification === 'restricted' || dataClassification === 'secret') {
        evaluations.push({
          riskLevel: 'L3',
          requiresApproval: true,
          reasonCodes: [`data_classification:${dataClassification}`],
        });
      }
    }

    if (evaluations.length === 0) {
      return { riskLevel: 'L0', requiresApproval: false, reasonCodes: ['no_material_risk'] };
    }
    const riskLevel = evaluations.reduce<PlanRiskLevel>(
      (highest, current) =>
        this.rank(current.riskLevel) > this.rank(highest) ? current.riskLevel : highest,
      'L0'
    );
    return {
      riskLevel,
      requiresApproval: evaluations.some((item) => item.requiresApproval),
      reasonCodes: Array.from(new Set(evaluations.flatMap((item) => item.reasonCodes))).sort(),
    };
  }

  private evaluateLegacyRisk(risk: Record<string, unknown>): PlanRiskEvaluation {
    const level = String(risk.level || 'low');
    const riskLevel: PlanRiskLevel = level === 'high' ? 'L2' : level === 'medium' ? 'L1' : 'L0';
    return {
      riskLevel,
      requiresApproval: risk.requires_human_review === true,
      reasonCodes: Array.isArray(risk.items)
        ? risk.items.filter((item): item is string => typeof item === 'string')
        : [`legacy_risk:${level}`],
    };
  }

  private rank(level: PlanRiskLevel): number {
    return { L0: 0, L1: 1, L2: 2, L3: 3 }[level];
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }
}
