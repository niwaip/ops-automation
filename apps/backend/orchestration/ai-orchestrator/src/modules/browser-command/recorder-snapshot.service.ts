import { Injectable } from '@nestjs/common';
import { BrowserCommand } from './browser-command.service';

export interface SnapshotNode {
  ref: string;
  role: string;
  name?: string;
  text?: string;
  line: string;
  indent: number;
  contextLabel?: string;
}

export interface SnapshotResolutionState {
  path?: string;
  nodes: SnapshotNode[];
}

@Injectable()
export class RecorderSnapshotService {
  rewriteCommandWithSnapshotRefs(
    command: BrowserCommand,
    snapshotState: SnapshotResolutionState | null
  ): BrowserCommand {
    if (!snapshotState?.nodes.length || !this.requiresSnapshotBeforeAction(command)) {
      return command;
    }

    const targetCandidate = this.extractCommandTargetCandidate(command);
    if (!targetCandidate || /^e\d+$/i.test(targetCandidate)) {
      return command;
    }

    const resolvedNode =
      command.tool === 'fill'
        ? this.resolveSnapshotNodeForFill(targetCandidate, snapshotState.nodes)
        : this.resolveSnapshotNodeForAction(targetCandidate, snapshotState.nodes);

    if (!resolvedNode) {
      return command;
    }

    return {
      ...command,
      params: {
        ...command.params,
        target: this.buildSnapshotNodeTarget(resolvedNode),
      },
    };
  }

  parseSnapshotNodes(content: string): SnapshotNode[] {
    const nodes = content
      .split('\n')
      .map((rawLine) => rawLine.trimEnd())
      .map((rawLine) => {
        const refMatch = rawLine.match(/\[ref=([^\]\s]+)\]/i) || rawLine.match(/uid=([^\s]+)/i);
        if (!refMatch?.[1]) {
          return null;
        }

        const nodeMatch =
          rawLine.match(/^\s*-\s*([a-z-]+)(?:\s+"([^"]+)")?.*?(?::\s*(.+))?$/i) ||
          rawLine.match(
            /^\s*uid=[^\s]+\s+([a-z-]+)(?:\s+"([^"]+)")?(?:\s+url="[^"]*")?(?:\s+(.*))?$/i
          );
        if (!nodeMatch?.[1]) {
          return null;
        }

        const indentMatch = rawLine.match(/^(\s*)-/);
        const indent = indentMatch?.[1]?.length || 0;

        return {
          ref: refMatch[1],
          role: nodeMatch[1].toLowerCase(),
          ...(nodeMatch[2] ? { name: nodeMatch[2].trim() } : {}),
          ...(nodeMatch[3] ? { text: nodeMatch[3].trim() } : {}),
          line: rawLine.trim(),
          indent,
        } satisfies SnapshotNode;
      })
      .filter((item): item is SnapshotNode => Boolean(item));

    return this.attachSnapshotContextLabels(nodes);
  }

  buildObservationFromSnapshotState(snapshotState: SnapshotResolutionState): {
    inputs: Array<Record<string, unknown>>;
    buttons: Array<Record<string, unknown>>;
    headings: string[];
    links: string[];
    snapshotPath?: string;
  } {
    const inputs = snapshotState.nodes
      .filter((node) =>
        ['textbox', 'searchbox', 'combobox', 'textarea', 'input'].includes(node.role)
      )
      .map((node, index) => ({
        index,
        ref: node.ref,
        role: node.role,
        label: node.contextLabel || node.name,
        text: node.text,
      }));

    const buttons = snapshotState.nodes
      .filter((node) =>
        ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(node.role)
      )
      .map((node, index) => ({
        index,
        ref: node.ref,
        text: node.name || node.text || node.line,
        role: node.role,
      }));

    const headings = snapshotState.nodes
      .filter(
        (node) =>
          node.role === 'heading' && typeof node.name === 'string' && node.name.trim().length > 0
      )
      .map((node) => node.name!.trim());

    const links = snapshotState.nodes
      .filter((node) => node.role === 'link')
      .map((node) => node.name || node.text || node.line)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());

    return {
      inputs,
      buttons,
      headings: this.mergeObservedStrings(headings),
      links: this.mergeObservedStrings(links),
      ...(snapshotState.path ? { snapshotPath: snapshotState.path } : {}),
    };
  }

  private requiresSnapshotBeforeAction(command: BrowserCommand): boolean {
    return ['click', 'fill', 'hover', 'press_key', 'type_text', 'get_text'].includes(command.tool);
  }

  private extractCommandTargetCandidate(command: BrowserCommand): string | undefined {
    const params = command.params || {};
    const candidates = [
      params.target,
      params.selector,
      params.text,
      params.key,
      command.description,
    ];
    let fallbackCandidate: string | undefined;
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        const normalized = candidate.trim();
        if (!fallbackCandidate) {
          fallbackCandidate = normalized;
        }
        if (!this.isLowSignalTargetCandidate(normalized, command.tool)) {
          return normalized;
        }
      }
    }
    return fallbackCandidate;
  }

  private resolveSnapshotNodeForFill(
    target: string,
    nodes: SnapshotNode[]
  ): SnapshotNode | undefined {
    const inputNodes = nodes.filter((node) =>
      ['textbox', 'searchbox', 'combobox', 'textarea', 'input'].includes(node.role)
    );
    return this.pickBestSnapshotNode(target, inputNodes);
  }

  private resolveSnapshotNodeForAction(
    target: string,
    nodes: SnapshotNode[]
  ): SnapshotNode | undefined {
    const preferredNodes = nodes.filter((node) =>
      ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(node.role)
    );
    return this.pickBestSnapshotNode(target, preferredNodes);
  }

  private buildSnapshotNodeTarget(node: SnapshotNode): string {
    return node.ref;
  }

  private pickBestSnapshotNode(target: string, nodes: SnapshotNode[]): SnapshotNode | undefined {
    const normalizedTarget = this.normalizeSnapshotText(target);
    if (!normalizedTarget) {
      return undefined;
    }

    const scored = nodes
      .map((node) => ({ node, score: this.scoreSnapshotNode(node, normalizedTarget) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scored[0]?.node;
  }

  private scoreSnapshotNode(node: SnapshotNode, normalizedTarget: string): number {
    const candidates = [node.name, node.text, node.contextLabel, node.line]
      .map((item) => this.normalizeSnapshotText(item))
      .filter((item): item is string => Boolean(item));
    const targetVariants = this.expandSnapshotTargetVariants(normalizedTarget);
    const aliasTargetVariants = targetVariants
      .map((variant) => this.normalizeSnapshotAliasText(variant))
      .filter((variant): variant is string => Boolean(variant));

    let score = 0;
    for (const variant of targetVariants) {
      for (const candidate of candidates) {
        if (candidate === variant) {
          score = Math.max(score, 120);
        } else if (candidate.includes(variant)) {
          score = Math.max(score, 95);
        } else if (variant.includes(candidate)) {
          const genericShortFallback =
            candidate.length < variant.length && this.isGenericSnapshotFallbackCandidate(candidate);
          if (!genericShortFallback) {
            score = Math.max(score, 70);
          }
        }
      }
    }

    for (const aliasVariant of aliasTargetVariants) {
      for (const candidate of candidates) {
        const aliasCandidate = this.normalizeSnapshotAliasText(candidate);
        if (!aliasCandidate) {
          continue;
        }
        if (aliasCandidate === aliasVariant) {
          score = Math.max(score, 115);
        } else if (aliasCandidate.includes(aliasVariant) || aliasVariant.includes(aliasCandidate)) {
          score = Math.max(score, 90);
        }
      }
    }

    const asciiTokens = this.extractAsciiTokens(normalizedTarget);
    if (asciiTokens.length > 0) {
      for (const token of asciiTokens) {
        if (candidates.some((candidate) => candidate.includes(token))) {
          score += 35;
        } else if (score > 0) {
          score = Math.min(score, 55);
        }
      }
    }

    if (normalizedTarget.includes('用户名') || normalizedTarget.includes('账号')) {
      if (
        candidates.some(
          (candidate) =>
            candidate.includes('用户名') || candidate.includes('账号') || candidate.includes('user')
        )
      ) {
        score += 25;
      }
    }

    if (normalizedTarget.includes('密码')) {
      if (
        candidates.some(
          (candidate) =>
            candidate.includes('密码') ||
            candidate.includes('password') ||
            candidate.includes('pass')
        )
      ) {
        score += 25;
      }
    }

    if (
      node.role === 'button' &&
      candidates.some((candidate) => candidate.includes(normalizedTarget))
    ) {
      score += 10;
    }

    return score;
  }

  private isGenericSnapshotFallbackCandidate(candidate: string): boolean {
    return [
      '登录',
      'login',
      'signin',
      'submit',
      'button',
      '确定',
      '确认',
      '下一步',
      '继续',
      '立即开始',
    ].includes(candidate);
  }

  private expandSnapshotTargetVariants(normalizedTarget: string): string[] {
    const variants = new Set<string>([normalizedTarget]);
    const synonyms: Array<[RegExp, string[]]> = [
      [/(用户名|账号)/, ['username', 'user', 'account', 'enterusername']],
      [/(密码)/, ['password', 'pass', 'enterpassword']],
      [/(登录)/, ['login', 'signin', 'logon', 'submit']],
      [/(执行管理)/, ['executions', 'execution', 'runs', 'runmanagement']],
      [/(记住我)/, ['rememberme']],
    ];

    for (const [pattern, aliasList] of synonyms) {
      if (pattern.test(normalizedTarget)) {
        aliasList.forEach((alias) => variants.add(alias));
      }
    }

    return [...variants];
  }

  private normalizeSnapshotText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .toLowerCase()
      .replace(/[\s"'`:,.:;|()[\]{}<>【】]/g, '')
      .trim();
  }

  private normalizeSnapshotAliasText(value: string): string {
    return value.replace(/用户|会员|入口|方式|按钮|链接|立即|马上|前往|进入|进行|去/g, '').trim();
  }

  private isLowSignalTargetCandidate(value: string, tool: string): boolean {
    const normalized = this.normalizeSnapshotText(value);
    if (!normalized) {
      return true;
    }

    const genericTargets = new Set(
      [
        'textbox',
        'input',
        'textarea',
        'field',
        'button',
        'link',
        'tab',
        'menuitem',
        'checkbox',
        'radio',
        'combobox',
        'searchbox',
        '文本框',
        '输入框',
        '字段',
        '按钮',
        '链接',
        '选项卡',
      ].map((item) => this.normalizeSnapshotText(item))
    );

    if (genericTargets.has(normalized)) {
      return true;
    }

    if (tool === 'fill' && /^(填写|输入)$/.test(value.trim())) {
      return true;
    }

    return false;
  }

  private extractAsciiTokens(value: string): string[] {
    const matches = value.match(/[a-z0-9]{2,}/g);
    if (!matches) {
      return [];
    }
    return [...new Set(matches)];
  }

  private attachSnapshotContextLabels(nodes: SnapshotNode[]): SnapshotNode[] {
    return nodes.map((node, index) => {
      if (!['textbox', 'searchbox', 'combobox', 'textarea', 'input'].includes(node.role)) {
        return node;
      }

      const contextLabel = this.findSnapshotContextLabel(nodes, index);
      if (!contextLabel) {
        return node;
      }

      return {
        ...node,
        contextLabel,
      };
    });
  }

  private findSnapshotContextLabel(nodes: SnapshotNode[], index: number): string | undefined {
    const currentNode = nodes[index];
    if (!currentNode) {
      return undefined;
    }

    for (let cursor = index - 1; cursor >= 0 && cursor >= index - 8; cursor -= 1) {
      const candidate = nodes[cursor];
      if (!candidate) {
        continue;
      }
      if (candidate.indent + 4 < currentNode.indent) {
        break;
      }
      if (
        ['textbox', 'searchbox', 'combobox', 'textarea', 'input', 'button', 'link', 'tab'].includes(
          candidate.role
        )
      ) {
        continue;
      }

      const label = this.normalizeSnapshotContextLabel(candidate.text || candidate.name);
      if (label) {
        return label;
      }
    }

    return undefined;
  }

  private normalizeSnapshotContextLabel(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value
      .replace(/^["']|["']$/g, '')
      .replace(/^[*\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized || /^[]+$/u.test(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private mergeObservedStrings(...groups: string[][]): string[] {
    const merged = new Set<string>();
    for (const group of groups) {
      for (const item of group) {
        if (typeof item === 'string' && item.trim().length > 0) {
          merged.add(item.trim());
        }
      }
    }
    return [...merged.values()];
  }
}
