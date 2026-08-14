import { FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE } from '../src/modules/temporal-workflow/fixed-activity-templates';

describe('legacy aiStructuredTransform Activity', () => {
  it('is feature-flagged and emits an auditable fallback event', () => {
    expect(FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE).toContain(
      'OPS_DISABLE_LEGACY_AI_STRUCTURED_TRANSFORM',
    );
    expect(FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE).toContain(
      'LLM_OPERATION_LEGACY_ACTIVITY_FALLBACK',
    );
  });

  it('points migrations to the independent control-plane runtime', () => {
    expect(FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE).toContain(
      'control-plane llm_operation node',
    );
    expect(FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE).not.toContain(
      '@activity.defn(name="llmOperation")',
    );
  });
});
