import { Injectable } from '@nestjs/common';
import type { MatchedRecipe } from '../topology/deterministic-recipe-matcher.service';
import type {
  EffectiveTaskPolicyRecipe,
  EffectiveTaskPolicySnapshot,
} from './task-policy.types';

const ALLOWED_RECIPE_ROLES = new Set([
  'search',
  'summarize',
  'transform',
  'markdown_writer',
  'document_extract',
  'web_extract',
]);

@Injectable()
export class TaskCommandResolverService {
  matchRecipe(
    userRequest: string,
    policy: EffectiveTaskPolicySnapshot | undefined,
    context?: { hasPreviousResult?: boolean }
  ): MatchedRecipe | null {
    if (!policy || !userRequest?.trim()) return null;
    const commands = this.resolveCommands(userRequest, policy);
    const candidates = policy.recipes
      .filter((recipe) => this.recipeMatches(recipe, commands, context))
      .sort(
        (left, right) =>
          right.requiredCommandsJson.length - left.requiredCommandsJson.length ||
          left.recipeKey.localeCompare(right.recipeKey)
      );
    for (const candidate of candidates) {
      const matched = this.toMatchedRecipe(candidate, userRequest);
      if (matched) return matched;
    }
    return null;
  }

  resolveCommands(userRequest: string, policy: EffectiveTaskPolicySnapshot): Set<string> {
    const normalized = this.normalize(userRequest);
    const commands = new Set<string>();
    for (const alias of [...policy.aliases].sort((a, b) => b.weight - a.weight)) {
      if (this.matchesAlias(normalized, alias.alias, alias.matchType)) {
        commands.add(alias.canonicalCommand);
      }
    }
    return commands;
  }

  private recipeMatches(
    recipe: EffectiveTaskPolicyRecipe,
    commands: Set<string>,
    context?: { hasPreviousResult?: boolean }
  ) {
    if (!recipe.requiredCommandsJson.every((command) => commands.has(command))) return false;
    return recipe.triggerJson?.requiresContext !== true || context?.hasPreviousResult === true;
  }

  private toMatchedRecipe(
    recipe: EffectiveTaskPolicyRecipe,
    objective: string
  ): MatchedRecipe | null {
    const steps: MatchedRecipe['steps'] = [];
    for (const raw of recipe.stepsJson) {
      const ref = typeof raw.ref === 'string' ? raw.ref : '';
      const kind = raw.kind === 'skill' || raw.kind === 'llm_operation' ? raw.kind : null;
      const role = typeof raw.role === 'string' ? raw.role : '';
      if (!ref || !kind || !ALLOWED_RECIPE_ROLES.has(role)) return null;
      steps.push({
        ref,
        kind,
        role: role as MatchedRecipe['steps'][number]['role'],
        dependsOn: Array.isArray(raw.dependsOn)
          ? raw.dependsOn.filter((item): item is string => typeof item === 'string')
          : [],
        ...(role === 'summarize'
          ? { inputShape: recipe.requiredCommandsJson.includes('search') ? 'list' : 'text' }
          : {}),
      });
    }
    if (!steps.length) return null;
    return {
      source: 'policy',
      recipeName: recipe.recipeKey,
      objective,
      steps,
      finalNodeRef: steps[steps.length - 1]!.ref,
      requiresExternalData: steps.some((step) => step.kind === 'skill'),
      completionClaims: recipe.completionClaimsJson,
    };
  }

  private matchesAlias(normalizedRequest: string, alias: string, matchType: string) {
    const normalizedAlias = this.normalize(alias);
    if (!normalizedAlias) return false;
    if (matchType === 'exact') return normalizedRequest === normalizedAlias;
    if (matchType === 'regex') {
      if (alias.length > 120 || /\([^)]*[+*][^)]*\)[+*]/.test(alias)) return false;
      try {
        return new RegExp(alias, 'iu').test(normalizedRequest);
      } catch {
        return false;
      }
    }
    if (matchType === 'semantic') return false;
    return normalizedRequest.includes(normalizedAlias);
  }

  private normalize(value: string) {
    return String(value || '').normalize('NFKC').trim().toLowerCase();
  }
}
