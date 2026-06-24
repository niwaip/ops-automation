import { Injectable } from '@nestjs/common';
import {
  buildPendingClickIntent,
  inferSemanticHint,
  type PendingActionSemanticHint,
} from '../atomic-parsers/action-intent.builder';
import { buildActionProfile, canonicalizeActionText } from './browser-command-action.profile';
import type {
  ActionCommandHelpers,
  ActionParseContext,
  ActionParseResult,
  ActionProfileCategoryHint,
  ActionProfileEntry,
  ResolvedActionIntentPayload,
} from './browser-command-action.types';
import type { RuntimeSemanticRule } from '../../../../client/browser-semantics.client';

@Injectable()
export class BrowserCommandActionService {
  parseActionCommandDetailed(
    input: string,
    _commandContext: ActionParseContext['commandContext'],
    helpers: ActionCommandHelpers,
    options?: { runtimeRules?: RuntimeSemanticRule[]; allowDefaultFallback?: boolean }
  ): ActionParseResult {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return { status: 'no_match' };
    }

    const candidates = helpers.getActionCandidates();
    if (!candidates.length) {
      return { status: 'no_match' };
    }

    const actionIntent = this.parseScopedActionIntent(normalizedInput);
    if (!actionIntent?.rawTarget) {
      return { status: 'no_match' };
    }

    const profile = buildActionProfile(options?.runtimeRules || []);
    const normalizedParsedIntent = this.normalizeParsedIntent(actionIntent.rawTarget);
    if (!normalizedParsedIntent.requestedTarget) {
      return { status: 'no_match' };
    }

    const matchedEntry = this.matchActionEntry(normalizedParsedIntent.requestedTarget, profile.entries);
    if (!matchedEntry && options?.allowDefaultFallback === false) {
      return { status: 'no_match' };
    }
    const resolvedIntent = matchedEntry
      ? this.buildRuntimeIntentPayload(normalizedParsedIntent, actionIntent.regionHint, matchedEntry)
      : this.buildDefaultIntentPayload(normalizedParsedIntent, actionIntent.regionHint);

    const clickIntent = buildPendingClickIntent({
      source: 'candidate-parser',
      rawTarget: resolvedIntent.actionTerm || resolvedIntent.requestedTarget,
      regionHint: resolvedIntent.regionHint,
      roleHint: resolvedIntent.roleHint,
      semanticHint: resolvedIntent.semanticHint,
      rowHint: resolvedIntent.rowIndex ? { index: resolvedIntent.rowIndex } : undefined,
    });
    const clickCommand = helpers.resolvePendingClickIntent(
      clickIntent,
      `${actionIntent.verb}${actionIntent.rawTarget}`
    );
    if (!clickCommand) {
      return { status: 'no_match' };
    }

    return {
      status: 'success',
      response: {
        success: true,
        commands: [clickCommand],
        explanation: `将${actionIntent.verb}${actionIntent.rawTarget}`,
        parserMetadata: {
          action: {
            status: 'success',
            reason: this.resolveActionReason(resolvedIntent),
            resolvedTarget: resolvedIntent.requestedTarget,
            resolvedActionTerm: resolvedIntent.actionTerm || resolvedIntent.requestedTarget,
            semanticHint: resolvedIntent.semanticHint,
            resolvedRegion: resolvedIntent.regionHint,
            resolvedRoleHint: resolvedIntent.roleHint,
            rowIndex: resolvedIntent.rowIndex,
            categoryHint: resolvedIntent.categoryHint,
            usedRuntimeProfile: resolvedIntent.usedRuntimeProfile,
            matchedRuntimeRuleIds: resolvedIntent.matchedRuntimeRuleIds,
          },
        },
      },
    };
  }

  private parseScopedActionIntent(input: string): {
    verb: string;
    rawTarget: string;
    regionHint?: string;
  } | null {
    const normalizedInput = input.replace(/\s+/g, ' ').trim();
    if (!normalizedInput) {
      return null;
    }

    const scopedMatch = normalizedInput.match(
      /^在(.+?)(?:区域|面板|模块|区块|部分)?(?:里|中)?\s*(点击|单击|选择|打开|进入|click)\s*(.+)$/i
    );
    if (scopedMatch?.[2] && scopedMatch[3]) {
      return {
        verb: scopedMatch[2],
        rawTarget: scopedMatch[3].trim(),
        regionHint: scopedMatch[1]?.trim() || undefined,
      };
    }

    const directMatch = normalizedInput.match(/^(点击|单击|选择|打开|进入|click)\s*(.+)$/i);
    if (!directMatch?.[2]) {
      return null;
    }

    const verb = directMatch[1]?.trim();
    const rawTarget = directMatch[2]?.trim();
    if (!verb || !rawTarget) {
      return null;
    }

    return {
      verb,
      rawTarget,
    };
  }

  private normalizeParsedIntent(rawTarget: string): { requestedTarget: string; rowIndex?: number } {
    const rowToken = this.extractRequestedRowToken(rawTarget);
    const rowIndex = rowToken ? this.resolveResultIndex(rowToken) : undefined;
    let requestedTarget = rawTarget
      .replace(/(?:一览的|列表的|表格里的|表格中|列表中|当前的|当前页的)/g, '')
      .replace(/第?\s*[一二三四五六七八九十\d]+\s*(?:个)?\s*(?:条)?\s*(?:记录|行|项目|数据|案件)/g, '')
      .replace(
        /(?:的)?(?:(?:进行|进入|打开|查看)?(?:详细按钮|详情按钮|详情页|详细页|详细页面|详情页面|进入详细页面|进入详情页面|进入详细页|进入详情页|进入详细|进入详情|查看详情|打开详情|详细|详情|明细))/gi,
        '详情'
      )
      .replace(/^[,，。；\s]+/g, '')
      .replace(/^的+/, '')
      .trim();

    if (
      rowIndex &&
      (!requestedTarget ||
        /^(?:进入详细页面?|进入详情页面?|进入详细页?|进入详情页?|进入详细|进入详情|查看详情|打开详情)$/.test(
          requestedTarget
        ))
    ) {
      requestedTarget = '详情';
    }

    return {
      requestedTarget,
      rowIndex,
    };
  }

  private matchActionEntry(target: string, entries: ActionProfileEntry[]): ActionProfileEntry | null {
    const normalizedTarget = canonicalizeActionText(target);
    if (!normalizedTarget) {
      return null;
    }

    const scoredEntries = entries
      .map((entry) => ({
        entry,
        score: Math.max(
          ...entry.targetTerms.map((term) => {
            const normalizedTerm = canonicalizeActionText(term);
            if (!normalizedTerm) {
              return 0;
            }
            if (normalizedTarget === normalizedTerm) {
              return 300;
            }
            if (normalizedTarget.includes(normalizedTerm) || normalizedTerm.includes(normalizedTarget)) {
              return 150;
            }
            return 0;
          })
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scoredEntries[0]?.entry || null;
  }

  private buildRuntimeIntentPayload(
    parsed: { requestedTarget: string; rowIndex?: number },
    explicitRegionHint: string | undefined,
    entry: ActionProfileEntry
  ): ResolvedActionIntentPayload {
    return {
      requestedTarget: parsed.requestedTarget,
      rowIndex: parsed.rowIndex,
      regionHint: explicitRegionHint || entry.regionTerms[0],
      roleHint: entry.roleHints[0],
      semanticHint: this.mapSemanticKeyToPendingHint(entry.semanticKey, parsed.requestedTarget),
      actionTerm:
        entry.actionTerms[0] ||
        this.mapSemanticKeyToActionTerm(entry.semanticKey) ||
        parsed.requestedTarget,
      categoryHint: entry.categoryHint || this.inferCategoryHint(entry.semanticKey, parsed.rowIndex),
      usedRuntimeProfile: true,
      matchedRuntimeRuleIds: entry.ruleId ? [entry.ruleId] : [],
    };
  }

  private buildDefaultIntentPayload(
    parsed: { requestedTarget: string; rowIndex?: number },
    explicitRegionHint: string | undefined
  ): ResolvedActionIntentPayload {
    const normalizedTarget = canonicalizeActionText(parsed.requestedTarget);
    const semanticKey = this.inferSemanticKey(parsed.requestedTarget);
    return {
      requestedTarget: parsed.requestedTarget,
      rowIndex: parsed.rowIndex,
      regionHint: explicitRegionHint,
      semanticHint: normalizedTarget.includes('pending')
        ? undefined
        : this.mapSemanticKeyToPendingHint(semanticKey, parsed.requestedTarget),
      actionTerm: this.mapSemanticKeyToActionTerm(semanticKey) || parsed.requestedTarget,
      categoryHint: this.inferCategoryHint(semanticKey, parsed.rowIndex),
      usedRuntimeProfile: false,
      matchedRuntimeRuleIds: [],
    };
  }

  private resolveActionReason(intent: ResolvedActionIntentPayload): string {
    if (!intent.usedRuntimeProfile) {
      return 'action-default-candidate';
    }
    if (intent.rowIndex && intent.regionHint) {
      return 'action-runtime-row-region';
    }
    if (intent.rowIndex) {
      return 'action-runtime-row';
    }
    if (intent.regionHint) {
      return 'action-runtime-region';
    }
    return 'action-runtime-target';
  }

  private inferSemanticKey(target: string): ActionProfileEntry['semanticKey'] {
    const normalized = canonicalizeActionText(target);
    if (!normalized) {
      return undefined;
    }
    if (normalized.includes('detail')) {
      return 'detail';
    }
    if (normalized.includes('approve')) {
      return 'approve';
    }
    if (normalized.includes('reject')) {
      return 'reject';
    }
    if (normalized.includes('menu')) {
      return 'menu';
    }
    if (normalized.includes('edit')) {
      return 'edit';
    }
    if (normalized.includes('delete')) {
      return 'delete';
    }
    return undefined;
  }

  private inferCategoryHint(
    semanticKey: ActionProfileEntry['semanticKey'],
    rowIndex?: number
  ): ActionProfileCategoryHint | undefined {
    if (semanticKey === 'menu') {
      return 'MENU_SELECTION';
    }
    if (semanticKey === 'detail' || semanticKey === 'open') {
      return 'DETAIL_OPEN';
    }
    if (semanticKey === 'approve' || semanticKey === 'reject' || semanticKey === 'edit' || semanticKey === 'delete') {
      return 'ROW_ACTION';
    }
    return rowIndex ? 'ROW_ACTION' : undefined;
  }

  private mapSemanticKeyToPendingHint(
    semanticKey: ActionProfileEntry['semanticKey'],
    fallbackTarget: string
  ): PendingActionSemanticHint | undefined {
    switch (semanticKey) {
      case 'detail':
      case 'open':
      case 'menu':
      case 'edit':
        return 'open';
      case 'approve':
        return 'confirm';
      default:
        return inferSemanticHint(fallbackTarget);
    }
  }

  private mapSemanticKeyToActionTerm(semanticKey: ActionProfileEntry['semanticKey']): string | undefined {
    switch (semanticKey) {
      case 'detail':
        return '详情';
      case 'approve':
        return 'approve';
      case 'reject':
        return 'reject';
      case 'menu':
        return 'menu';
      case 'edit':
        return 'edit';
      case 'delete':
        return 'delete';
      case 'open':
        return 'open';
      default:
        return undefined;
    }
  }

  private resolveResultIndex(value: string): number {
    const indexMap: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      first: 1,
      second: 2,
      third: 3,
      fourth: 4,
      fifth: 5,
    };
    const normalized = value.replace(/^第/, '').replace(/个|条/g, '').toLowerCase();
    return indexMap[normalized] || parseInt(normalized, 10) || 0;
  }

  private extractRequestedRowToken(input: string): string | undefined {
    const rowMatch = input.match(
      /(?:第?\s*([一二三四五六七八九十\d]+)\s*(?:个)?\s*(?:条)?\s*(?:记录|行|项目|数据|案件))/i
    );
    return rowMatch?.[1];
  }
}
