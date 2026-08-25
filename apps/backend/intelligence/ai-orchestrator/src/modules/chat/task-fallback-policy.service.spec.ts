import { TaskFallbackPolicyService } from './task-fallback-policy.service';

describe('TaskFallbackPolicyService', () => {
  const originalValue = process.env.PRODUCTION_REACT_FALLBACK_ENABLED;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.PRODUCTION_REACT_FALLBACK_ENABLED;
    else process.env.PRODUCTION_REACT_FALLBACK_ENABLED = originalValue;
  });

  it('fails closed by default', () => {
    delete process.env.PRODUCTION_REACT_FALLBACK_ENABLED;
    expect(new TaskFallbackPolicyService().isImplicitReactFallbackEnabled()).toBe(false);
  });

  it('requires an exact explicit opt-in', () => {
    process.env.PRODUCTION_REACT_FALLBACK_ENABLED = 'false';
    expect(new TaskFallbackPolicyService().isImplicitReactFallbackEnabled()).toBe(false);
    process.env.PRODUCTION_REACT_FALLBACK_ENABLED = 'true';
    expect(new TaskFallbackPolicyService().isImplicitReactFallbackEnabled()).toBe(true);
  });
});
