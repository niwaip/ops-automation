import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskPolicyRegistryService } from './task-policy-registry.service';

@Injectable()
export class TaskPolicyReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TaskPolicyRegistryService
  ) {}

  async run(policySetId: string, actorUserId: string) {
    const policy = await this.prisma.taskPolicySet.findUnique({
      where: { id: policySetId },
      include: { aliases: true, recipes: true, bindings: true },
    });
    if (!policy) throw new NotFoundException('Task policy not found');

    const definition = this.toDefinition(policy);
    const staticResult = this.registry.validateDefinition(definition as any);
    const cases = this.buildGoldenCases(policy.aliases, policy.recipes);
    const failures = staticResult.valid ? this.evaluateCases(cases, policy.aliases, policy.recipes) : [];
    const passed = staticResult.valid && cases.length > 0 && failures.length === 0;
    const result = {
      schemaVersion: 'task-policy-replay/v1',
      policySetId,
      policyDigest: policy.digest,
      passed,
      gates: {
        static: { passed: staticResult.valid, errors: staticResult.errors },
        golden: {
          passed: failures.length === 0 && cases.length > 0,
          total: cases.length,
          passedCases: cases.length - failures.length,
          passRate: cases.length ? (cases.length - failures.length) / cases.length : 0,
          failures,
        },
        history: { status: 'observed', note: 'Production decisions remain shadow-only evidence.' },
        shadow: { status: policy.status === 'shadow' ? 'active' : 'not_started' },
      },
    };
    await this.prisma.taskPolicyAuditLog.create({
      data: {
        policySetId,
        actorUserId,
        action: passed ? 'policy.replay.passed' : 'policy.replay.failed',
        detailJson: result as any,
      },
    });
    return result;
  }

  async assertPublishable(policySetId: string, digest: string) {
    const latest = await this.prisma.taskPolicyAuditLog.findFirst({
      where: { policySetId, action: 'policy.replay.passed' },
      orderBy: { createdAt: 'desc' },
    });
    if ((latest?.detailJson as any)?.policyDigest !== digest) {
      throw new BadRequestException({
        code: 'TASK_POLICY_REPLAY_REQUIRED',
        message: 'Run a passing replay gate for the current immutable digest before publishing',
      });
    }
  }

  private buildGoldenCases(aliases: any[], recipes: any[]) {
    const aliasesByCommand = new Map<string, string[]>();
    for (const alias of aliases.filter((item) => item.status === 'active')) {
      const values = aliasesByCommand.get(alias.canonicalCommand) || [];
      values.push(alias.alias);
      aliasesByCommand.set(alias.canonicalCommand, values);
    }
    return recipes.flatMap((recipe) => {
      const commands = recipe.requiredCommandsJson as string[];
      const request = commands.map((command) => aliasesByCommand.get(command)?.[0]).filter(Boolean).join('，然后');
      if (!request || commands.length === 0) return [];
      return [{ id: `${recipe.recipeKey}:positive`, request, expectedRecipe: recipe.recipeKey }];
    });
  }

  private evaluateCases(cases: any[], aliases: any[], recipes: any[]) {
    return cases.flatMap((testCase) => {
      const normalized = this.normalize(testCase.request);
      const commands = new Set(
        aliases
          .filter((alias) => this.aliasMatches(normalized, alias))
          .map((alias) => alias.canonicalCommand)
      );
      const matched = recipes
        .filter((recipe) => (recipe.requiredCommandsJson as string[]).every((command) => commands.has(command)))
        .sort((a, b) => b.requiredCommandsJson.length - a.requiredCommandsJson.length)[0];
      return matched?.recipeKey === testCase.expectedRecipe
        ? []
        : [{ id: testCase.id, expected: testCase.expectedRecipe, actual: matched?.recipeKey || null }];
    });
  }

  private aliasMatches(request: string, alias: any) {
    const value = this.normalize(alias.alias);
    if (alias.matchType === 'exact') return request === value;
    if (alias.matchType === 'regex') {
      try { return new RegExp(alias.alias, 'iu').test(request); } catch { return false; }
    }
    return request.includes(value);
  }

  private normalize(value: string) {
    return String(value || '').normalize('NFKC').trim().toLowerCase();
  }

  private toDefinition(policy: any) {
    return {
      aliases: policy.aliases.map((item: any) => ({ canonicalCommand: item.canonicalCommand, alias: item.alias })),
      recipes: policy.recipes.map((item: any) => ({
        recipeKey: item.recipeKey,
        requiredCommands: item.requiredCommandsJson,
        steps: item.stepsJson,
        completionClaims: item.completionClaimsJson,
      })),
      bindings: policy.bindings.map((item: any) => ({ capabilityRole: item.capabilityRole, capabilityId: item.capabilityId })),
    };
  }
}
