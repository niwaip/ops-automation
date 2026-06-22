import { SemanticRuleReleaseService } from '../src/modules/release/semantic-rule-release.service';
import { SemanticRuleRuntimeService } from '../src/modules/runtime/semantic-rule-runtime.service';

type RuleRecord = {
  id: string;
  ruleSetId: string;
  enabled: boolean;
  priority: number;
  type: string;
  name: string;
  patterns: string[];
  outputs: Record<string, unknown>;
};

type TargetingRecord = {
  id: string;
  ruleSetId: string;
  enabled: boolean;
  environments: string[] | null;
  hosts: string[] | null;
  tenantIds: string[] | null;
  userIds: string[] | null;
  skillIds: string[] | null;
  pageTypes: string[] | null;
};

type RuleSetRecord = {
  id: string;
  domainId: string;
  key: string;
  name: string;
  version: string;
  status: 'DRAFT' | 'CANARY' | 'ACTIVE' | 'ROLLED_BACK';
  activatedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  rules: RuleRecord[];
  targetings: TargetingRecord[];
};

function createPrismaMock() {
  const domain = {
    id: 'domain-browser-recorder',
    code: 'browser_recorder',
    name: 'Browser Recorder',
  };

  const oldActiveRuleSet: RuleSetRecord = {
    id: 'rule-set-active-old',
    domainId: domain.id,
    key: 'browser-login',
    name: 'Browser Login Old',
    version: '2026.06.21',
    status: 'ACTIVE',
    activatedAt: new Date('2026-06-21T00:00:00.000Z'),
    archivedAt: null,
    updatedAt: new Date('2026-06-21T00:00:00.000Z'),
    rules: [
      {
        id: 'rule-old',
        ruleSetId: 'rule-set-active-old',
        enabled: true,
        priority: 10,
        type: 'INTENT_ALIAS',
        name: 'Old Generic Login',
        patterns: ['登录'],
        outputs: { normalized_input: '登录' },
      },
    ],
    targetings: [],
  };

  const pendingRuleSet: RuleSetRecord = {
    id: 'rule-set-canary-new',
    domainId: domain.id,
    key: 'browser-login',
    name: 'Browser Login New',
    version: '2026.06.22',
    status: 'DRAFT',
    activatedAt: null,
    archivedAt: null,
    updatedAt: new Date('2026-06-22T00:00:00.000Z'),
    rules: [
      {
        id: 'rule-login-profile-new',
        ruleSetId: 'rule-set-canary-new',
        enabled: true,
        priority: 100,
        type: 'LOGIN_PHRASE',
        name: 'New Login Profile',
        patterns: ['工号', '口令'],
        outputs: {
          profile_type: 'login_terms',
          credential_intent_terms: ['工号', '口令'],
          username_terms: ['工号'],
          password_terms: ['口令'],
          submit_intent_terms: ['继续登录'],
          submit_labels: ['继续登录'],
        },
      },
    ],
    targetings: [],
  };

  const releases: Array<Record<string, unknown>> = [];
  const ruleSets = [oldActiveRuleSet, pendingRuleSet];

  const prisma = {
    semanticRuleDomain: {
      findUnique: jest.fn(async ({ where }: { where: { code: string } }) =>
        where.code === domain.code ? domain : null
      ),
    },
    semanticRuleSet: {
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<RuleSetRecord> & { activatedAt?: Date | null };
        }) => {
          const target = ruleSets.find((item) => item.id === where.id);
          if (!target) {
            throw new Error(`Rule set ${where.id} not found`);
          }

          Object.assign(target, data, {
            updatedAt: new Date('2026-06-22T10:00:00.000Z'),
          });
          return target;
        }
      ),
      findMany: jest.fn(
        async ({
          where,
          include,
          orderBy,
        }: {
          where: { domainId: string; status: RuleSetRecord['status'] };
          include?: {
            rules?: { where?: { enabled?: boolean }; orderBy?: { priority: 'desc' | 'asc' } };
            targetings?: { where?: { enabled?: boolean } };
          };
          orderBy?: { activatedAt?: 'desc' | 'asc'; updatedAt?: 'desc' | 'asc' };
        }) => {
          const filtered = ruleSets
            .filter((item) => item.domainId === where.domainId && item.status === where.status)
            .map((item) => ({
              ...item,
              rules: include?.rules?.where?.enabled
                ? item.rules
                    .filter((rule) => rule.enabled)
                    .sort((left, right) => right.priority - left.priority)
                : item.rules,
              targetings: include?.targetings?.where?.enabled
                ? item.targetings.filter((targeting) => targeting.enabled)
                : item.targetings,
            }));

          if (orderBy?.activatedAt === 'desc') {
            filtered.sort(
              (left, right) =>
                (right.activatedAt?.getTime() || 0) - (left.activatedAt?.getTime() || 0)
            );
          } else if (orderBy?.updatedAt === 'desc') {
            filtered.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
          }

          return filtered;
        }
      ),
    },
    semanticRuleRelease: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const release = {
          id: `release-${releases.length + 1}`,
          triggeredAt: new Date('2026-06-22T10:00:00.000Z'),
          ...data,
        };
        releases.push(release);
        return release;
      }),
    },
  };

  return { prisma, releases };
}

describe('SemanticRule release -> runtime resolve', () => {
  it('serves the newly promoted LOGIN profile on the next runtime resolve without restart', async () => {
    const { prisma, releases } = createPrismaMock();
    const releaseService = new SemanticRuleReleaseService(prisma as any);
    const runtimeService = new SemanticRuleRuntimeService(prisma as any);

    const beforePromote = await runtimeService.resolve({
      domain_code: 'browser_recorder',
      environment: 'test',
      host: 'erp.example.com',
      page_type: 'login',
    });

    expect(beforePromote).toEqual({
      rule_set_id: 'rule-set-active-old',
      version: '2026.06.21',
      status: 'ACTIVE',
      rules: [
        expect.objectContaining({
          id: 'rule-old',
        }),
      ],
    });

    await releaseService.promoteToActive('rule-set-canary-new', {
      release_note: 'promote login profile',
    });

    const afterPromote = await runtimeService.resolve({
      domain_code: 'browser_recorder',
      environment: 'test',
      host: 'erp.example.com',
      page_type: 'login',
    });

    expect(afterPromote).toEqual({
      rule_set_id: 'rule-set-canary-new',
      version: '2026.06.22',
      status: 'ACTIVE',
      rules: [
        expect.objectContaining({
          id: 'rule-login-profile-new',
          outputs: expect.objectContaining({
            profile_type: 'login_terms',
            username_terms: ['工号'],
            password_terms: ['口令'],
            submit_labels: ['继续登录'],
          }),
        }),
      ],
    });
    expect(releases).toHaveLength(1);
    expect(releases[0]).toEqual(
      expect.objectContaining({
        ruleSetId: 'rule-set-canary-new',
        fromStatus: 'CANARY',
        toStatus: 'ACTIVE',
      })
    );
  });
});
