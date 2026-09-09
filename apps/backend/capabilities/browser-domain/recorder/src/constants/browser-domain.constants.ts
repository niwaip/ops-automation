/**
 * Shared constants for the browser recording/export/execution pipeline.
 *
 * All role sets, action sets, regex patterns, and structural constants that
 * were previously duplicated across recorder-snapshot.service.ts,
 * recorder-template-export.service.ts, and related modules are centralised
 * here so that a single change propagates everywhere.
 */

// ---------------------------------------------------------------------------
// Ephemeral runtime ref detection
// Matches Playwright snapshot refs ("e24") and numeric handle format ("12_3").
// ---------------------------------------------------------------------------
export const EPHEMERAL_REF_PATTERN = /^(?:e\d+|\d+_\d+)$/i;

/** Returns true when `value` is a transient, session-scoped element handle. */
export function isEphemeralRef(value: unknown): value is string {
  return typeof value === 'string' && EPHEMERAL_REF_PATTERN.test(value.trim());
}

// ---------------------------------------------------------------------------
// Snapshot node parsing
// Format produced by playwright-cli snapshot: `- button "name" [ref=e24]`
// ---------------------------------------------------------------------------
export const SNAPSHOT_NODE_LINE_PATTERN =
  /^-\s*(?<role>[a-zA-Z][\w-]*)\s+"(?<name>[^"]+)"\s+\[ref=(?<ref>[^\]]+)\]/;

// ---------------------------------------------------------------------------
// Role sets
// ---------------------------------------------------------------------------

/**
 * ARIA roles that accept text input.  These are the targets for fill /
 * type_text actions.
 */
export const INPUT_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'textarea',
  'input',
]);

/**
 * ARIA roles that respond to click / hover / activation.
 */
export const ACTION_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'menuitem',
  'tab',
  'checkbox',
  'radio',
  'option',
  'switch',
]);

/**
 * Roles that represent structural / content nodes (not directly interactive).
 * A click on one of these normally targets a descendant.
 */
export const STRUCTURAL_ROLES: ReadonlySet<string> = new Set([
  'cell',
  'row',
  'generic',
  'listbox',
]);

/**
 * All ARIA roles that are recognised in snapshot text for locator extraction.
 * Used to build the alternation group inside snapshot-parsing regexes.
 */
export const ALL_SNAPSHOT_ROLES: ReadonlyArray<string> = [
  ...INPUT_ROLES,
  ...ACTION_ROLES,
  ...STRUCTURAL_ROLES,
];

/** Pre-built regex alternation string, e.g. "button|link|textbox|…" */
export const SNAPSHOT_ROLE_ALTERNATION = ALL_SNAPSHOT_ROLES.join('|');

// ---------------------------------------------------------------------------
// Role / action compatibility
// ---------------------------------------------------------------------------

/**
 * Returns whether `role` is a valid target for the given browser `tool`.
 *
 * Single authoritative implementation — replaces the independent copies in
 * recorder-template-export.service.ts and recorder-snapshot.service.ts.
 */
export function isRoleCompatibleWithTool(role: string, tool: string): boolean {
  if (INPUT_ROLES.has(role)) return true;
  if (tool === 'fill' || tool === 'type_text') return false; // only input roles
  if (ACTION_ROLES.has(role)) return true;
  if (tool === 'click' || tool === 'hover') return STRUCTURAL_ROLES.has(role);
  return false;
}

// ---------------------------------------------------------------------------
// Selector patterns
// ---------------------------------------------------------------------------

/** Matches `:nth-match(selector, N)` or `:nth-match(selector, ${rowIndex})` */
export const NTH_MATCH_PATTERN =
  /^:nth-match\((.+),\s*(\d+|\$\{rowIndex\})\)$/;

/** Matches `:nth-match(selector, 1)` specifically (loop-start detection) */
export const NTH_MATCH_FIRST_PATTERN = /^:nth-match\((.+),\s*1\)$/;

// ---------------------------------------------------------------------------
// Error message patterns
// ---------------------------------------------------------------------------

/** Playwright strict-mode violation error text */
export const STRICT_MODE_VIOLATION_PATTERN = /strict mode violation/i;

/** Playwright "element not found" error texts */
export const ELEMENT_NOT_FOUND_PATTERN =
  /does not match any elements|No element found|Timeout/i;

/** Combined pattern for any locator resolution failure */
export const LOCATOR_ERROR_PATTERN =
  /does not match any elements|No element found|strict mode violation|Unknown engine|Timeout/i;

// ---------------------------------------------------------------------------
// Action tool names
// ---------------------------------------------------------------------------

/** Browser tool names that require an element target to be resolved. */
export const TARGET_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'click',
  'fill',
  'type_text',
  'hover',
  'press_key',
  'drag',
  'screenshot',
  'snapshot',
]);

/** Tool names that modify element state (and thus need a pre-snapshot). */
export const MUTATION_TOOLS: ReadonlySet<string> = new Set([
  'click',
  'fill',
  'type_text',
  'hover',
  'check',
  'select',
  'drag',
  'press_key',
]);

// ---------------------------------------------------------------------------
// Locator type normalisation
// ---------------------------------------------------------------------------

/**
 * Canonical locator type strings used in TemplateStep.locator.type.
 * Keeps the three spellings of test-id in sync with the template type system.
 */
export type CanonicalLocatorType =
  | 'role'
  | 'text'
  | 'label'
  | 'test-id'
  | 'css'
  | 'xpath'
  | 'ref'
  | 'placeholder';

/**
 * Normalise any known spelling of the test-id locator type to the canonical
 * 'test-id' form.  Accepts 'testId', 'testid', and 'test-id'.
 */
export function normaliseLocatorType(raw: string): CanonicalLocatorType | string {
  if (raw === 'testId' || raw === 'testid') return 'test-id';
  return raw;
}

/**
 * Build the CSS/Playwright selector string from a canonical locator type and
 * value.  Single authoritative implementation — replaces the `buildSelector`
 * in cdp.executor.ts and related ad-hoc mappings.
 */
export function buildSelectorFromLocator(type: string, value: string): string {
  switch (normaliseLocatorType(type)) {
    case 'css':
      return value;
    case 'xpath':
      return value;
    case 'text':
      return `text=${value}`;
    case 'role':
      return `role=${value}`;
    case 'ref':
      return value;
    case 'placeholder':
      return `[placeholder="${value}"]`;
    case 'label':
      return `label:has-text("${value}")`;
    case 'test-id':
      return `[data-testid="${value}"]`;
    default:
      return value;
  }
}
