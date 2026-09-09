import type { BrowserCommand } from '../intent';
import {
  EPHEMERAL_REF_PATTERN,
  SNAPSHOT_ROLE_ALTERNATION,
  isRoleCompatibleWithTool,
} from '../browser-domain.constants';
import type { SessionLike, TemplateStepArtifactLike } from './recorder-template-export.types';

function isEphemeralRuntimeHandle(value: unknown): boolean {
  return typeof value === 'string' && !!value.trim() && EPHEMERAL_REF_PATTERN.test(value.trim());
}

export function resolveTemplateLocatorFromRecordedRef(
  command: BrowserCommand,
  session?: SessionLike
): TemplateStepArtifactLike['locator'] | undefined {
  const ref = extractRecordedRef(command);
  if (!ref || !session?.history?.length) {
    return undefined;
  }

  const executionIndex = typeof command.executionIndex === 'number' ? command.executionIndex : undefined;

  for (const turn of session.history) {
    if (typeof executionIndex === 'number') {
      const turnExecutionIndex = extractTurnExecutionIndex(turn);
      if (turnExecutionIndex !== undefined && turnExecutionIndex > executionIndex) {
        break;
      }
    }
    const results = turn.execution?.results;
    if (!Array.isArray(results)) {
      continue;
    }
    for (const result of results) {
      const content =
        result &&
        typeof result === 'object' &&
        result.data &&
        typeof result.data === 'object' &&
        typeof (result.data as Record<string, unknown>).content === 'string'
          ? ((result.data as Record<string, unknown>).content as string)
          : '';
      if (!content || !content.includes(`[ref=${ref}]`)) {
        continue;
      }
      const locator = parseTemplateLocatorFromSnapshotRef(content, ref);
      if (locator) {
        return locator;
      }
    }
  }

  return undefined;
}

export function extractTurnExecutionIndex(turn: unknown): number | undefined {
  if (typeof turn !== 'object' || turn === null) return undefined;
  const commands = (turn as { commands?: unknown }).commands;
  if (!Array.isArray(commands)) return undefined;
  for (const cmd of commands) {
    if (cmd && typeof cmd === 'object' && typeof (cmd as { executionIndex?: unknown }).executionIndex === 'number') {
      return (cmd as { executionIndex: number }).executionIndex;
    }
  }
  return undefined;
}

export function extractRecordedRef(command: BrowserCommand): string | undefined {
  const target =
    typeof command.params.target === 'string' && isEphemeralRuntimeHandle(command.params.target)
      ? command.params.target.trim()
      : '';
  if (target) {
    return target;
  }
  const locatorValue =
    typeof command.locator?.value === 'string' && isEphemeralRuntimeHandle(command.locator.value)
      ? command.locator.value.trim()
      : '';
  return locatorValue || undefined;
}

export function parseTemplateLocatorFromSnapshotRef(
  snapshotContent: string,
  ref: string
): TemplateStepArtifactLike['locator'] | undefined {
  const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const roleMatch = snapshotContent.match(
    new RegExp(
      `(?:-\\s*)?(${SNAPSHOT_ROLE_ALTERNATION})\\s+"([^"]+)"\\s+\\[ref=${escapedRef}\\]`,
      'i'
    )
  );
  if (roleMatch?.[1] && roleMatch[2]) {
    const role = roleMatch[1].toLowerCase();
    const name = roleMatch[2].trim().replace(/"/g, '\\"');
    return {
      type: 'role',
      value: `${role}[name="${name}"]`,
    };
  }
  return undefined;
}

export function resolveTemplateLocatorFromSnapshotText(
  text: string,
  command: BrowserCommand,
  session?: SessionLike
): TemplateStepArtifactLike['locator'] | undefined {
  if (!text || !session?.history?.length) {
    return undefined;
  }

  const executionIndex =
    typeof command.executionIndex === 'number' ? command.executionIndex : undefined;
  const escapedText = escapeRegex(text);
  const refPattern = new RegExp(
    `(?:-\\s*)?(${SNAPSHOT_ROLE_ALTERNATION})(\\s+"[^"]*")?\\s+\\[ref=(e\\d+)\\].*${escapedText}`,
    'i'
  );
  const exactTextPattern = new RegExp(
    `(?:-\\s*)?(${SNAPSHOT_ROLE_ALTERNATION})\\s+"${escapedText}"\\s+\\[ref=(e\\d+)\\]`,
    'i'
  );

  let exactMatch: { role: string; ref: string; content: string } | undefined;
  let prefixMatch: { role: string; ref: string; content: string } | undefined;

  for (const turn of session.history) {
    if (typeof executionIndex === 'number') {
      const turnExecutionIndex = extractTurnExecutionIndex(turn);
      if (turnExecutionIndex !== undefined && turnExecutionIndex > executionIndex) {
        break;
      }
    }
    const results = turn.execution?.results;
    if (!Array.isArray(results)) continue;

    for (const result of results) {
      const content =
        result && typeof result === 'object' && result.data && typeof result.data === 'object'
          ? (result.data as Record<string, unknown>).content
          : undefined;
      if (typeof content !== 'string' || !content) continue;

      if (!exactMatch) {
        const m = content.match(exactTextPattern);
        if (m?.[1] && m[2]) {
          exactMatch = { role: m[1].toLowerCase(), ref: m[2], content };
        }
      }
      if (!prefixMatch) {
        for (const line of content.split('\n')) {
          const m = line.match(refPattern);
          if (m?.[1] && m[3]) {
            prefixMatch = { role: m[1].toLowerCase(), ref: m[3], content };
            break;
          }
        }
      }
      if (exactMatch) break;
    }
    if (exactMatch) break;
  }

  const match = exactMatch || prefixMatch;
  if (!match) return undefined;

  if (exactMatch && match.role !== 'generic' && match.role !== 'cell' && match.role !== 'row') {
    // Extra guard: if the same text also exists as a `generic` (sidebar/menu) element
    // in the same snapshot, the role-based locator (e.g. link[name="..."]) is
    // unreliable — it refers to an ephemeral tab/header element that only exists
    // after the user has visited that page once.  Prefer a text= locator so that
    // the always-present menu item is used regardless of tab state.
    if (hasCoexistingGenericText(match.content, text)) {
      const ordinal = countTextOccurrences(match.content, text, match.ref);
      return {
        type: 'css',
        value: `:nth-match(text=${text}, ${ordinal})`,
      };
    }

    return {
      type: 'role',
      value: `${match.role}[name="${text.replace(/"/g, '\\"')}"]`,
    };
  }

  const ordinal = countTextOccurrences(match.content, text, match.ref);
  return {
    type: 'css',
    value: `:nth-match(text=${text}, ${ordinal})`,
  };
}

/**
 * Returns true when the snapshot content contains a `generic` element whose
 * text matches `text` in addition to whatever role was matched.
 *
 * This signals that the same label appears both in a structural widget (e.g. a
 * sidebar menu item rendered as `generic`) and in a volatile context (e.g. a
 * browser tab rendered as `link`).  In that case exporting a role-based locator
 * would point at the volatile element and fail on fresh sessions.
 */
export function hasCoexistingGenericText(snapshotContent: string, text: string): boolean {
  const escapedText = escapeRegex(text);
  // Matches lines like: `- generic [ref=eN] [cursor=pointer]: 营业商谈一览`
  const genericPattern = new RegExp(
    `(?:-\\s*)generic\\s+\\[ref=e\\d+\\][^\\n]*:\\s*${escapedText}\\s*$`,
    'im'
  );
  return genericPattern.test(snapshotContent);
}

export function countTextOccurrences(snapshotContent: string, text: string, targetRef: string): number {
  const escapedText = escapeRegex(text);
  const linePattern = new RegExp(
    `\\[ref=(e\\d+)\\][^\\n]*${escapedText}`,
    'i'
  );
  let ordinal = 0;
  const lines = snapshotContent.split('\n');
  for (const line of lines) {
    const m = line.match(linePattern);
    if (!m) continue;
    ordinal++;
    if (m[1] === targetRef) {
      return ordinal;
    }
  }
  return ordinal || 1;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isGrossMarginHint(value: string): boolean {
  return /(gross.?margin|profit.?margin|毛利率|粗利率)/i.test(value);
}
