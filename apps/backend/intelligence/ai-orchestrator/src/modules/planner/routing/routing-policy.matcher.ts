import { createHash } from 'crypto';
import { BUILTIN_ROUTING_POLICY } from './routing-policy.defaults';
import type {
  RoutingCapabilityRole,
  RoutingPolicySnapshotV1,
  RoutingSignalGroup,
} from './routing-policy.types';

function stablePolicyValue(
  policy: Omit<RoutingPolicySnapshotV1, 'digest'>,
): Record<string, unknown> {
  return {
    schemaVersion: policy.schemaVersion,
    version: policy.version,
    signals: policy.signals,
    terminalActions: policy.terminalActions,
    capabilityRoles: policy.capabilityRoles,
    intentNormalization: policy.intentNormalization,
  };
}

export function calculateRoutingPolicyDigest(
  policy: Omit<RoutingPolicySnapshotV1, 'digest'>,
): string {
  return createHash('sha256')
    .update(JSON.stringify(stablePolicyValue(policy)))
    .digest('hex');
}

export function createBuiltinRoutingPolicySnapshot(): RoutingPolicySnapshotV1 {
  const policy = clonePolicy(BUILTIN_ROUTING_POLICY);
  return { ...policy, digest: calculateRoutingPolicyDigest(policy) };
}

export function normalizeRoutingText(value: string): string {
  return String(value || '').normalize('NFKC').toLowerCase();
}

export function isOccurrenceNegated(text: string, matchIndex: number): boolean {
  const prefix = text.slice(Math.max(0, matchIndex - 14), matchIndex);
  return (
    /(?:不要|切勿|不用|无需|禁止|别|请勿|不得|严禁|不)[^，,。；;！!？?\s]{0,6}\s*$/i.test(prefix) ||
    /(?:do\s+not|don't|no|never|without)\s+[^,.;!?\s]{0,10}\s*$/i.test(prefix)
  );
}

export function containsRoutingAlias(value: string, alias: string): boolean {
  const text = normalizeRoutingText(value);
  const normalizedAlias = normalizeRoutingText(alias).trim();
  if (!text || !normalizedAlias) return false;

  const isWordBoundary = /^[a-z0-9_-]+$/.test(normalizedAlias);
  let startIndex = 0;

  while (startIndex < text.length) {
    const idx = text.indexOf(normalizedAlias, startIndex);
    if (idx === -1) break;

    if (isWordBoundary) {
      const charBefore = idx > 0 ? text.charAt(idx - 1) : ' ';
      const charAfter =
        idx + normalizedAlias.length < text.length ? text.charAt(idx + normalizedAlias.length) : ' ';
      if (/[a-z0-9]/.test(charBefore) || /[a-z0-9]/.test(charAfter)) {
        startIndex = idx + 1;
        continue;
      }
    }

    if (!isOccurrenceNegated(text, idx)) {
      return true;
    }

    startIndex = idx + normalizedAlias.length;
  }

  return false;
}

export function hasRoutingSignal(
  value: string,
  group: RoutingSignalGroup,
  policy: RoutingPolicySnapshotV1,
): boolean {
  if (group === 'webSource' && /(?:https?:\/\/|www\.)[^\s]+/i.test(value)) {
    return true;
  }
  return policy.signals[group].some((alias) => containsRoutingAlias(value, alias));
}

export function extractTerminalActions(
  value: string,
  policy: RoutingPolicySnapshotV1,
): string[] {
  const actions = Object.entries(policy.terminalActions)
    .filter(([, aliases]) => aliases.some((alias) => containsRoutingAlias(value, alias)))
    .map(([action]) => action);
  return actions.sort();
}

export function matchesCapabilityRole(
  candidateTexts: unknown[],
  role: RoutingCapabilityRole,
  policy: RoutingPolicySnapshotV1,
): boolean {
  const texts = candidateTexts.flatMap(flattenTextValues);
  return policy.capabilityRoles[role].some((alias) =>
    texts.some((value) => containsRoutingAlias(value, alias)),
  );
}

export function canonicalizeIntentWithPolicy(
  value: string,
  policy: RoutingPolicySnapshotV1,
): string {
  let normalized = normalizeRoutingText(value);
  for (const equivalence of policy.intentNormalization.equivalences) {
    for (const alias of [...equivalence.aliases].sort((a, b) => b.length - a.length)) {
      normalized = normalized.split(normalizeRoutingText(alias)).join(equivalence.canonical);
    }
  }
  for (const stopWord of [...policy.intentNormalization.stopWords].sort(
    (a, b) => b.length - a.length,
  )) {
    normalized = normalized.split(normalizeRoutingText(stopWord)).join('');
  }
  return normalized.replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Strips appended system context sections (e.g. uploaded file metadata, previews, etc.)
 * from the request string to expose only the user's pure intent/utterance.
 */
export function stripSystemContext(value: string): string {
  if (!value) return '';
  const idx = value.indexOf('[系统上下文：');
  if (idx !== -1) {
    const userPart = value.substring(0, idx).trim();
    if (userPart) return userPart;
    return value.replace(/\[系统上下文：[^\]]*\]/g, '').trim();
  }
  return value.trim();
}

function flattenTextValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenTextValues);
  return [];
}

function clonePolicy<T extends Omit<RoutingPolicySnapshotV1, 'digest'>>(policy: T): T {
  return JSON.parse(JSON.stringify(policy)) as T;
}
