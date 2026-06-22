import { Injectable } from '@nestjs/common';
import type {
  BrowserCommandCandidate,
  BrowserCommandCandidateLocator,
  BrowserCommandContext,
} from './browser-command.types';

interface ParsedCandidateHint {
  raw: string;
  candidateId?: string;
  ref?: string;
  row?: number;
  kind?: string;
  action?: string;
  stable?: string;
  label?: string;
  field?: string;
  region?: string;
  rowKey?: string;
  rowText?: string;
  text?: string;
  role?: string;
  elementId?: string;
  dataTestId?: string;
  preferredLocator?: BrowserCommandCandidateLocator;
}

@Injectable()
export class BrowserCommandContextNormalizerService {
  normalizeContext(context?: Record<string, unknown>): BrowserCommandContext {
    if (!context) {
      return {};
    }

    const availableInputs = Array.isArray(context.availableInputs)
      ? context.availableInputs.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : undefined;
    const availableButtons = Array.isArray(context.availableButtons)
      ? context.availableButtons.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : undefined;
    const availableCandidates = this.normalizeAvailableCandidates(context.availableCandidates);
    const rawFailureContext =
      context.lastFailureContext &&
      typeof context.lastFailureContext === 'object' &&
      !Array.isArray(context.lastFailureContext)
        ? (context.lastFailureContext as Record<string, unknown>)
        : undefined;

    return {
      forceAI: typeof context.forceAI === 'boolean' ? context.forceAI : undefined,
      commandType: typeof context.commandType === 'string' ? context.commandType : undefined,
      pageType: typeof context.pageType === 'string' ? context.pageType : undefined,
      traceId: typeof context.traceId === 'string' ? context.traceId : undefined,
      observationSummary:
        typeof context.observationSummary === 'string' ? context.observationSummary : undefined,
      currentPageUrl:
        typeof context.currentPageUrl === 'string' ? context.currentPageUrl : undefined,
      backend: typeof context.backend === 'string' ? context.backend : undefined,
      lastObservationText:
        typeof context.lastObservationText === 'string' ? context.lastObservationText : undefined,
      availableInputs,
      availableButtons,
      availableCandidates,
      controlHints: Array.isArray(context.controlHints)
        ? context.controlHints.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        : undefined,
      lastFailureContext: rawFailureContext
        ? {
            lastAction:
              rawFailureContext.lastAction &&
              typeof rawFailureContext.lastAction === 'object' &&
              !Array.isArray(rawFailureContext.lastAction)
                ? (rawFailureContext.lastAction as Record<string, unknown>)
                : {},
            errorMessage:
              typeof rawFailureContext.errorMessage === 'string'
                ? rawFailureContext.errorMessage
                : '',
            errorType:
              typeof rawFailureContext.errorType === 'string'
                ? rawFailureContext.errorType
                : undefined,
            retryable:
              typeof rawFailureContext.retryable === 'boolean'
                ? rawFailureContext.retryable
                : undefined,
            failedStepIndex:
              typeof rawFailureContext.failedStepIndex === 'number'
                ? rawFailureContext.failedStepIndex
                : undefined,
          }
        : undefined,
    };
  }

  normalizeAvailableCandidates(value: unknown): BrowserCommandCandidate[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const candidates = value
      .map((item, index) => this.normalizeCandidate(item, index))
      .filter((item): item is BrowserCommandCandidate => Boolean(item));

    return candidates.length > 0 ? candidates : undefined;
  }

  normalizeCandidate(item: unknown, index: number): BrowserCommandCandidate | null {
    if (typeof item === 'string') {
      const parsed = this.parseStructuredCandidateHint(item);
      if (!parsed) {
        return null;
      }
      return {
        candidateId: parsed.candidateId || `candidate_${index + 1}`,
        kind: (parsed.kind as BrowserCommandCandidate['kind']) || 'action',
        label: parsed.label || parsed.text || parsed.field || parsed.action || parsed.raw,
        summary: parsed.raw,
        source: 'probe',
        ref: parsed.ref,
        role: parsed.role,
        elementId: parsed.elementId,
        dataTestId: parsed.dataTestId,
        text: parsed.text,
        action: parsed.action,
        field: parsed.field,
        stableName: parsed.stable,
        row: {
          index: parsed.row,
          key: parsed.rowKey,
          text: parsed.rowText,
        },
        region: {
          name: parsed.region,
        },
        preferredLocator:
          parsed.preferredLocator || (parsed.ref ? { type: 'ref', value: parsed.ref } : undefined),
      };
    }

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }

    const record = item as Record<string, unknown>;
    const candidateId =
      typeof record.candidateId === 'string' && record.candidateId.trim()
        ? record.candidateId.trim()
        : `candidate_${index + 1}`;
    const kind = typeof record.kind === 'string' ? record.kind : 'action';
    const label =
      typeof record.label === 'string' && record.label.trim() ? record.label.trim() : candidateId;
    const summary =
      typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : label;
    const source = typeof record.source === 'string' ? record.source : 'probe';
    const preferredLocator = this.normalizePreferredLocator(record.preferredLocator);

    return {
      candidateId,
      kind: (kind as BrowserCommandCandidate['kind']) || 'action',
      label,
      summary,
      source: (source as BrowserCommandCandidate['source']) || 'probe',
      ref: typeof record.ref === 'string' ? record.ref : undefined,
      role: typeof record.role === 'string' ? record.role : undefined,
      elementId: typeof record.elementId === 'string' ? record.elementId : undefined,
      dataTestId: typeof record.dataTestId === 'string' ? record.dataTestId : undefined,
      text: typeof record.text === 'string' ? record.text : undefined,
      action: typeof record.action === 'string' ? record.action : undefined,
      field: typeof record.field === 'string' ? record.field : undefined,
      stableName: typeof record.stableName === 'string' ? record.stableName : undefined,
      row: this.normalizeCandidateRow(record.row),
      region: this.normalizeCandidateRegion(record.region),
      preferredLocator,
    };
  }

  normalizePreferredLocator(value: unknown): BrowserCommandCandidateLocator | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.type !== 'string' || typeof record.value !== 'string') {
      return undefined;
    }
    return {
      type: record.type as BrowserCommandCandidateLocator['type'],
      value: record.value,
    };
  }

  normalizeCandidateRow(value: unknown): BrowserCommandCandidate['row'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const row: BrowserCommandCandidate['row'] = {};
    if (typeof record.index === 'number' && Number.isFinite(record.index)) {
      row.index = record.index;
    }
    if (typeof record.key === 'string') {
      row.key = record.key;
    }
    if (typeof record.text === 'string') {
      row.text = record.text;
    }
    return Object.keys(row).length > 0 ? row : undefined;
  }

  normalizeCandidateRegion(value: unknown): BrowserCommandCandidate['region'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const region: BrowserCommandCandidate['region'] = {};
    if (typeof record.name === 'string') {
      region.name = record.name;
    }
    if (typeof record.type === 'string') {
      region.type = record.type;
    }
    return Object.keys(region).length > 0 ? region : undefined;
  }

  private parseStructuredCandidateHint(value: string): ParsedCandidateHint | null {
    const raw = value.trim();
    if (!raw) {
      return null;
    }
    const ref = this.extractStructuredHintToken(raw, 'ref');
    const candidateId = this.extractStructuredHintToken(raw, 'candidateId');
    const row = this.extractStructuredHintToken(raw, 'row');
    const kind = this.extractStructuredHintToken(raw, 'kind');
    const action = this.extractStructuredHintToken(raw, 'action');
    const stable = this.extractStructuredHintToken(raw, 'stable');
    const label = this.extractStructuredHintToken(raw, 'label');
    const field = this.extractStructuredHintToken(raw, 'field');
    const region = this.extractStructuredHintToken(raw, 'region');
    const rowKey = this.extractStructuredHintToken(raw, 'rowKey');
    const rowText = this.extractStructuredHintToken(raw, 'rowText');
    const text = this.extractStructuredHintToken(raw, 'text');
    const role = this.extractStructuredHintToken(raw, 'role');
    const elementId = this.extractStructuredHintToken(raw, 'id');
    const dataTestId = this.extractStructuredHintToken(raw, 'testid');

    return {
      raw,
      candidateId,
      ref,
      row: row && /^\d+$/.test(row) ? Number(row) : undefined,
      kind,
      action,
      stable,
      label,
      field,
      region,
      rowKey,
      rowText,
      text,
      role,
      elementId,
      dataTestId,
    };
  }

  private extractStructuredHintToken(value: string, key: string): string | undefined {
    const match = value.match(new RegExp(`${key}=([^|]+)`));
    return match?.[1]?.trim();
  }
}
