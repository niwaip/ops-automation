import type {
  PendingActionIntent,
  PendingActionRoleHint,
  PendingActionSemanticHint,
} from '../atomic-parsers/action-intent.builder';
import type {
  BrowserCommand,
  BrowserCommandCandidate,
  BrowserCommandContext,
  ParseBrowserCommandResponse,
} from '../browser-command.types';

export type ActionProfileCategoryHint = 'DETAIL_OPEN' | 'ROW_ACTION' | 'MENU_SELECTION';
export type ActionProfileSemanticKey =
  | 'detail'
  | 'approve'
  | 'reject'
  | 'menu'
  | 'edit'
  | 'delete'
  | 'open';

export interface ActionProfileEntry {
  ruleId?: string;
  targetTerms: string[];
  semanticKey?: ActionProfileSemanticKey;
  actionTerms: string[];
  regionTerms: string[];
  roleHints: PendingActionRoleHint[];
  categoryHint?: ActionProfileCategoryHint;
  intentTerms: string[];
  localeHints: string[];
}

export interface ActionProfile {
  intentTerms: string[];
  entries: ActionProfileEntry[];
}

export interface ActionCommandHelpers {
  getActionCandidates: () => BrowserCommandCandidate[];
  resolvePendingClickIntent: (intent: PendingActionIntent, description: string) => BrowserCommand | null;
}

export interface ActionParseResult {
  status: 'success' | 'no_match';
  response?: ParseBrowserCommandResponse;
}

export interface ActionParseContext {
  input: string;
  commandContext: BrowserCommandContext;
  helpers: ActionCommandHelpers;
}

export interface ResolvedActionIntentPayload {
  requestedTarget: string;
  rowIndex?: number;
  regionHint?: string;
  roleHint?: PendingActionRoleHint;
  semanticHint?: PendingActionSemanticHint;
  actionTerm?: string;
  categoryHint?: ActionProfileCategoryHint;
  usedRuntimeProfile: boolean;
  matchedRuntimeRuleIds: string[];
}
