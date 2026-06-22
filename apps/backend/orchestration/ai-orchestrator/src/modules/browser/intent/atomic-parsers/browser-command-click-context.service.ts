import { Injectable } from '@nestjs/common';
import {
  buildPendingClickIntent,
  inferSemanticHint,
  normalizePendingRoleHint,
  normalizePendingSemanticHint,
  type PendingActionIntent,
  type PendingActionIntentSource,
} from './action-intent.builder';
import { resolveActionIntentToLocator } from './action-target-resolver.service';
import { buildClickCommandFromResolvedTarget } from './click-command.factory';
import { BrowserCommandContextNormalizerService } from './browser-command-context-normalizer.service';
import type {
  BrowserCommand,
  BrowserCommandCandidate,
  BrowserCommandContext,
} from '../browser-command.types';

@Injectable()
export class BrowserCommandClickContextService {
  constructor(
    private readonly browserCommandContextNormalizerService: BrowserCommandContextNormalizerService
  ) {}

  getActionResolverCandidates(context: BrowserCommandContext): BrowserCommandCandidate[] {
    if (context.availableCandidates?.length) {
      return context.availableCandidates;
    }

    return (context.availableButtons || [])
      .map((item, index) => this.browserCommandContextNormalizerService.normalizeCandidate(item, index))
      .filter((item): item is BrowserCommandCandidate => Boolean(item));
  }

  resolvePendingClickIntent(
    intent: PendingActionIntent,
    context: BrowserCommandContext,
    description: string
  ): BrowserCommand | null {
    const resolvedTarget = resolveActionIntentToLocator(intent, {
      availableCandidates: this.getActionResolverCandidates(context),
      availableButtons: context.availableButtons,
      currentPageUrl: context.currentPageUrl,
      lastObservationText: context.lastObservationText,
    });
    if (!resolvedTarget) {
      return null;
    }

    return buildClickCommandFromResolvedTarget({
      intent,
      description,
      resolvedTarget,
    });
  }

  buildPendingClickIntentFromParams(
    params: Record<string, unknown>,
    source: PendingActionIntentSource
  ): PendingActionIntent | null {
    const rawTargetFromText = typeof params.text === 'string' ? params.text.trim() : undefined;
    const rawTargetFromIntent =
      typeof params.rawTarget === 'string' ? params.rawTarget.trim() : undefined;
    const rawTargetFromTarget =
      typeof params.target === 'string'
        ? this.extractRawTargetFromTextLocator(params.target)
        : undefined;
    const candidateId =
      typeof params.candidateId === 'string' && params.candidateId.trim()
        ? params.candidateId.trim()
        : undefined;

    const rawTarget = rawTargetFromIntent || rawTargetFromText || rawTargetFromTarget;
    if (!rawTarget && !candidateId) {
      return null;
    }

    const row = this.browserCommandContextNormalizerService.normalizeCandidateRow(params.rowHint);

    return buildPendingClickIntent({
      source,
      rawTarget,
      candidateId,
      regionHint: typeof params.regionHint === 'string' ? params.regionHint : undefined,
      roleHint: normalizePendingRoleHint(params.roleHint),
      semanticHint:
        normalizePendingSemanticHint(params.semanticHint) || inferSemanticHint(rawTarget),
      rowHint: row
        ? {
            index: row.index,
            key: row.key,
            text: row.text,
          }
        : undefined,
    });
  }

  isExplicitNonTextClickTarget(target: string): boolean {
    const normalized = target.trim();
    if (!normalized) {
      return false;
    }

    if (/^text\s*=/i.test(normalized)) {
      return false;
    }

    return true;
  }

  resolveClickCommandsWithContext(
    commands: BrowserCommand[],
    context: BrowserCommandContext,
    source: PendingActionIntentSource
  ): BrowserCommand[] {
    return commands.map((command) => {
      if (command.tool !== 'click') {
        return command;
      }

      const params = (command.params || {}) as Record<string, unknown>;
      if (typeof params.target === 'string' && this.isExplicitNonTextClickTarget(params.target)) {
        return command;
      }
      if (typeof params.selector === 'string' && params.selector.trim()) {
        return command;
      }

      const intent = this.buildPendingClickIntentFromParams(params, source);
      if (!intent) {
        return command;
      }

      const resolved = this.resolvePendingClickIntent(
        intent,
        context,
        command.description || `点击${intent.rawTarget || ''}`.trim()
      );
      return resolved || command;
    });
  }

  validateAIResolvedCommands(
    input: string,
    context: BrowserCommandContext,
    commands: BrowserCommand[]
  ): BrowserCommand[] | null {
    if (!this.shouldPreferAIForCandidateScopedIntent(input, context)) {
      return commands;
    }

    const requestedRowIndex = this.extractRequestedRowIndex(input);
    const hasUngroundedClick = commands.some((command) => this.isUngroundedAIClick(command));
    const hasMismatchedRowScopedClick = commands.some((command) =>
      this.isMismatchedRowScopedDetailClick(command, context, requestedRowIndex)
    );
    return hasUngroundedClick || hasMismatchedRowScopedClick ? null : commands;
  }

  private extractRawTargetFromTextLocator(target: string): string | undefined {
    const normalized = target.trim();
    const quotedMatch = normalized.match(/^text\s*=\s*"(.+)"$/i);
    if (quotedMatch?.[1]) {
      return quotedMatch[1].trim();
    }
    const plainMatch = normalized.match(/^text\s*=\s*(.+)$/i);
    return plainMatch?.[1]?.trim();
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

  shouldPreferAIForCandidateScopedIntent(
    input: string,
    context: BrowserCommandContext
  ): boolean {
    if (!context.availableCandidates?.length) {
      return false;
    }
    const scopedAction = this.parseScopedActionIntent(input);
    if (!scopedAction?.rawTarget) {
      return false;
    }

    const target = scopedAction.rawTarget;
    const hasOrdinalReference =
      /(?:第?[一二三四五六七八九十\d]+|当前|上一|下一)\s*(?:条|个)?(?:记录|行|项目|数据|案件)?/i.test(
        target
      );
    const hasDetailIntent =
      /(详情|详细|明细|详情页|详细页|详细页面|详情页面|詳細|detail|进入详细|进入详情|查看详情|打开详情)/i.test(
        target
      );
    return hasOrdinalReference && (hasDetailIntent || this.hasAmbiguousActionCandidates(context));
  }

  private hasAmbiguousActionCandidates(context: BrowserCommandContext): boolean {
    const candidates = this.getActionResolverCandidates(context).filter(
      (candidate) => candidate.kind === 'action'
    );
    if (candidates.length < 2) {
      return false;
    }

    const seen = new Map<string, number>();
    for (const candidate of candidates) {
      const signature = [
        this.normalizeCandidateText(candidate.action),
        this.normalizeCandidateText(candidate.stableName),
        this.normalizeCandidateText(candidate.label),
      ]
        .filter(Boolean)
        .join('|');
      if (!signature) {
        continue;
      }
      const count = (seen.get(signature) || 0) + 1;
      if (count >= 2) {
        return true;
      }
      seen.set(signature, count);
    }

    return false;
  }

  private isUngroundedAIClick(command: BrowserCommand): boolean {
    if (command.tool !== 'click') {
      return false;
    }

    if (command.locator?.generatedBy === 'fallback') {
      return true;
    }

    const params = (command.params || {}) as Record<string, unknown>;
    if (typeof params.text === 'string' && params.text.trim()) {
      return true;
    }

    if (typeof params.target === 'string' && /^text\s*=/i.test(params.target.trim())) {
      return true;
    }

    return false;
  }

  private extractRequestedRowIndex(input: string): number | undefined {
    const scopedAction = this.parseScopedActionIntent(input);
    if (!scopedAction?.rawTarget) {
      return undefined;
    }
    const rowToken = this.extractRequestedRowToken(scopedAction.rawTarget);
    return rowToken ? this.resolveResultIndex(rowToken) : undefined;
  }

  private extractRequestedRowToken(input: string): string | undefined {
    const rowMatch = input.match(
      /(?:第?\s*([一二三四五六七八九十\d]+)\s*(?:个)?\s*(?:条)?\s*(?:记录|行|项目|数据|案件))/i
    );
    return rowMatch?.[1];
  }

  private isMismatchedRowScopedDetailClick(
    command: BrowserCommand,
    context: BrowserCommandContext,
    requestedRowIndex?: number
  ): boolean {
    if (command.tool !== 'click' || !requestedRowIndex) {
      return false;
    }
    const scopedAction = this.parseScopedActionIntent(command.description || '');
    const detailLikeInput =
      /(详情|详细|明细|详情页|详细页|详细页面|详情页面|詳細|detail|进入详细|进入详情|查看详情|打开详情)/i.test(
        scopedAction?.rawTarget || command.description || ''
      );
    if (!detailLikeInput) {
      return false;
    }

    const candidates = this.getActionResolverCandidates(context);
    const hasExpectedRowDetailCandidate = candidates.some(
      (candidate) =>
        candidate.kind === 'action' &&
        candidate.row?.index === requestedRowIndex &&
        this.isDetailLikeCandidate(candidate)
    );
    if (!hasExpectedRowDetailCandidate) {
      return false;
    }

    const matchedCandidateId = command.locator?.matchedCandidateId;
    if (!matchedCandidateId) {
      return true;
    }
    const matchedCandidate = candidates.find((candidate) => candidate.candidateId === matchedCandidateId);
    return matchedCandidate?.row?.index !== requestedRowIndex;
  }

  private isDetailLikeCandidate(candidate: BrowserCommandCandidate): boolean {
    const combined = [
      candidate.action,
      candidate.stableName,
      candidate.label,
      candidate.text,
      candidate.summary,
    ]
      .map((value) => this.normalizeCandidateText(value))
      .join('|');
    return combined.includes('detail');
  }

  private normalizeCandidateText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/案件粗利率|粗利率|毛利率|gross[\s_-]*margin/g, 'grossmargin')
      .replace(/详情|詳細/g, 'detail')
      .replace(/承认する|承認する|承认|承認|approve/g, 'approve')
      .replace(/批准|审批通过|审批|通过/g, 'approve')
      .replace(/却下する|却下|拒绝|拒否|reject/g, 'reject')
      .replace(/打开|进入|点击|单击|选择/g, '')
      .replace(/按钮|按键|链接|入口|字段|输入框|文本框|区域|面板|模块|区块|部分/g, '')
      .replace(/[的"'\s:=|]/g, '')
      .trim();
  }
}
