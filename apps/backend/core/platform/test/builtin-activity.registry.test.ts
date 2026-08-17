import {
  AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  BuiltinActivityRegistry,
} from '../src/modules/temporal-workflow/builtin-activity.registry';

describe('BuiltinActivityRegistry model capability boundary', () => {
  let registry: BuiltinActivityRegistry;

  beforeEach(() => {
    registry = new BuiltinActivityRegistry();
  });

  it('keeps aiStructuredTransform only as a legacy compatibility activity', () => {
    const activity = registry.getByKey(AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY);

    expect(activity?.deprecation).toEqual(
      expect.objectContaining({
        status: 'legacy',
        migrateTo: 'llm_operation',
        canBeUsedInNewWorkflows: false,
      }),
    );
  });

  it('does not register LLM Operation as a Temporal Activity', () => {
    expect(registry.getByKey('llmOperation')).toBeNull();
    expect(registry.getByRef('builtin:llmOperation')).toBeNull();
  });
});
