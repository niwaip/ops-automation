import { GracePolicyService } from '../src/modules/execution/plan-runtime/grace-policy.service';

const PAST_DEADLINE = '2020-01-01T00:00:00.000Z';
const FUTURE_DEADLINE = '2099-01-01T00:00:00.000Z';

describe('GracePolicyService (§17.1)', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.LEGACY_GRACE_DEADLINE = process.env.LEGACY_GRACE_DEADLINE;
    envBackup.LEGACY_ALLOW_IN_FLIGHT_RECOVERY = process.env.LEGACY_ALLOW_IN_FLIGHT_RECOVERY;
    envBackup.LEGACY_ALLOW_NEW_PLANS = process.env.LEGACY_ALLOW_NEW_PLANS;
    envBackup.LEGACY_ON_GRACE_EXPIRED = process.env.LEGACY_ON_GRACE_EXPIRED;
  });

  afterEach(() => {
    process.env.LEGACY_GRACE_DEADLINE = envBackup.LEGACY_GRACE_DEADLINE;
    process.env.LEGACY_ALLOW_IN_FLIGHT_RECOVERY = envBackup.LEGACY_ALLOW_IN_FLIGHT_RECOVERY;
    process.env.LEGACY_ALLOW_NEW_PLANS = envBackup.LEGACY_ALLOW_NEW_PLANS;
    process.env.LEGACY_ON_GRACE_EXPIRED = envBackup.LEGACY_ON_GRACE_EXPIRED;
    delete process.env.LEGACY_GRACE_DEADLINE;
  });

  it('is inactive when LEGACY_GRACE_DEADLINE is not configured (fix ⑩ — no fabricated 30-day window)', () => {
    delete process.env.LEGACY_GRACE_DEADLINE;
    const policy = new GracePolicyService();
    expect(policy.getConfig().graceDeadline).toBeUndefined();
    expect(policy.isPastGrace()).toBe(false);
    // Even aggressive modes cannot reject without a configured deadline.
    process.env.LEGACY_ON_GRACE_EXPIRED = 'reject_all';
    const aggressive = new GracePolicyService();
    expect(aggressive.shouldReject('queued')).toBe(false);
    expect(aggressive.shouldReject('running')).toBe(false);
  });

  it('does not reject anything while the deadline is in the future', () => {
    process.env.LEGACY_GRACE_DEADLINE = FUTURE_DEADLINE;
    const policy = new GracePolicyService();
    expect(policy.shouldReject('queued')).toBe(false);
    expect(policy.shouldReject('running')).toBe(false);
    expect(policy.shouldReject('draft')).toBe(false);
  });

  it('rejects never-started executions (queued) after the grace deadline', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    const policy = new GracePolicyService();
    expect(policy.isPastGrace()).toBe(true);
    expect(policy.shouldReject('queued')).toBe(true);
    expect(policy.shouldReject('draft')).toBe(true);
  });

  it('protects already-started executions (running) after the grace deadline', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    const policy = new GracePolicyService();
    expect(policy.shouldReject('running')).toBe(false);
    expect(policy.shouldReject('waiting_input')).toBe(false);
  });

  it('honors allow_all mode: rejects nothing after the grace deadline', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    process.env.LEGACY_ON_GRACE_EXPIRED = 'allow_all';
    const policy = new GracePolicyService();
    expect(policy.shouldReject('queued')).toBe(false);
    expect(policy.shouldReject('running')).toBe(false);
  });

  it('honors reject_all mode: rejects started executions too', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    process.env.LEGACY_ON_GRACE_EXPIRED = 'reject_all';
    const policy = new GracePolicyService();
    expect(policy.shouldReject('queued')).toBe(true);
    expect(policy.shouldReject('running')).toBe(true);
  });

  it('treats the coarse kill switch (both allow flags off) as reject_all', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    process.env.LEGACY_ALLOW_IN_FLIGHT_RECOVERY = 'false';
    process.env.LEGACY_ALLOW_NEW_PLANS = 'false';
    const policy = new GracePolicyService();
    expect(policy.shouldReject('queued')).toBe(true);
    expect(policy.shouldReject('running')).toBe(true);
  });

  it('leaves the gate inactive when LEGACY_GRACE_DEADLINE is invalid (never invents a date)', () => {
    process.env.LEGACY_GRACE_DEADLINE = 'not-a-date';
    const policy = new GracePolicyService();
    expect(policy.getConfig().graceDeadline).toBeUndefined();
    expect(policy.isPastGrace()).toBe(false);
    expect(policy.shouldReject('queued')).toBe(false);
  });

  it('surfaces parsed config through getConfig()', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    process.env.LEGACY_ON_GRACE_EXPIRED = 'reject_all';
    const cfg = new GracePolicyService().getConfig();
    expect(cfg.graceDeadline.toISOString()).toBe(PAST_DEADLINE);
    expect(cfg.onGraceExpired).toBe('reject_all');
    expect(cfg.allowNewPlans).toBe(true);
    expect(cfg.allowInFlightRecovery).toBe(true);
  });

  it('rejects unknown LEGACY_ON_GRACE_EXPIRED values as reject_not_started', () => {
    process.env.LEGACY_GRACE_DEADLINE = PAST_DEADLINE;
    process.env.LEGACY_ON_GRACE_EXPIRED = 'bogus';
    const policy = new GracePolicyService();
    expect(policy.shouldReject('queued')).toBe(true);
    expect(policy.shouldReject('running')).toBe(false);
  });
});
