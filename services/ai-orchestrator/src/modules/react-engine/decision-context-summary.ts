import { PromptAssemblyMeta, RoutingMeta } from './interfaces';

export interface DecisionContextPromptSummary {
  routingState?: string;
  promptAssemblyState?: string;
}

export function formatRoutingDecisionTrace(routing?: RoutingMeta): string {
  if (!routing) {
    return '';
  }

  const parts: string[] = [];
  if (routing.modelId) {
    parts.push(`model=${routing.modelId}`);
  }
  if (routing.attemptedModelIds && routing.attemptedModelIds.length > 0) {
    parts.push(`attempted=${routing.attemptedModelIds.join('->')}`);
  }
  if (routing.routingReason) {
    parts.push(`reason=${routing.routingReason}`);
  }

  return parts.join(', ');
}

export function formatPromptAssemblyDecisionTrace(promptAssembly?: PromptAssemblyMeta): string {
  if (!promptAssembly) {
    return '';
  }

  const parts: string[] = [];
  if (promptAssembly.systemPromptSectionKeys && promptAssembly.systemPromptSectionKeys.length > 0) {
    parts.push(`systemSections=${promptAssembly.systemPromptSectionKeys.join('>')}`);
  }
  if (promptAssembly.userPromptSectionKeys && promptAssembly.userPromptSectionKeys.length > 0) {
    parts.push(`userSections=${promptAssembly.userPromptSectionKeys.join('>')}`);
  }

  return parts.join(', ');
}

export function buildDecisionContextPromptSummary(input: {
  routing?: RoutingMeta;
  promptAssembly?: PromptAssemblyMeta;
}): DecisionContextPromptSummary | undefined {
  const routingState = formatRoutingDecisionTrace(input.routing) || undefined;
  const promptAssemblyState = formatPromptAssemblyDecisionTrace(input.promptAssembly) || undefined;

  if (!routingState && !promptAssemblyState) {
    return undefined;
  }

  return {
    routingState,
    promptAssemblyState,
  };
}

export function extractLatestDecisionContextFromSummary(
  contextSummary?: string,
): DecisionContextPromptSummary | undefined {
  if (!contextSummary) {
    return undefined;
  }

  const routingMatches = Array.from(
    contextSummary.matchAll(/decision\.routing:\s*([^\n]+)/g),
  );
  const promptAssemblyMatches = Array.from(
    contextSummary.matchAll(/decision\.prompt_assembly:\s*([^\n]+)/g),
  );

  const routingState = routingMatches.at(-1)?.[1]?.trim();
  const promptAssemblyState = promptAssemblyMatches.at(-1)?.[1]?.trim();

  if (!routingState && !promptAssemblyState) {
    return undefined;
  }

  return {
    routingState,
    promptAssemblyState,
  };
}
