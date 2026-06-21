const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DOMAIN_CODE = 'browser_recorder';
const RULE_SET_KEY = 'default-login-alias';
const RULE_SET_VERSION = 'v1';
const SEEDED_BY = 'browser-semantics-seed';

const defaultRuleSet = {
  key: RULE_SET_KEY,
  name: 'Default Login Alias',
  version: RULE_SET_VERSION,
  description: 'Minimal runtime rule for browser recorder integration verification',
  createdBy: SEEDED_BY,
  rules: [
    {
      type: 'INTENT_ALIAS',
      name: 'login phrase alias',
      enabled: true,
      priority: 100,
      stopOnMatch: true,
      flags: 'i',
      patterns: ['登进系统'],
      outputs: { normalized_input: '点击登录' },
    },
  ],
};

async function ensureDomain() {
  return prisma.semanticRuleDomain.upsert({
    where: { code: DOMAIN_CODE },
    update: {
      enabled: true,
      name: 'Browser Recorder',
      description: 'Default semantic rule domain for browser recorder parsing and normalization',
    },
    create: {
      code: DOMAIN_CODE,
      name: 'Browser Recorder',
      description: 'Default semantic rule domain for browser recorder parsing and normalization',
      enabled: true,
    },
  });
}

async function ensureRuleSet(domainId) {
  const existing = await prisma.semanticRuleSet.findUnique({
    where: {
      domainId_key_version: {
        domainId,
        key: defaultRuleSet.key,
        version: defaultRuleSet.version,
      },
    },
    include: {
      rules: true,
    },
  });

  if (existing) {
    await prisma.semanticRule.deleteMany({
      where: { ruleSetId: existing.id },
    });

    return prisma.semanticRuleSet.update({
      where: { id: existing.id },
      data: {
        name: defaultRuleSet.name,
        description: defaultRuleSet.description,
        rules: {
          create: defaultRuleSet.rules.map((rule) => ({
            type: rule.type,
            name: rule.name,
            enabled: rule.enabled,
            priority: rule.priority,
            stopOnMatch: rule.stopOnMatch ?? false,
            flags: rule.flags,
            patterns: JSON.parse(JSON.stringify(rule.patterns)),
            outputs: JSON.parse(JSON.stringify(rule.outputs)),
          })),
        },
      },
      include: {
        rules: true,
      },
    });
  }

  return prisma.semanticRuleSet.create({
    data: {
      domainId,
      key: defaultRuleSet.key,
      name: defaultRuleSet.name,
      version: defaultRuleSet.version,
      status: 'DRAFT',
      description: defaultRuleSet.description,
      createdBy: defaultRuleSet.createdBy,
      rules: {
        create: defaultRuleSet.rules.map((rule) => ({
          type: rule.type,
          name: rule.name,
          enabled: rule.enabled,
          priority: rule.priority,
          stopOnMatch: rule.stopOnMatch ?? false,
          flags: rule.flags,
          patterns: JSON.parse(JSON.stringify(rule.patterns)),
          outputs: JSON.parse(JSON.stringify(rule.outputs)),
        })),
      },
    },
    include: {
      rules: true,
    },
  });
}

async function archiveOtherDefaultRuleSets(domainId, currentRuleSetId) {
  await prisma.semanticRuleSet.updateMany({
    where: {
      domainId,
      id: { not: currentRuleSetId },
      key: defaultRuleSet.key,
      status: { in: ['ACTIVE', 'CANARY'] },
    },
    data: {
      status: 'ARCHIVED',
      archivedAt: new Date(),
    },
  });
}

async function ensureActiveRuleSet(ruleSet) {
  if (ruleSet.status === 'ACTIVE') {
    return {
      ruleSet,
      releaseCreated: false,
    };
  }

  const updated = await prisma.semanticRuleSet.update({
    where: { id: ruleSet.id },
    data: {
      status: 'ACTIVE',
      activatedAt: new Date(),
      archivedAt: null,
    },
  });

  await prisma.semanticRuleRelease.create({
    data: {
      ruleSetId: ruleSet.id,
      releaseMode: 'MANUAL',
      fromStatus: ruleSet.status,
      toStatus: 'ACTIVE',
      releasedBy: SEEDED_BY,
      releaseNote: 'Seeded default browser recorder runtime rule set',
    },
  });

  return {
    ruleSet: updated,
    releaseCreated: true,
  };
}

async function main() {
  const domain = await ensureDomain();
  const ruleSet = await ensureRuleSet(domain.id);
  await archiveOtherDefaultRuleSets(domain.id, ruleSet.id);
  const activation = await ensureActiveRuleSet(ruleSet);

  console.log(
    JSON.stringify(
      {
        domain_code: domain.code,
        rule_set_id: activation.ruleSet.id,
        key: activation.ruleSet.key,
        version: activation.ruleSet.version,
        status: activation.ruleSet.status,
        release_created: activation.releaseCreated,
        rule_count: defaultRuleSet.rules.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
