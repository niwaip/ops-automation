import { PlanRouteClassifierService } from './plan-route-classifier.service';
import { extractTerminalActions } from './routing-policy.matcher';
import { RoutingPolicyService } from './routing-policy.service';

describe('RoutingPolicyService', () => {
  const originalInlinePolicy = process.env.ROUTING_POLICY_JSON;
  const originalPolicyFile = process.env.ROUTING_POLICY_FILE;

  afterEach(() => {
    if (originalInlinePolicy === undefined) delete process.env.ROUTING_POLICY_JSON;
    else process.env.ROUTING_POLICY_JSON = originalInlinePolicy;
    if (originalPolicyFile === undefined) delete process.env.ROUTING_POLICY_FILE;
    else process.env.ROUTING_POLICY_FILE = originalPolicyFile;
  });

  it('loads an additive, versioned policy without replacing baseline guards', () => {
    process.env.ROUTING_POLICY_JSON = JSON.stringify({
      schemaVersion: 'routing-policy-patch/v1',
      version: 'admin-approved-7',
      additions: {
        signals: {
          processing: ['飞书推送'],
          uncoveredAction: ['飞书推送'],
        },
        terminalActions: {
          feishu: ['飞书推送'],
        },
      },
    });

    const service = new RoutingPolicyService();
    const snapshot = service.getSnapshot();
    expect(snapshot.version).toBe('admin-approved-7');
    expect(snapshot.source).toBe('environment');
    expect(snapshot.signals.processing).toEqual(
      expect.arrayContaining(['总结', 'bark', '飞书推送'])
    );
    expect(extractTerminalActions('最后飞书推送', snapshot)).toEqual(['feishu']);
    expect(new PlanRouteClassifierService(service).classifyRoute('飞书推送')).toBe(
      'deterministic_plan'
    );
  });

  it('rejects unknown groups and keeps the audited baseline', () => {
    process.env.ROUTING_POLICY_JSON = JSON.stringify({
      schemaVersion: 'routing-policy-patch/v1',
      version: 'bad-policy',
      additions: { signals: { typoGroup: ['anything'] } },
    });

    const snapshot = new RoutingPolicyService().getSnapshot();
    expect(snapshot.source).toBe('builtin');
    expect(snapshot.version).toBe('builtin-2026-08-25');
  });
});
