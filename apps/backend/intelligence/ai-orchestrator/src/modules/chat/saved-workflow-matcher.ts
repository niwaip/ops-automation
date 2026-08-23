import {
  canonicalizeIntentWithPolicy,
  createBuiltinRoutingPolicySnapshot,
  extractTerminalActions as extractPolicyTerminalActions,
} from '../planner/routing/routing-policy.matcher';
import type { RoutingPolicySnapshotV1 } from '../planner/routing/routing-policy.types';

export interface SavedWorkflowCandidate {
  id: string;
  name: string;
  version: string;
  status: string;
  stepCount: number;
  aliases?: string[];
  habitIntentKeys?: string[];
}

export interface SavedWorkflowMatch {
  workflow: SavedWorkflowCandidate;
  score: number;
  matchMethod: 'name' | 'alias' | 'habit' | 'lexical';
}

export interface SavedWorkflowRanking {
  ranked: SavedWorkflowMatch[];
  eligibleCount: number;
  ambiguous: boolean;
}

const MATCH_THRESHOLD = 0.82;
const AMBIGUITY_MARGIN = 0.08;
const DEFAULT_ROUTING_POLICY = createBuiltinRoutingPolicySnapshot();

/**
 * User-scoped Level-0 retrieval: deterministic lexical matching only.
 * It spends no model tokens and fails closed when two workflows are close.
 */
export function matchSavedWorkflow(
  request: string,
  candidates: SavedWorkflowCandidate[],
  policy: RoutingPolicySnapshotV1 = DEFAULT_ROUTING_POLICY,
): SavedWorkflowMatch | undefined {
  const result = rankSavedWorkflows(request, candidates, 5, policy);
  const best = result.ranked[0];
  if (!best || best.score < MATCH_THRESHOLD) return undefined;
  if (result.ambiguous) return undefined;
  return best;
}

/**
 * Lightweight Top-K for user-private frozen workflows. It applies hard filters
 * before deterministic lexical ranking and never sends cards or prompts to a model.
 */
export function rankSavedWorkflows(
  request: string,
  candidates: SavedWorkflowCandidate[],
  limit = 5,
  policy: RoutingPolicySnapshotV1 = DEFAULT_ROUTING_POLICY,
): SavedWorkflowRanking {
  const requestKey = canonicalizeIntent(request, policy);
  if (!requestKey) return { ranked: [], eligibleCount: 0, ambiguous: false };
  const requiredTerminalActions = extractPolicyTerminalActions(request, policy);
  const eligible = candidates.filter((candidate) => {
    if (
      candidate.status !== 'active' ||
      candidate.stepCount < 2 ||
      !candidate.id ||
      !candidate.version ||
      !candidate.name
    ) {
      return false;
    }
    const searchable = [
      candidate.name,
      ...(candidate.aliases || []),
      ...(candidate.habitIntentKeys || []),
    ].join(' ');
    const candidateActions = extractPolicyTerminalActions(searchable, policy);
    return requiredTerminalActions.every((action) => candidateActions.includes(action));
  });

  const ranked = eligible
    .map((workflow) => scoreWorkflow(requestKey, workflow, policy))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.workflow.name.localeCompare(right.workflow.name) ||
        left.workflow.id.localeCompare(right.workflow.id),
    )
    .slice(0, Math.max(1, Math.min(limit, 5)));
  const best = ranked[0];
  const second = ranked[1];
  return {
    ranked,
    eligibleCount: eligible.length,
    ambiguous: Boolean(
      best &&
        second &&
        best.score - second.score < AMBIGUITY_MARGIN &&
        !(best.matchMethod === 'name' && best.score === 1 && second.score < 1),
    ),
  };
}

export function canonicalizeIntent(
  value: string,
  policy: RoutingPolicySnapshotV1 = DEFAULT_ROUTING_POLICY,
): string {
  return canonicalizeIntentWithPolicy(value, policy);
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftBigrams = toBigrams(left);
  const rightBigrams = toBigrams(right);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) {
    return left.includes(right) || right.includes(left) ? 0.9 : 0;
  }
  let overlap = 0;
  for (const token of leftBigrams) {
    if (rightBigrams.has(token)) overlap += 1;
  }
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

function scoreWorkflow(
  requestKey: string,
  workflow: SavedWorkflowCandidate,
  policy: RoutingPolicySnapshotV1,
): SavedWorkflowMatch {
  const nameKey = canonicalizeIntent(workflow.name, policy);
  if (requestKey === nameKey) {
    return { workflow, score: 1, matchMethod: 'name' };
  }
  const aliasKeys = (workflow.aliases || [])
    .map((value) => canonicalizeIntent(value, policy))
    .filter(Boolean);
  if (aliasKeys.includes(requestKey)) {
    return { workflow, score: 0.99, matchMethod: 'alias' };
  }
  const habitKeys = (workflow.habitIntentKeys || [])
    .map((value) => canonicalizeIntent(value, policy))
    .filter(Boolean);
  if (habitKeys.includes(requestKey)) {
    return { workflow, score: 0.97, matchMethod: 'habit' };
  }
  const score = Math.max(
    similarity(requestKey, nameKey),
    ...aliasKeys.map((alias) => similarity(requestKey, alias)),
    ...habitKeys.map((key) => similarity(requestKey, key)),
  );
  return { workflow, score, matchMethod: 'lexical' };
}

function toBigrams(value: string): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}
