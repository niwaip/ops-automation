import { Injectable } from '@nestjs/common';
import { BrowserCommand } from '../intent';
import { TemplateStepLike } from './recorder-loop.types';

@Injectable()
export class RecorderLoopLocatorService {
  isRecordedDetailEntryCommand(command: BrowserCommand): boolean {
    if (command.tool !== 'click') {
      return false;
    }

    const candidates = [
      typeof command.description === 'string' ? command.description : '',
      typeof command.params.target === 'string' ? command.params.target : '',
      typeof command.params.text === 'string' ? command.params.text : '',
      typeof command.params.selector === 'string' ? command.params.selector : '',
      typeof command.locator?.value === 'string' ? command.locator.value : '',
      typeof command.locator?.expression === 'string' ? command.locator.expression : '',
    ].join(' ');

    return /(详情|詳細|detail|进入详细|进入详情|打开详情|查看详情|open-project-detail|data-ai-action\s*=\s*["']?detail["']?)/i.test(
      candidates
    );
  }

  isReturnToListCommand(command: BrowserCommand): boolean {
    if (command.tool !== 'click') {
      return false;
    }

    const candidates = [
      typeof command.description === 'string' ? command.description : '',
      typeof command.params.target === 'string' ? command.params.target : '',
      typeof command.params.text === 'string' ? command.params.text : '',
      typeof command.params.selector === 'string' ? command.params.selector : '',
      typeof command.locator?.value === 'string' ? command.locator.value : '',
      typeof command.locator?.name === 'string' ? command.locator.name : '',
    ].join(' ');

    return this.containsReturnToListCue(candidates);
  }

  isReturnToListTemplateStep(step: TemplateStepLike): boolean {
    if (step.action !== 'click') {
      return false;
    }

    const params = (step.params || {}) as Record<string, unknown>;
    const candidates = [
      typeof step.description === 'string' ? step.description : '',
      typeof step.locator?.value === 'string' ? step.locator.value : '',
      typeof step.locator?.type === 'string' ? step.locator.type : '',
      typeof params.text === 'string' ? params.text : '',
      typeof params.target === 'string' ? params.target : '',
      typeof params.selector === 'string' ? params.selector : '',
    ].join(' ');

    return this.containsReturnToListCue(candidates);
  }

  containsReturnToListCue(source: string): boolean {
    const normalized = source.trim();
    if (!normalized) {
      return false;
    }

    if (
      /(返回列表|回到列表|返回一览|回到一览|back to list|return to list|一覧へ戻る|一覧に戻る)/i.test(
        normalized
      )
    ) {
      return true;
    }

    if (/(返回|回到|back|return|戻る)/i.test(normalized)) {
      return true;
    }

    return (
      /(列表|一览|list|一覧)/i.test(normalized) && /(返回|回到|back|return|戻る)/i.test(normalized)
    );
  }

  isLoopRowTemplateStep(step: TemplateStepLike): boolean {
    if (step.action !== 'click') {
      return false;
    }
    const locatorValue = typeof step.locator?.value === 'string' ? step.locator.value : '';
    return (
      locatorValue.includes('${rowIndex}') || /^:nth-match\((.+),\s*1\)$/.test(locatorValue.trim())
    );
  }

  toFirstLoopItemLocator(locatorValue: string, loopPendingKeyword?: string): string | undefined {
    return this.toIndexedLoopItemLocator(locatorValue, '1', loopPendingKeyword);
  }

  toIndexedLoopItemLocator(
    locatorValue: string,
    rowIndexExpr: string,
    loopPendingKeyword?: string
  ): string | undefined {
    if (!locatorValue.trim()) {
      return undefined;
    }
    const nthMatchPattern = /^:nth-match\((.+),\s*(\d+|\$\{rowIndex\})\)$/;
    const match = locatorValue.trim().match(nthMatchPattern);
    const baseSelector = match?.[1]?.trim();
    const scopedBaseSelector = baseSelector
      ? this.toRowScopedActionSelector(baseSelector)
      : undefined;
    if (
      scopedBaseSelector &&
      loopPendingKeyword &&
      /\[data-ai-action=|button|btn|action/i.test(scopedBaseSelector)
    ) {
      return `:nth-match(tr:has(${scopedBaseSelector}):has-text(${JSON.stringify(loopPendingKeyword)}) ${scopedBaseSelector}, ${rowIndexExpr})`;
    }
    if (baseSelector) {
      return `:nth-match(${baseSelector}, ${rowIndexExpr})`;
    }
    if (locatorValue.includes('${rowIndex}')) {
      return locatorValue.replace(/\$\{rowIndex\}/g, rowIndexExpr);
    }
    if (
      locatorValue.startsWith('text=') ||
      /^[#.:\[]/.test(locatorValue.trim()) ||
      /^[a-z][a-z0-9_-]*(\b|[#.[:>])/i.test(locatorValue.trim())
    ) {
      return `:nth-match(${locatorValue.trim()}, ${rowIndexExpr})`;
    }
    return undefined;
  }

  toRowScopedActionSelector(selector: string): string {
    const trimmed = selector.trim();
    const separatorIndex = trimmed.lastIndexOf(' ');
    if (separatorIndex <= 0) {
      return trimmed;
    }

    const tailSelector = trimmed.slice(separatorIndex + 1).trim();
    return /\[data-ai-action=|\[data-action=|button|btn|action/i.test(tailSelector)
      ? tailSelector
      : trimmed;
  }

  toLoopCollectionLocator(locatorValue: string): string | undefined {
    const trimmed = locatorValue.trim();
    if (!trimmed) {
      return undefined;
    }

    const match = trimmed.match(/^:nth-match\((.+),\s*(?:\$\{rowIndex\}|\d+)\)$/);
    const baseSelector = match?.[1]?.trim() || trimmed;
    if (!baseSelector) {
      return undefined;
    }

    if (/\[data-ai-action=|button|btn|action/i.test(baseSelector)) {
      return [
        `tr:has(${baseSelector})`,
        `[role="row"]:has(${baseSelector})`,
        `[data-ai-row]:has(${baseSelector})`,
        `[data-row-key]:has(${baseSelector})`,
        `[data-ai-card]:has(${baseSelector})`,
        baseSelector,
      ].join(', ');
    }

    return baseSelector;
  }

  toPendingLoopStopLocator(locatorValue: string): string | undefined {
    const trimmed = locatorValue.trim();
    if (!trimmed) {
      return undefined;
    }

    const match = trimmed.match(/^:nth-match\((.+),\s*(?:\$\{rowIndex\}|\d+)\)$/);
    const baseSelector = match?.[1]?.trim() || trimmed;
    if (!baseSelector.includes(':has-text(')) {
      return undefined;
    }

    const structuredMatch = baseSelector.match(/^(.*:has-text\([^)]*\))\s+(.+)$/);
    if (structuredMatch?.[1] && structuredMatch[2]) {
      const rowSelector = structuredMatch[1].trim();
      const actionSelector = structuredMatch[2].trim();
      return /\[data-ai-action=|button|btn|action/i.test(actionSelector)
        ? rowSelector
        : baseSelector;
    }

    const separatorIndex = baseSelector.lastIndexOf(' ');
    if (separatorIndex <= 0) {
      return baseSelector;
    }

    const rowSelector = baseSelector.slice(0, separatorIndex).trim();
    const actionSelector = baseSelector.slice(separatorIndex + 1).trim();
    return /\[data-ai-action=|button|btn|action/i.test(actionSelector) ? rowSelector : baseSelector;
  }
}
