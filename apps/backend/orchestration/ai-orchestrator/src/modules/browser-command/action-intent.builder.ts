export type PendingActionIntentSource =
  | 'login-parser'
  | 'candidate-parser'
  | 'context-parser'
  | 'pattern-parser'
  | 'ai-parser'
  | 'ai-plan';

export type PendingActionRoleHint = 'button' | 'link' | 'tab' | 'menuitem';

export type PendingActionSemanticHint = 'submit' | 'open' | 'enter' | 'confirm' | 'back';

export type PendingActionIntent = {
  action: 'click';
  rawTarget?: string;
  candidateId?: string;
  regionHint?: string;
  roleHint?: PendingActionRoleHint;
  semanticHint?: PendingActionSemanticHint;
  rowHint?: {
    index?: number;
    key?: string;
    text?: string;
  };
  source: PendingActionIntentSource;
};

export function buildPendingClickIntent(input: {
  source: PendingActionIntentSource;
  rawTarget?: string;
  candidateId?: string;
  regionHint?: string;
  roleHint?: PendingActionRoleHint;
  semanticHint?: PendingActionSemanticHint;
  rowHint?: PendingActionIntent['rowHint'];
}): PendingActionIntent {
  return {
    action: 'click',
    rawTarget: normalizeOptionalText(input.rawTarget),
    candidateId: normalizeOptionalText(input.candidateId),
    regionHint: normalizeOptionalText(input.regionHint),
    roleHint: input.roleHint,
    semanticHint: input.semanticHint,
    rowHint: normalizeRowHint(input.rowHint),
    source: input.source,
  };
}

export function inferSemanticHint(rawTarget?: string): PendingActionSemanticHint | undefined {
  const normalized = normalizeSemanticText(rawTarget);
  if (!normalized) {
    return undefined;
  }

  if (/(submit|next|continue|confirm|ok|done|finish|send|save|apply|login|signin|logon)/.test(normalized)) {
    return 'submit';
  }
  if (/(open|detail|view|inspect|enter)/.test(normalized)) {
    return 'open';
  }
  if (/(confirm|approve|accept|allow|agree)/.test(normalized)) {
    return 'confirm';
  }
  if (/(back|return|close|cancel)/.test(normalized)) {
    return 'back';
  }
  return undefined;
}

export function normalizePendingRoleHint(value: unknown): PendingActionRoleHint | undefined {
  if (value !== 'button' && value !== 'link' && value !== 'tab' && value !== 'menuitem') {
    return undefined;
  }
  return value;
}

export function normalizePendingSemanticHint(
  value: unknown
): PendingActionSemanticHint | undefined {
  if (value !== 'submit' && value !== 'open' && value !== 'enter' && value !== 'confirm' && value !== 'back') {
    return undefined;
  }
  return value;
}

function normalizeOptionalText(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeRowHint(
  value?: PendingActionIntent['rowHint']
): PendingActionIntent['rowHint'] | undefined {
  if (!value) {
    return undefined;
  }

  const rowHint: PendingActionIntent['rowHint'] = {};
  if (typeof value.index === 'number' && Number.isFinite(value.index)) {
    rowHint.index = value.index;
  }
  if (typeof value.key === 'string' && value.key.trim()) {
    rowHint.key = value.key.trim();
  }
  if (typeof value.text === 'string' && value.text.trim()) {
    rowHint.text = value.text.trim();
  }

  return Object.keys(rowHint).length > 0 ? rowHint : undefined;
}

function normalizeSemanticText(value?: string): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/详情|詳細/g, 'detail')
    .replace(/承认する|承認する|承认|承認|批准|审批通过|审批|通过/g, 'approve')
    .replace(/却下する|却下|拒绝|拒否/g, 'reject')
    .replace(/[的"'\s:=|]/g, '');
}
