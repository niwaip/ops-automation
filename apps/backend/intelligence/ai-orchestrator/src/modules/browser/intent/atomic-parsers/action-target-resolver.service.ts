import type { PendingActionIntent, PendingActionRoleHint } from './action-intent.builder';

export interface ActionResolverCandidateLocator {
  type: 'ref' | 'css' | 'role' | 'text' | 'testid';
  value: string;
}

export interface ActionResolverCandidate {
  candidateId: string;
  kind: 'action' | 'input' | 'field' | 'row' | 'region';
  label: string;
  summary: string;
  ref?: string;
  role?: string;
  elementId?: string;
  dataTestId?: string;
  text?: string;
  action?: string;
  field?: string;
  stableName?: string;
  row?: {
    index?: number;
    key?: string;
    text?: string;
  };
  region?: {
    name?: string;
    type?: string;
  };
  preferredLocator?: ActionResolverCandidateLocator;
}

export interface ActionTargetResolverContext {
  availableCandidates?: ActionResolverCandidate[];
  availableButtons?: string[];
  lastObservationText?: string;
  currentPageUrl?: string;
}

export interface ResolvedActionTarget {
  locator?: {
    type: 'ref' | 'css' | 'role' | 'text';
    value: string;
  };
  matchedCandidateId?: string;
  confidence: number;
  resolutionMode: 'preferred-locator' | 'ref' | 'structured-role' | 'text-fallback';
}

export function resolveActionIntentToLocator(
  intent: PendingActionIntent,
  context: ActionTargetResolverContext
): ResolvedActionTarget | null {
  const candidates = (context.availableCandidates || []).filter(
    (candidate) => candidate.kind === 'action'
  );

  const candidateMatch = resolveFromCandidates(intent, candidates);
  if (candidateMatch) {
    return candidateMatch;
  }

  const fallbackTarget = normalizeOptionalText(intent.rawTarget);
  if (!isClearTextFallback(fallbackTarget)) {
    return null;
  }

  return {
    locator: {
      type: 'text',
      value: fallbackTarget!,
    },
    confidence: 0.4,
    resolutionMode: 'text-fallback',
  };
}

function resolveFromCandidates(
  intent: PendingActionIntent,
  candidates: ActionResolverCandidate[]
): ResolvedActionTarget | null {
  if (candidates.length === 0) {
    return null;
  }

  if (intent.candidateId) {
    const directMatch = candidates.find(
      (candidate) => candidate.candidateId === intent.candidateId
    );
    const resolved = directMatch ? buildCandidateLocatorTarget(directMatch, 0.98) : null;
    if (resolved) {
      return resolved;
    }
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, intent, candidates.length),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best) {
    return null;
  }

  const nextScore = scored[1]?.score || 0;
  const minScore = intent.semanticHint === 'submit' ? 85 : 90;
  if (best.score < minScore) {
    return null;
  }
  if (scored.length > 1 && best.score - nextScore < 12) {
    const nextCandidate = scored[1]?.candidate;
    if (nextCandidate && canPreferStableCandidate(best.candidate, nextCandidate)) {
      return buildCandidateLocatorTarget(best.candidate, scoreToConfidence(best.score));
    }
    return null;
  }

  return buildCandidateLocatorTarget(best.candidate, scoreToConfidence(best.score));
}

function buildCandidateLocatorTarget(
  candidate: ActionResolverCandidate,
  confidence: number
): ResolvedActionTarget | null {
  const preferredLocator = normalizePreferredLocator(candidate.preferredLocator);
  if (preferredLocator) {
    return {
      locator: preferredLocator,
      matchedCandidateId: candidate.candidateId,
      confidence,
      resolutionMode: 'preferred-locator',
    };
  }

  if (candidate.ref) {
    return {
      locator: {
        type: 'ref',
        value: candidate.ref,
      },
      matchedCandidateId: candidate.candidateId,
      confidence,
      resolutionMode: 'ref',
    };
  }

  const pageText = normalizeOptionalText(candidate.text) || normalizeOptionalText(candidate.label);
  const normalizedRole = candidate.role === 'a' ? 'link' : candidate.role;

  const validAriaRoles = new Set([
    'button',
    'checkbox',
    'combobox',
    'dialog',
    'gridcell',
    'heading',
    'img',
    'link',
    'listbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
  ]);

  if (normalizedRole && validAriaRoles.has(normalizedRole) && pageText) {
    return {
      locator: {
        type: 'role',
        value: `${normalizedRole}[name="${escapeQuotes(pageText)}"]`,
      },
      matchedCandidateId: candidate.candidateId,
      confidence,
      resolutionMode: 'structured-role',
    };
  }

  if (pageText) {
    return {
      locator: {
        type: 'text',
        value: pageText,
      },
      matchedCandidateId: candidate.candidateId,
      confidence: Math.max(0.5, confidence - 0.1),
      resolutionMode: 'text-fallback',
    };
  }

  return null;
}

function normalizePreferredLocator(
  locator?: ActionResolverCandidateLocator
): ResolvedActionTarget['locator'] | undefined {
  if (!locator?.value) {
    return undefined;
  }

  if (locator.type === 'testid') {
    return {
      type: 'css',
      value: `[data-testid="${escapeQuotes(locator.value)}"]`,
    };
  }

  if (
    locator.type === 'ref' ||
    locator.type === 'css' ||
    locator.type === 'role' ||
    locator.type === 'text'
  ) {
    return {
      type: locator.type,
      value: locator.value,
    };
  }

  return undefined;
}

function scoreCandidate(
  candidate: ActionResolverCandidate,
  intent: PendingActionIntent,
  candidateCount: number
): number {
  let score = 0;
  let textScore = 0;

  const rawTarget = normalizeText(intent.rawTarget);
  const regionHint = normalizeText(intent.regionHint);
  const rowKey = normalizeText(intent.rowHint?.key);
  const rowText = normalizeText(intent.rowHint?.text);
  const role = normalizeText(candidate.role);
  const tokens = getCandidateTokens(candidate);

  if (intent.rowHint?.index) {
    if (candidate.row?.index === intent.rowHint.index) {
      score += 85;
    } else {
      score -= 70;
    }
  }

  if (rowKey) {
    const candidateRowKey = normalizeText(candidate.row?.key);
    if (candidateRowKey === rowKey) {
      score += 70;
    } else if (candidateRowKey) {
      score -= 35;
    }
  }

  if (rowText) {
    const candidateRowText = normalizeText(candidate.row?.text);
    if (candidateRowText.includes(rowText) || rowText.includes(candidateRowText)) {
      score += 45;
    }
  }

  if (regionHint) {
    const candidateRegion = normalizeText(candidate.region?.name);
    if (candidateRegion === regionHint) {
      score += 55;
    } else if (
      candidateRegion &&
      (candidateRegion.includes(regionHint) || regionHint.includes(candidateRegion))
    ) {
      score += 30;
    } else if (candidateRegion) {
      score -= 25;
    }
  }

  for (const token of tokens) {
    if (!rawTarget || !token) {
      continue;
    }
    if (token === rawTarget) {
      textScore = Math.max(textScore, 145);
    } else if (token.includes(rawTarget)) {
      textScore = Math.max(textScore, 120);
    } else if (rawTarget.includes(token) && token.length >= 3) {
      textScore = Math.max(textScore, 98);
    }
  }

  score += textScore;

  if (candidate.preferredLocator) {
    score += 18;
  }
  if (candidate.ref) {
    score += 12;
  }
  if (candidate.kind === 'action') {
    score += 10;
  }
  if (role === 'button') {
    score += 12;
  } else if (role === 'link') {
    score += 4;
  }

  if (intent.roleHint) {
    score += scoreRoleHint(role, intent.roleHint);
  }

  if (intent.semanticHint === 'submit') {
    score += 18;
    if (role === 'button') {
      score += 24;
    }
    if (hasSubmitSignals(candidate)) {
      score += 22;
    }
    if (candidateCount === 1) {
      score += 24;
    }
  }

  if (intent.semanticHint === 'confirm' && hasConfirmSignals(candidate)) {
    score += 26;
  }

  return score;
}

function getCandidateTokens(candidate: ActionResolverCandidate): string[] {
  return [
    candidate.action,
    candidate.stableName,
    candidate.label,
    candidate.text,
    candidate.region?.name,
    candidate.row?.key,
    candidate.row?.text,
    candidate.summary,
    candidate.role,
  ]
    .map((value) => normalizeText(value))
    .filter((value): value is string => Boolean(value));
}

function hasSubmitSignals(candidate: ActionResolverCandidate): boolean {
  const combined = [
    candidate.action,
    candidate.stableName,
    candidate.label,
    candidate.text,
    candidate.summary,
  ]
    .map((value) => normalizeText(value))
    .join(' ');

  return /(submit|next|continue|confirm|save|apply|login|signin|logon|enter)/.test(combined);
}

function hasConfirmSignals(candidate: ActionResolverCandidate): boolean {
  const combined = [
    candidate.action,
    candidate.stableName,
    candidate.label,
    candidate.text,
    candidate.summary,
  ]
    .map((value) => normalizeText(value))
    .join(' ');

  return /(confirm|approve|accept|allow|agree)/.test(combined);
}

function scoreRoleHint(candidateRole: string, roleHint: PendingActionRoleHint): number {
  if (!candidateRole) {
    return 0;
  }
  return candidateRole === roleHint ? 18 : -12;
}

function scoreToConfidence(score: number): number {
  if (score >= 145) {
    return 0.98;
  }
  if (score >= 120) {
    return 0.95;
  }
  if (score >= 100) {
    return 0.9;
  }
  return 0.85;
}

function isClearTextFallback(value?: string): boolean {
  if (!value) {
    return false;
  }

  const words = value.trim().split(/\s+/).filter(Boolean);
  return value.length <= 40 && words.length <= 6;
}

function normalizeText(value?: string): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/没有承认的数据|没有承認的数据|未承认数据|未承認数据/g, 'pending')
    .replace(/没有承认|没有承認|未承认|未承認|待处理|待審批|待审批|保留中|pending/g, 'pending')
    .replace(/详情|詳細/g, 'detail')
    .replace(/承认する|承認する|承认|承認|approve/g, 'approve')
    .replace(/批准|审批通过|审批|通过/g, 'approve')
    .replace(/却下する|却下|拒绝|拒否|reject/g, 'reject')
    .replace(/打开|进入|点击|单击|选择/g, '')
    .replace(/按钮|按键|链接|入口|字段|输入框|文本框|区域|面板|模块|区块|部分/g, '')
    .replace(/[的"'\s:=|]/g, '')
    .trim();
}

function normalizeOptionalText(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

function canPreferStableCandidate(
  bestCandidate: ActionResolverCandidate,
  nextCandidate: ActionResolverCandidate
): boolean {
  if (!hasStableLocator(bestCandidate) || hasStableLocator(nextCandidate)) {
    return false;
  }

  const bestText = getComparableCandidateText(bestCandidate);
  const nextText = getComparableCandidateText(nextCandidate);
  if (!bestText || !nextText || bestText !== nextText) {
    return false;
  }

  return true;
}

function hasStableLocator(candidate: ActionResolverCandidate): boolean {
  return Boolean(candidate.preferredLocator?.value || candidate.ref);
}

function getComparableCandidateText(candidate: ActionResolverCandidate): string {
  return normalizeText(candidate.text || candidate.label);
}
