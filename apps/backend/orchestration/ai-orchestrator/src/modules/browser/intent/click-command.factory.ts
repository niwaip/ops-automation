import type { PendingActionIntent } from './action-intent.builder';
import type { ResolvedActionTarget } from './action-target-resolver.service';

export interface BuiltClickCommand {
  tool: 'click';
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
    exact?: boolean;
    generatedBy?: string;
    confidence?: number;
    matchedCandidateId?: string;
    resolutionMode?: string;
  };
}

export function buildClickCommandFromResolvedTarget(input: {
  intent: PendingActionIntent;
  description: string;
  resolvedTarget: ResolvedActionTarget;
}): BuiltClickCommand | null {
  const locator = input.resolvedTarget.locator;
  if (!locator?.value) {
    return null;
  }

  const params =
    locator.type === 'text' && !input.resolvedTarget.matchedCandidateId
      ? { text: locator.value }
      : locator.type === 'text'
        ? { target: `text="${escapeQuotes(locator.value)}"` }
        : { target: locator.value };

  return {
    tool: 'click',
    params,
    description: input.description,
    locator: {
      strategy: locator.type,
      value: locator.value,
      generatedBy: input.resolvedTarget.matchedCandidateId ? 'candidate-first' : 'fallback',
      confidence: input.resolvedTarget.confidence,
      matchedCandidateId: input.resolvedTarget.matchedCandidateId,
      resolutionMode: input.resolvedTarget.resolutionMode,
    },
  };
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}
