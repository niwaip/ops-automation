import { PlanRiskEvaluatorService } from '../src/modules/execution/risk/plan-risk-evaluator.service';

describe('PlanRiskEvaluatorService', () => {
  const service = new PlanRiskEvaluatorService();

  it('uses one policy for a legacy single capability plan', () => {
    expect(
      service.evaluate({
        risk_summary: {
          level: 'medium',
          requires_human_review: true,
          items: ['external_recipient'],
        },
      })
    ).toEqual({
      riskLevel: 'L1',
      requiresApproval: true,
      reasonCodes: ['external_recipient'],
    });
  });

  it('aggregates the highest declared side effect across a deterministic plan', () => {
    expect(
      service.evaluate({
        nodes: [
          { kind: 'skill', sideEffectClass: 'read' },
          { kind: 'skill', metadata: { sideEffectClass: 'external_write' } },
        ],
      })
    ).toEqual({
      riskLevel: 'L2',
      requiresApproval: true,
      reasonCodes: ['side_effect:external_write', 'side_effect:read'],
    });
  });

  it('fails closed for missing declarations when strict enforcement is enabled', () => {
    expect(
      service.evaluate(
        { nodes: [{ kind: 'skill', skillId: 'legacy-skill' }] },
        { requireDeclaredSideEffects: true }
      )
    ).toEqual({
      riskLevel: 'L2',
      requiresApproval: true,
      reasonCodes: ['missing_side_effect_declaration'],
    });
  });

  it('elevates restricted data to L3', () => {
    expect(
      service.evaluate({
        nodes: [{ kind: 'skill', sideEffectClass: 'read', dataClassification: 'restricted' }],
      })
    ).toEqual({
      riskLevel: 'L3',
      requiresApproval: true,
      reasonCodes: ['data_classification:restricted', 'side_effect:read'],
    });
  });
});
