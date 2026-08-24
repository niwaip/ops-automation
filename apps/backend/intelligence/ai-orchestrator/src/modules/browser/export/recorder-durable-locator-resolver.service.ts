import { Injectable } from '@nestjs/common';
import type { BrowserCommand } from '../intent';
import { SNAPSHOT_NODE_LINE_PATTERN, EPHEMERAL_REF_PATTERN } from '../browser-domain.constants';

type BrowserCommandLike = Pick<BrowserCommand, 'tool' | 'params' | 'description' | 'locator'>;

export interface ResolvedDurableLocator {
  strategy: 'role' | 'text' | 'css' | 'testid' | 'label' | 'placeholder';
  value: string;
  role?: string;
  name?: string;
  expression?: string;
  resolvedFrom: 'cli-snapshot' | 'grounding-chosen-target' | 'description-heuristic';
  ref?: string;
}

export interface DurableLocatorResolutionContext {
  history?: Array<{
    execution?: {
      results?: Array<Record<string, unknown>>;
    };
  }>;
}

interface GroundedTargetLike {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  locator?: {
    strategy?: string;
    value?: string;
  };
}

// Re-exported from browser-domain.constants for local use.
const SNAPSHOT_NODE_PATTERN = SNAPSHOT_NODE_LINE_PATTERN;
const REF_PATTERN = EPHEMERAL_REF_PATTERN;

@Injectable()
export class RecorderDurableLocatorResolver {
  /**
   * Resolve the durable locator of a recorded command that currently routes to
   * a transient cli snapshot ref (`strategy:'ref'`, value like `eNN`).
   *
   * Resolution order:
   *  1. cli snapshot content captured during recording
   *     (`history[].execution.results[].data.content` lines such as
   *     `- button "登录" [ref=e28]`) — the single authoritative source for
   *     what a cli ref pointed at during recording.
   *  2. grounding chosenTarget carried by the command locator
   *     (`command.locator.role/name` injected upstream). Used only when its
   *     role/name is consistent with the command's intent signals.
   *  3. Description heuristic: extract a quoted label or "点击 X 按钮" from
   *     `command.description` and emit a `getByText`/`getByRole('button')`
   *     locator. Always weaker than (1) and (2) but keeps export usable when
   *     cli snapshot did not capture the node.
   *
   * Returns undefined when no durable locator can be derived; the caller is
   * expected to surface the unresolved ref as an export warning rather than
   * emit `page.locator("eNN")` which silently fails on a fresh page.
   */
  resolve(
    command: BrowserCommandLike,
    context: DurableLocatorResolutionContext,
    groundingTarget?: GroundedTargetLike
  ): ResolvedDurableLocator | undefined {
    if (this.isExistingLocatorDurable(command)) {
      return undefined;
    }

    const ref = this.extractRef(command);
    if (!ref) {
      return undefined;
    }

    const fromCliSnapshot = this.resolveFromCliSnapshot(ref, context);
    if (fromCliSnapshot) {
      return fromCliSnapshot;
    }

    const fromGrounding = this.resolveFromGroundingTarget(ref, groundingTarget, command);
    if (fromGrounding) {
      return fromGrounding;
    }

    return this.resolveFromDescription(command, ref);
  }

  private isExistingLocatorDurable(command: BrowserCommandLike): boolean {
    const strategy = command.locator?.strategy;
    if (typeof strategy !== 'string' || !strategy.trim()) {
      return false;
    }
    const durable = new Set(['css', 'role', 'text', 'testid', 'label', 'placeholder']);
    return durable.has(strategy.trim());
  }

  private extractRef(command: BrowserCommandLike): string | undefined {
    const targetValue =
      typeof command.params?.target === 'string' ? command.params.target.trim() : '';
    if (REF_PATTERN.test(targetValue)) {
      return targetValue;
    }
    const locatorValue =
      typeof command.locator?.value === 'string' ? command.locator.value.trim() : '';
    if (REF_PATTERN.test(locatorValue)) {
      return locatorValue;
    }
    return undefined;
  }

  private resolveFromCliSnapshot(
    ref: string,
    context: DurableLocatorResolutionContext
  ): ResolvedDurableLocator | undefined {
    const matches = this.collectCliSnapshotNodesForRef(ref, context);
    if (matches.length === 0) {
      return undefined;
    }
    const node = matches.pop();
    if (!node || !node.role || !node.name) {
      return undefined;
    }
    const escapedName = node.name.replace(/"/g, '\\"');
    return {
      strategy: 'role',
      value: `${node.role}[name="${escapedName}"]`,
      role: node.role,
      name: node.name,
      expression: `getByRole(${JSON.stringify(node.role)}, { name: ${JSON.stringify(node.name)} })`,
      resolvedFrom: 'cli-snapshot',
      ref,
    };
  }

  private resolveFromGroundingTarget(
    ref: string,
    target: GroundedTargetLike | undefined,
    command: BrowserCommandLike
  ): ResolvedDurableLocator | undefined {
    if (!target?.role || !(target.name || target.text)) {
      return undefined;
    }
    if (!this.isGroundingConsistentWithIntent(target, command)) {
      return undefined;
    }
    const accessibleName = (target.name || target.text || '').trim();
    const escapedName = accessibleName.replace(/"/g, '\\"');
    return {
      strategy: 'role',
      value: `${target.role}[name="${escapedName}"]`,
      role: target.role,
      name: accessibleName,
      expression: `getByRole(${JSON.stringify(target.role)}, { name: ${JSON.stringify(accessibleName)} })`,
      resolvedFrom: 'grounding-chosen-target',
      ref,
    };
  }

  private resolveFromDescription(
    command: BrowserCommandLike,
    ref: string
  ): ResolvedDurableLocator | undefined {
    const description =
      typeof command.description === 'string' && command.description.trim()
        ? command.description.trim()
        : '';
    if (!description) {
      return undefined;
    }
    const quoted = description.match(/[「"'『』“](.*?)[」"'‘“’”]/);
    if (quoted?.[1]?.trim()) {
      const label = quoted[1].trim();
      return this.buildDescriptionHeuristic(command, label, ref);
    }
    const buttonHint = description.match(/点击\s*(.+?)\s*按钮/);
    if (buttonHint?.[1]?.trim()) {
      return this.buildDescriptionHeuristic(
        { ...command, tool: 'click' } as BrowserCommandLike,
        buttonHint[1].trim(),
        ref
      );
    }
    const fillLabel = description.match(/填写\s*(.+)/);
    if (fillLabel?.[1]?.trim()) {
      return this.buildDescriptionHeuristic(
        { ...command, tool: 'fill' } as BrowserCommandLike,
        fillLabel[1].trim(),
        ref
      );
    }
    return undefined;
  }

  private buildDescriptionHeuristic(
    command: BrowserCommandLike,
    label: string,
    ref: string
  ): ResolvedDurableLocator | undefined {
    if (!label) {
      return undefined;
    }
    if (command.tool === 'click' || /(按钮|button)/i.test(command.description || '')) {
      const escapedName = label.replace(/"/g, '\\"');
      return {
        strategy: 'role',
        value: `button[name="${escapedName}"]`,
        role: 'button',
        name: label,
        expression: `getByRole("button", { name: ${JSON.stringify(label)} })`,
        resolvedFrom: 'description-heuristic',
        ref,
      };
    }
    if (command.tool === 'fill') {
      return {
        strategy: 'label',
        value: label,
        resolvedFrom: 'description-heuristic',
        ref,
      };
    }
    return {
      strategy: 'text',
      value: label,
      resolvedFrom: 'description-heuristic',
      ref,
    };
  }

  private collectCliSnapshotNodesForRef(
    ref: string,
    context: DurableLocatorResolutionContext
  ): Array<{ role: string; name: string; ref: string }> {
    if (!context.history?.length) {
      return [];
    }
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const refPattern = new RegExp(`\\[ref=${escapedRef}\\]`);
    const matches: Array<{ role: string; name: string; ref: string }> = [];
    for (const turn of context.history) {
      const results = turn.execution?.results;
      if (!Array.isArray(results)) {
        continue;
      }
      for (const result of results) {
        const content = this.extractContentFromResult(result);
        if (!content || !refPattern.test(content)) {
          continue;
        }
        for (const line of content.split(/\r?\n/)) {
          const match = line.trim().match(SNAPSHOT_NODE_PATTERN);
          if (match?.groups?.role && match.groups.name && match.groups.ref === ref) {
            matches.push({
              role: match.groups.role.toLowerCase(),
              name: match.groups.name.trim(),
              ref: match.groups.ref,
            });
          }
        }
      }
    }
    return matches;
  }

  private extractContentFromResult(result: Record<string, unknown> | undefined): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }
    const data = (result as { data?: unknown }).data;
    if (data && typeof data === 'object') {
      const dataRecord = data as Record<string, unknown>;
      if (typeof dataRecord.content === 'string') {
        return dataRecord.content;
      }
      if (typeof dataRecord.html === 'string') {
        return dataRecord.html;
      }
    }
    if (typeof (result as { stdout?: unknown }).stdout === 'string') {
      return (result as { stdout: string }).stdout;
    }
    if (typeof (result as { message?: unknown }).message === 'string') {
      return (result as { message: string }).message;
    }
    return undefined;
  }

  private isGroundingConsistentWithIntent(
    target: GroundedTargetLike,
    command: BrowserCommandLike
  ): boolean {
    const intentLabels: string[] = [];
    const push = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        intentLabels.push(value.trim());
      }
    };
    push(command.params?.text);
    if (typeof command.description === 'string') {
      const quoted = command.description.match(/[「"'『』“](.*?)[」"'‘”’]/);
      push(quoted?.[1]);
      const buttonHint = command.description.match(/点击\s*(.+?)\s*按钮/);
      push(buttonHint?.[1]);
    }
    if (intentLabels.length === 0) {
      return true;
    }
    const nodeNormalized = [target.name, target.text]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase())
      .join(' ');
    return intentLabels.some((label) => {
      const normalized = label.trim().toLowerCase();
      return (
        normalized.length > 0 &&
        (nodeNormalized.includes(normalized) || normalized.includes(nodeNormalized))
      );
    });
  }
}
