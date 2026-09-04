import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateTaskPolicyDraftDto,
  CreateTaskPolicyProposalDto,
} from './task-policy.dto';

const POLICY_INCLUDE = {
  aliases: { where: { status: 'active' } },
  recipes: { where: { status: 'active' } },
  bindings: { where: { status: 'active' }, orderBy: { priority: 'asc' as const } },
};

@Injectable()
export class TaskPolicyRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePolicy(input: { userId: string; organizationId?: string }) {
    const scopes = [
      { scopeType: 'platform', scopeId: 'platform' },
      ...(input.organizationId
        ? [{ scopeType: 'organization', scopeId: input.organizationId }]
        : []),
      { scopeType: 'user', scopeId: input.userId },
    ];
    const snapshots = await this.prisma.taskPolicySet.findMany({
      where: { status: 'active', OR: scopes },
      include: POLICY_INCLUDE,
    });
    snapshots.sort(
      (left, right) => this.scopePriority(left.scopeType) - this.scopePriority(right.scopeType)
    );
    return this.mergeSnapshots(snapshots);
  }

  async listPolicies() {
    return this.prisma.taskPolicySet.findMany({
      include: {
        _count: { select: { aliases: true, recipes: true, bindings: true, proposals: true } },
      },
      orderBy: [{ scopeType: 'asc' }, { scopeId: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getPolicy(id: string) {
    const policy = await this.prisma.taskPolicySet.findUnique({
      where: { id },
      include: { ...POLICY_INCLUDE, auditLogs: { orderBy: { createdAt: 'desc' } } },
    });
    if (!policy) throw new NotFoundException('Task policy not found');
    return policy;
  }

  async createDraft(input: CreateTaskPolicyDraftDto, actorUserId: string) {
    this.assertScope(input.scopeType, input.scopeId);
    const validation = this.validateDefinition(input);
    if (!validation.valid) {
      throw new BadRequestException({ code: 'TASK_POLICY_INVALID', errors: validation.errors });
    }
    const digest = this.digest({
      policy: input.policy,
      aliases: input.aliases,
      recipes: input.recipes,
      bindings: input.bindings,
    });
    return this.prisma.taskPolicySet.create({
      data: {
        name: input.name,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        status: 'draft',
        version: input.version,
        schemaVersion: 'task-policy/v1',
        policyJson: input.policy as any,
        digest,
        createdBy: actorUserId,
        aliases: {
          create: input.aliases.map((alias) => ({
            canonicalCommand: alias.canonicalCommand,
            alias: alias.alias.trim(),
            matchType: alias.matchType || 'phrase',
            weight: alias.weight ?? 1,
            source: 'admin',
            status: 'active',
          })),
        },
        recipes: {
          create: input.recipes.map((recipe) => ({
            recipeKey: recipe.recipeKey,
            version: recipe.version,
            name: recipe.name,
            requiredCommandsJson: recipe.requiredCommands,
            optionalCommandsJson: recipe.optionalCommands || [],
            triggerJson: recipe.trigger as any,
            stepsJson: recipe.steps as any,
            bindingsJson: (recipe.bindings || []) as any,
            completionClaimsJson: recipe.completionClaims,
            riskLevel: recipe.riskLevel || 'L0',
            status: 'active',
          })),
        },
        bindings: {
          create: input.bindings.map((binding) => ({
            capabilityRole: binding.capabilityRole,
            capabilityId: binding.capabilityId,
            capabilityVersion: binding.capabilityVersion,
            priority: binding.priority ?? 100,
            inputMappingJson: (binding.inputMapping || {}) as any,
            outputMappingJson: (binding.outputMapping || {}) as any,
            status: 'active',
          })),
        },
        auditLogs: {
          create: { actorUserId, action: 'draft.created', detailJson: { digest } },
        },
      },
      include: POLICY_INCLUDE,
    });
  }

  validateDefinition(input: Pick<CreateTaskPolicyDraftDto, 'aliases' | 'recipes' | 'bindings'>) {
    const errors: string[] = [];
    const commands = new Set(input.aliases.map((item) => item.canonicalCommand));
    const roles = new Set(input.bindings.map((item) => item.capabilityRole));
    const recipeKeys = new Set<string>();
    for (const recipe of input.recipes) {
      if (recipeKeys.has(recipe.recipeKey)) errors.push(`Duplicate recipe '${recipe.recipeKey}'`);
      recipeKeys.add(recipe.recipeKey);
      if (!recipe.steps.length) errors.push(`Recipe '${recipe.recipeKey}' has no steps`);
      if (!recipe.completionClaims.length) {
        errors.push(`Recipe '${recipe.recipeKey}' has no completion claims`);
      }
      for (const command of recipe.requiredCommands) {
        if (!commands.has(command)) {
          errors.push(`Recipe '${recipe.recipeKey}' references unknown command '${command}'`);
        }
      }
      const refs = new Set<string>();
      for (const rawStep of recipe.steps) {
        const step = rawStep as Record<string, unknown>;
        const ref = typeof step.ref === 'string' ? step.ref : '';
        if (!ref) errors.push(`Recipe '${recipe.recipeKey}' contains a step without ref`);
        if (refs.has(ref)) errors.push(`Recipe '${recipe.recipeKey}' duplicates step ref '${ref}'`);
        refs.add(ref);
        const role = typeof step.role === 'string' ? step.role : '';
        const kind = step.kind;
        if (role && kind === 'skill' && !roles.has(role)) {
          errors.push(`Recipe '${recipe.recipeKey}' has unresolved role '${role}'`);
        }
      }
      for (const rawStep of recipe.steps) {
        const step = rawStep as Record<string, unknown>;
        for (const dependency of Array.isArray(step.dependsOn) ? step.dependsOn : []) {
          if (!refs.has(String(dependency))) {
            errors.push(`Recipe '${recipe.recipeKey}' depends on unknown step '${dependency}'`);
          }
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(id: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.taskPolicySet.findUnique({ where: { id }, include: POLICY_INCLUDE });
      if (!policy) throw new NotFoundException('Task policy not found');
      if (!['draft', 'shadow'].includes(policy.status)) {
        throw new BadRequestException(`Policy status '${policy.status}' cannot be published`);
      }
      const validation = this.validateStoredPolicy(policy);
      if (!validation.valid) {
        throw new BadRequestException({ code: 'TASK_POLICY_INVALID', errors: validation.errors });
      }
      await tx.taskPolicySet.updateMany({
        where: {
          scopeType: policy.scopeType,
          scopeId: policy.scopeId,
          status: 'active',
          id: { not: policy.id },
        },
        data: { status: 'retired' },
      });
      const published = await tx.taskPolicySet.update({
        where: { id },
        data: { status: 'active', publishedAt: new Date() },
        include: POLICY_INCLUDE,
      });
      await tx.taskPolicyAuditLog.create({
        data: {
          policySetId: id,
          actorUserId,
          action: 'policy.published',
          detailJson: { version: policy.version, digest: policy.digest },
        },
      });
      return published;
    });
  }

  async createProposal(input: CreateTaskPolicyProposalDto) {
    return this.prisma.taskPolicyProposal.create({
      data: {
        proposalType: input.proposalType,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        patchJson: input.patch as any,
        evidenceJson: input.evidence as any,
        confidence: input.confidence,
        status: 'candidate',
        proposedBy: 'llm',
      },
    });
  }

  listProposals() {
    return this.prisma.taskPolicyProposal.findMany({ orderBy: { createdAt: 'desc' } });
  }

  reviewProposal(id: string, status: 'shadow' | 'rejected', reviewerId: string) {
    return this.prisma.taskPolicyProposal.update({
      where: { id },
      data: { status, reviewedBy: reviewerId, reviewedAt: new Date() },
    });
  }

  private mergeSnapshots(snapshots: any[]) {
    const aliasMap = new Map<string, any>();
    const recipeMap = new Map<string, any>();
    const bindingMap = new Map<string, any[]>();
    for (const snapshot of snapshots) {
      for (const alias of snapshot.aliases) {
        aliasMap.set(`${alias.canonicalCommand}:${alias.alias}`, alias);
      }
      for (const recipe of snapshot.recipes) recipeMap.set(recipe.recipeKey, recipe);
      for (const binding of snapshot.bindings) {
        const values = bindingMap.get(binding.capabilityRole) || [];
        values.push(binding);
        bindingMap.set(binding.capabilityRole, values);
      }
    }
    const value = {
      schemaVersion: 'effective-task-policy/v1',
      sourcePolicies: snapshots.map((item) => ({
        id: item.id,
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        version: item.version,
        digest: item.digest,
      })),
      aliases: [...aliasMap.values()],
      recipes: [...recipeMap.values()],
      bindings: [...bindingMap.entries()].flatMap(([, values]) => values),
    };
    return { ...value, digest: this.digest(value) };
  }

  private validateStoredPolicy(policy: any) {
    return this.validateDefinition({
      aliases: policy.aliases.map((item: any) => ({
        canonicalCommand: item.canonicalCommand,
        alias: item.alias,
      })),
      recipes: policy.recipes.map((item: any) => ({
        recipeKey: item.recipeKey,
        version: item.version,
        name: item.name,
        requiredCommands: item.requiredCommandsJson,
        optionalCommands: item.optionalCommandsJson,
        trigger: item.triggerJson,
        steps: item.stepsJson,
        bindings: item.bindingsJson,
        completionClaims: item.completionClaimsJson,
      })),
      bindings: policy.bindings.map((item: any) => ({
        capabilityRole: item.capabilityRole,
        capabilityId: item.capabilityId,
      })),
    } as any);
  }

  private assertScope(scopeType: string, scopeId: string) {
    if (scopeType === 'platform' && scopeId !== 'platform') {
      throw new BadRequestException("Platform policy scopeId must be 'platform'");
    }
  }

  private scopePriority(scopeType: string) {
    return { platform: 0, organization: 1, department: 2, user: 3 }[scopeType] ?? 0;
  }

  private digest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(this.sortValue(value))).digest('hex');
  }

  private sortValue(value: any): any {
    if (Array.isArray(value)) return value.map((item) => this.sortValue(item));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, this.sortValue(value[key])])
    );
  }
}
