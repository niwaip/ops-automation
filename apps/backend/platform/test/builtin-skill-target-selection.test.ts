import { BuiltinSkillProvisioningService } from '@ops/skill-registry/builtin';

describe('builtin skill target selection', () => {
  const service = new BuiltinSkillProvisioningService({} as never, {} as never);

  it('selects exactly one requested capability', () => {
    const bundles = service.resolveTargetBundles('platform.search.web');
    expect(bundles).toHaveLength(1);
    expect(bundles[0]).toMatch(/platform\.search\.web$/);
  });

  it('rejects an unknown capability without falling back to all', () => {
    expect(() => service.resolveTargetBundles('platform.missing.capability')).toThrow(
      "Built-in skill bundle 'platform.missing.capability' not found"
    );
  });
});
