import type { BrowserCommand } from '../intent';
import {
  EPHEMERAL_REF_PATTERN,
  SNAPSHOT_ROLE_ALTERNATION,
  isRoleCompatibleWithTool,
} from '../browser-domain.constants';
import type { SessionLike, TemplateStepArtifactLike } from './recorder-template-export.types';

export function isEphemeralRuntimeHandle(value: unknown): boolean {
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

export function inferTemplateLocatorType(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('xpath=')) {
    return 'xpath';
  }
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('.') ||
    trimmed.startsWith('[') ||
    /^[a-z][a-z0-9_-]*(\b|[#.[:>])/i.test(trimmed) ||
    trimmed.includes('>') ||
    trimmed.includes(':')
  ) {
    return 'css';
  }
  return 'text';
}

export function mapTemplateLocatorType(strategy: string): string | undefined {
  switch (strategy) {
    case 'css':
    case 'role':
    case 'text':
    case 'label':
    case 'placeholder':
    case 'testid':
      return strategy === 'testid' ? 'test-id' : strategy;
    default:
      return undefined;
  }
}

export function isButtonLikeDescription(description?: string): boolean {
  const normalized = typeof description === 'string' ? description.trim() : '';
  if (!normalized) {
    return false;
  }
  return /(按钮|button)/i.test(normalized);
}

export function withGroundingMetadata(
  locator: TemplateStepArtifactLike['locator'] | undefined,
  sourceLocator: BrowserCommand['locator'] | undefined
): TemplateStepArtifactLike['locator'] | undefined {
  if (!locator || !sourceLocator) {
    return locator;
  }
  const groundingFields: Pick<
    NonNullable<TemplateStepArtifactLike['locator']>,
    'ref' | 'role' | 'name' | 'contextLabel' | 'regionId'
  > = {};
  if (typeof sourceLocator.ref === 'string' && sourceLocator.ref.trim()) {
    groundingFields.ref = sourceLocator.ref.trim();
  }
  if (typeof sourceLocator.role === 'string' && sourceLocator.role.trim()) {
    groundingFields.role = sourceLocator.role.trim();
  }
  if (typeof sourceLocator.name === 'string' && sourceLocator.name.trim()) {
    groundingFields.name = sourceLocator.name.trim();
  }
  if (typeof sourceLocator.contextLabel === 'string' && sourceLocator.contextLabel.trim()) {
    groundingFields.contextLabel = sourceLocator.contextLabel.trim();
  }
  if (typeof sourceLocator.regionId === 'string' && sourceLocator.regionId.trim()) {
    groundingFields.regionId = sourceLocator.regionId.trim();
  }
  if (Object.keys(groundingFields).length === 0) {
    return locator;
  }
  return {
    ...locator,
    ...groundingFields,
  };
}

export function buildTemplateLocatorFromLabel(
  label: string | undefined,
  description?: string,
  action?: string
): TemplateStepArtifactLike['locator'] | undefined {
  const normalizedLabel = typeof label === 'string' ? label.trim() : '';
  if (!normalizedLabel) {
    return undefined;
  }

  // If label is actually a CSS selector (#..., .class, [attr=...]) or XPath, preserve it as CSS/XPath!
  const inferred = inferTemplateLocatorType(normalizedLabel);
  if (inferred === 'css' || normalizedLabel.startsWith('/')) {
    return {
      type: inferred,
      value: normalizedLabel,
    };
  }

  if (isButtonLikeDescription(description)) {
    const escapedName = normalizedLabel.replace(/"/g, '\\"');
    return {
      type: 'role',
      value: `button[name="${escapedName}"]`,
    };
  }

  // Fill actions target input elements: prefer label= strategy so the runtime
  // uses Playwright's getByLabel() semantics instead of getByText() which would
  // match visible text nodes (e.g. the <label> element itself) rather than the
  // associated <input>.
  if (action === 'fill' || action === 'type_text') {
    return {
      type: 'label',
      value: normalizedLabel,
    };
  }

  return {
    type: 'text',
    value: normalizedLabel,
  };
}

export function toTemplateLocatorFromDescription(
  description: string | undefined
): TemplateStepArtifactLike['locator'] | undefined {
  if (!description?.trim()) {
    return undefined;
  }

  const normalized = description.trim();
  const quotedLabelMatch = normalized.match(/点击[「“"']([^」”"']{1,48})[」”"']/);
  if (quotedLabelMatch?.[1]) {
    return buildTemplateLocatorFromLabel(quotedLabelMatch[1].trim(), normalized);
  }

  const buttonLabelMatch = normalized.match(/点击\s*([^,，。\n]{1,48}?)\s*(?:按钮|button)/i);
  if (buttonLabelMatch?.[1]) {
    const buttonLabel = buttonLabelMatch[1].trim();
    if (!/^(这|该|此|对应|下|上|右|左)$/.test(buttonLabel)) {
      return buildTemplateLocatorFromLabel(buttonLabel, normalized);
    }
  }

  return undefined;
}

export function toTemplateLocatorFromTarget(
  target: unknown
): TemplateStepArtifactLike['locator'] | undefined {
  if (typeof target !== 'string' || !target.trim()) {
    return undefined;
  }

  const trimmed = target.trim();

  // role[name="..."] format → role locator
  const roleMatch = trimmed.match(/^([a-zA-Z_][\w-]*)\[name=(["'])(.+)\2\]$/);
  if (roleMatch?.[1] && roleMatch[3]) {
    return {
      type: 'role',
      value: `${roleMatch[1]}[name="${roleMatch[3]}"]`,
    };
  }

  // Skip ephemeral runtime handles (e.g. "e24", "12_3") — they are session-scoped
  // and cannot be used as stable locators in a template.
  if (isEphemeralRuntimeHandle(trimmed)) {
    return undefined;
  }

  // Explicit Playwright-style prefixes: role=, text=, xpath=, label=
  if (/^(role|text|xpath|label)=/i.test(trimmed)) {
    const eqIndex = trimmed.indexOf('=');
    const locatorType = trimmed.slice(0, eqIndex).toLowerCase();
    const locatorValue = trimmed.slice(eqIndex + 1);
    return { type: locatorType, value: locatorValue };
  }

  // CSS-style selectors: start with #, ., [, // (xpath), or contain > or :has
  if (
    /^(#|\.|\[|\/\/)/.test(trimmed) ||
    trimmed.includes('>>') ||
    trimmed.includes(':has') ||
    trimmed.includes('[data-testid=')
  ) {
    return { type: inferTemplateLocatorType(trimmed), value: trimmed };
  }

  return undefined;
}

export function toTemplateLocatorFromExpression(
  locator: BrowserCommand['locator'] | undefined,
  tool?: string
): TemplateStepArtifactLike['locator'] | undefined {
  const expression = typeof locator?.expression === 'string' ? locator.expression.trim() : '';
  if (!expression) {
    return undefined;
  }

  const roleMatch = expression.match(
    /^getByRole\(\s*['"]([^'"]+)['"],\s*\{\s*name:\s*['"]([^'"]+)['"]/
  );
  if (roleMatch?.[1] && roleMatch[2]) {
    const role = roleMatch[1].trim();
    if (tool && !isRoleCompatibleWithTool(role, tool)) {
      return undefined;
    }
    const name = roleMatch[2].trim().replace(/"/g, '\\"');
    return { type: 'role', value: `${role}[name="${name}"]` };
  }

  const textMatch = expression.match(/^getByText\(\s*['"]([^'"]+)['"]/);
  if (textMatch?.[1]) {
    return { type: 'text', value: textMatch[1].trim() };
  }

  const labelMatch = expression.match(/^getByLabel\(\s*['"]([^'"]+)['"]/);
  if (labelMatch?.[1]) {
    return { type: 'label', value: labelMatch[1].trim() };
  }

  const placeholderMatch = expression.match(/^getByPlaceholder\(\s*['"]([^'"]+)['"]/);
  if (placeholderMatch?.[1]) {
    return { type: 'placeholder', value: placeholderMatch[1].trim() };
  }

  const testIdMatch = expression.match(/^getByTestId\(\s*['"]([^'"]+)['"]/);
  if (testIdMatch?.[1]) {
    return { type: 'test-id', value: testIdMatch[1].trim() };
  }

  const locatorMatch = expression.match(/^locator\(\s*(['"])([\s\S]*?)\1\s*\)$/);
  if (locatorMatch?.[2]) {
    return {
      type: inferTemplateLocatorType(locatorMatch[2]),
      value: locatorMatch[2].trim(),
    };
  }

  return undefined;
}

export function toTemplateLocatorFromRuntimeLocator(
  locator: NonNullable<BrowserCommand['locator']>
): TemplateStepArtifactLike['locator'] | undefined {
  const strategy = typeof locator.strategy === 'string' ? locator.strategy : '';
  const value = typeof locator.value === 'string' ? locator.value : '';
  const type = mapTemplateLocatorType(strategy);
  if (!type) {
    return undefined;
  }

  const groundingFields: Pick<
    NonNullable<TemplateStepArtifactLike['locator']>,
    'ref' | 'role' | 'name' | 'contextLabel' | 'regionId'
  > = {};
  if (typeof locator.ref === 'string' && locator.ref.trim()) {
    groundingFields.ref = locator.ref.trim();
  }
  if (typeof locator.role === 'string' && locator.role.trim()) {
    groundingFields.role = locator.role.trim();
  }
  if (typeof locator.name === 'string' && locator.name.trim()) {
    groundingFields.name = locator.name.trim();
  }
  if (typeof locator.contextLabel === 'string' && locator.contextLabel.trim()) {
    groundingFields.contextLabel = locator.contextLabel.trim();
  }
  if (typeof locator.regionId === 'string' && locator.regionId.trim()) {
    groundingFields.regionId = locator.regionId.trim();
  }

  if (
    strategy === 'role' &&
    typeof locator.role === 'string' &&
    locator.role.trim() &&
    typeof locator.name === 'string' &&
    locator.name.trim()
  ) {
    const escapedName = locator.name.trim().replace(/"/g, '\\"');
    return {
      type,
      value: `${locator.role.trim()}[name="${escapedName}"]`,
      ...groundingFields,
    };
  }

  if (!value.trim()) {
    return undefined;
  }

  return {
    type,
    value,
    ...groundingFields,
  };
}

export function buildTemplateStepLocator(
  command: BrowserCommand,
  session?: SessionLike
): TemplateStepArtifactLike['locator'] | undefined {
  const targetLocator = toTemplateLocatorFromTarget(command.params.target);
  if (targetLocator) {
    return withGroundingMetadata(targetLocator, command.locator);
  }

  if (
    typeof command.locator?.role === 'string' &&
    command.locator.role.trim() &&
    typeof command.locator?.name === 'string' &&
    command.locator.name.trim() &&
    isRoleCompatibleWithTool(command.locator.role.trim(), command.tool)
  ) {
    const escapedName = command.locator.name.trim().replace(/"/g, '\\"');
    return withGroundingMetadata(
      { type: 'role', value: `${command.locator.role.trim()}[name="${escapedName}"]` },
      command.locator
    );
  }

  const expressionLocator = toTemplateLocatorFromExpression(command.locator, command.tool);
  if (expressionLocator) {
    if (expressionLocator.type !== 'text') {
      return withGroundingMetadata(expressionLocator, command.locator);
    }

    const ref = extractRecordedRef(command);
    if (ref && session?.history?.length) {
      const snapshotResolved = resolveTemplateLocatorFromSnapshotText(
        expressionLocator.value,
        command,
        session
      );
      if (snapshotResolved) {
        return withGroundingMetadata(snapshotResolved, command.locator);
      }
    }

    return withGroundingMetadata(expressionLocator, command.locator);
  }

  const resolvedRefLocator = resolveTemplateLocatorFromRecordedRef(command, session);
  if (resolvedRefLocator) {
    return withGroundingMetadata(resolvedRefLocator, command.locator);
  }

  if (
    command.locator?.strategy &&
    command.locator.value &&
    isRoleCompatibleWithTool(command.locator.strategy, command.tool)
  ) {
    const runtimeLocator = toTemplateLocatorFromRuntimeLocator(command.locator);
    if (runtimeLocator) {
      return runtimeLocator;
    }
  }

  if (typeof command.params.selector === 'string' && command.params.selector.trim()) {
    const selectorValue = command.params.selector.trim();
    if (isEphemeralRuntimeHandle(selectorValue)) {
      const fromDescription = toTemplateLocatorFromDescription(command.description);
      return withGroundingMetadata(fromDescription, command.locator);
    }

    const inferredType = inferTemplateLocatorType(selectorValue);
    // Preserving CSS/XPath selectors: never convert CSS selectors (#..., .class, [attr=...]) into label
    if (inferredType === 'css' || selectorValue.startsWith('/')) {
      return withGroundingMetadata(
        {
          type: inferredType,
          value: selectorValue,
        },
        command.locator
      );
    }

    if (command.tool === 'fill' || command.tool === 'type_text') {
      const fromLabel = buildTemplateLocatorFromLabel(
        selectorValue,
        command.description,
        command.tool
      );
      if (fromLabel) {
        return withGroundingMetadata(fromLabel, command.locator);
      }
    }
    return withGroundingMetadata(
      {
        type: inferredType,
        value: selectorValue,
      },
      command.locator
    );
  }

  if (typeof command.params.text === 'string' && command.params.text.trim()) {
    if (isEphemeralRuntimeHandle(command.params.text)) {
      const fromDescription = toTemplateLocatorFromDescription(command.description);
      return withGroundingMetadata(fromDescription, command.locator);
    }

    const fromSnapshotText = resolveTemplateLocatorFromSnapshotText(
      command.params.text.trim(),
      command,
      session
    );
    if (fromSnapshotText) {
      if (
        command.tool === 'click' &&
        fromSnapshotText.type === 'text' &&
        typeof fromSnapshotText.value === 'string' &&
        fromSnapshotText.value.trim()
      ) {
        const normalizedText = fromSnapshotText.value.trim();
        const escaped = normalizedText.replace(/"/g, '\\"');
        const isButton = isButtonLikeDescription(command.description);
        const role = isButton ? 'button' : 'link';
        const upgraded: TemplateStepArtifactLike['locator'] = {
          type: 'role',
          value: `${role}[name="${escaped}"]`,
        };
        return withGroundingMetadata(upgraded, command.locator);
      }
      return withGroundingMetadata(fromSnapshotText, command.locator);
    }

    const fromLabel = buildTemplateLocatorFromLabel(
      command.params.text,
      command.description,
      command.tool
    );
    return withGroundingMetadata(fromLabel, command.locator);
  }

  const descriptionLocator = toTemplateLocatorFromDescription(command.description);
  if (descriptionLocator) {
    return withGroundingMetadata(descriptionLocator, command.locator);
  }

  return undefined;
}
