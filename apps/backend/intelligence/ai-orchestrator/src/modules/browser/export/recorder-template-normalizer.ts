import type { BrowserCommand, BrowserCommandCandidate } from '../intent';
import type { ObservationLike, TemplateStepArtifactLike } from './recorder-template-export.types';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isGrossMarginHint(value: string): boolean {
  return /(gross.?margin|profit.?margin|毛利率|粗利率)/i.test(value);
}

export function resolvePreferredBranchReadSelector(
  detailObservation: ObservationLike,
  readSelectors: string[] | undefined,
  outputVar?: string,
  branchIntent?: string
): string {
  const candidateSelector = resolveBranchReadSelectorFromCandidates(
    detailObservation.candidates || [],
    [branchIntent, outputVar, ...(readSelectors || [])]
  );
  if (candidateSelector) {
    return candidateSelector;
  }
  return (
    readSelectors?.find((selector) => typeof selector === 'string' && selector.trim().length > 0) ||
    'body'
  );
}

export function resolveBranchReadSelectorFromCandidates(
  candidates: BrowserCommandCandidate[],
  hints: Array<string | undefined>
): string | undefined {
  const normalizedHints = hints.map((value) => normalize(value)).filter(Boolean);
  const scoredCandidates = candidates
    .filter((candidate) => candidate.kind === 'field')
    .map((candidate) => ({
      selector: buildFieldSelector(candidate),
      score: scoreBranchFieldCandidate(candidate, normalizedHints),
    }))
    .filter(
      (entry): entry is { selector: string; score: number } =>
        typeof entry.selector === 'string' && entry.selector.trim().length > 0 && entry.score > 0
    )
    .sort((left, right) => right.score - left.score);

  return scoredCandidates[0]?.selector;
}

export function buildFieldSelector(candidate: BrowserCommandCandidate): string | undefined {
  if (candidate.preferredLocator?.type === 'testid' && candidate.preferredLocator.value.trim()) {
    return `[data-testid="${candidate.preferredLocator.value.trim()}"]`;
  }
  if (candidate.dataTestId?.trim()) {
    return `[data-testid="${candidate.dataTestId.trim()}"]`;
  }
  if (candidate.elementId?.trim()) {
    return `#${candidate.elementId.trim()}`;
  }
  if (candidate.preferredLocator?.type === 'css' && candidate.preferredLocator.value.trim()) {
    return candidate.preferredLocator.value.trim();
  }
  return undefined;
}

export function scoreBranchFieldCandidate(
  candidate: BrowserCommandCandidate,
  hints: string[]
): number {
  const values = [
    candidate.field,
    candidate.label,
    candidate.text,
    candidate.summary,
    candidate.elementId,
    candidate.dataTestId,
    candidate.preferredLocator?.value,
  ].map((value) => normalize(value));
  let score = 0;

  for (const hint of hints) {
    if (!hint) {
      continue;
    }
    if (isGrossMarginHint(hint) && values.some((value) => isGrossMarginHint(value))) {
      score += 220;
      continue;
    }
    if (values.some((value) => value.length > 0 && (value.includes(hint) || hint.includes(value)))) {
      score += 60;
    }
  }

  if (candidate.preferredLocator?.type === 'testid') {
    score += 20;
  } else if (candidate.dataTestId || candidate.elementId) {
    score += 10;
  }

  return score;
}

export function normalizeExportTemplateSteps(
  templateSteps: TemplateStepArtifactLike[]
): TemplateStepArtifactLike[] {
  const normalized: TemplateStepArtifactLike[] = [];
  let setupBuffer: TemplateStepArtifactLike[] = [];

  const flushSetupBuffer = () => {
    if (setupBuffer.length === 0) {
      return;
    }
    normalized.push(...dedupeSetupSteps(setupBuffer));
    setupBuffer = [];
  };

  for (const step of templateSteps) {
    if (step.action === 'navigate' || step.action === 'fill') {
      setupBuffer.push(step);
      continue;
    }
    flushSetupBuffer();
    normalized.push(step);
  }

  flushSetupBuffer();
  return normalized.map((step, index) => ({
    ...step,
    step_id: `step_${index + 1}`,
  }));
}

export function dedupeSetupSteps(steps: TemplateStepArtifactLike[]): TemplateStepArtifactLike[] {
  const navigateStep = [...steps].reverse().find((step) => step.action === 'navigate');
  const dedupedFills = collectDedupedSetupItems(
    steps.filter((step) => step.action === 'fill'),
    (step) => buildSetupStepKey(step)
  );
  return [...(navigateStep ? [navigateStep] : []), ...dedupedFills];
}

export function buildSetupStepKey(step: TemplateStepArtifactLike): string | undefined {
  if (step.action === 'navigate') {
    const url = typeof step.params?.url === 'string' ? step.params.url.trim() : '';
    return url ? `navigate:${url}` : undefined;
  }
  if (step.action === 'fill') {
    const locatorType = typeof step.locator?.type === 'string' ? step.locator.type : '';
    const locatorValue = typeof step.locator?.value === 'string' ? step.locator.value.trim() : '';
    const value = typeof step.params?.value === 'string' ? step.params.value.trim() : '';
    if (!locatorValue || !value) {
      return undefined;
    }
    return `fill:${locatorType}:${locatorValue}:${value}`;
  }
  return undefined;
}

export function dedupeSetupCommands(commands: BrowserCommand[]): BrowserCommand[] {
  const navigateCommand = [...commands].reverse().find((command) => command.tool === 'navigate');
  const dedupedFills = collectDedupedSetupItems(
    commands.filter((command) => command.tool === 'fill'),
    (command) => buildSetupCommandKey(command)
  );
  return [...(navigateCommand ? [navigateCommand] : []), ...dedupedFills];
}

export function buildSetupCommandKey(command: BrowserCommand): string | undefined {
  if (command.tool === 'navigate') {
    const url = typeof command.params.url === 'string' ? command.params.url.trim() : '';
    return url ? `navigate:${url}` : undefined;
  }
  if (command.tool === 'fill') {
    const stableLocatorSignature =
      typeof command.locator?.role === 'string' &&
      command.locator.role.trim() &&
      typeof command.locator?.name === 'string' &&
      command.locator.name.trim()
        ? `role:${command.locator.role.trim()}|name:${command.locator.name.trim()}`
        : [
            typeof command.locator?.strategy === 'string' ? command.locator.strategy : '',
            typeof command.locator?.value === 'string' ? command.locator.value : '',
            typeof command.params.target === 'string' ? command.params.target : '',
            typeof command.params.selector === 'string' ? command.params.selector : '',
          ]
            .map((value) => value.trim())
            .filter(Boolean)
            .join('|');
    const value = typeof command.params.value === 'string' ? command.params.value.trim() : '';
    if (!stableLocatorSignature || !value) {
      return undefined;
    }
    return `fill:${stableLocatorSignature}:${value}`;
  }
  return undefined;
}

export function collectDedupedSetupItems<T>(
  items: T[],
  keyBuilder: (item: T) => string | undefined
): T[] {
  const lastIndexByKey = new Map<string, number>();
  items.forEach((item, index) => {
    const key = keyBuilder(item);
    if (key) {
      lastIndexByKey.set(key, index);
    }
  });
  return items.filter((item, index) => {
    const key = keyBuilder(item);
    if (!key) {
      return true;
    }
    return lastIndexByKey.get(key) === index;
  });
}

