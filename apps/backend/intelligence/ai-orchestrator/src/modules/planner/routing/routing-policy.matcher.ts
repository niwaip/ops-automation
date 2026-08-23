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

export function containsRoutingAlias(value: string, alias: string): boolean {
  const text = normalizeRoutingText(value);
  const normalizedAlias = normalizeRoutingText(alias).trim();
  if (!text || !normalizedAlias) return false;

  if (/^[a-z0-9_-]+$/.test(normalizedAlias)) {
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
  }
  return text.includes(normalizedAlias);
}

export function hasRoutingSignal(
  value: string,
  group: RoutingSignalGroup,
  policy: RoutingPolicySnapshotV1,
): boolean {
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

function flattenTextValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenTextValues);
  return [];
}

function clonePolicy<T extends Omit<RoutingPolicySnapshotV1, 'digest'>>(policy: T): T {
  return JSON.parse(JSON.stringify(policy)) as T;
}
