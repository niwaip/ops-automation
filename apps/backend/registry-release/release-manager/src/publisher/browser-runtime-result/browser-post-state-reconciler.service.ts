import { Injectable } from '@nestjs/common';

export type BrowserPostStateReconciliation = {
  recovered: boolean;
  warningCode?: 'NAVIGATION_TIMEOUT_RECOVERED';
  verification: { success: boolean; confidence: number; checks: Array<Record<string, unknown>> };
};

@Injectable()
export class BrowserPostStateReconcilerService {
  reconcile(input: {
    action: string;
    result: Record<string, unknown>;
  }): BrowserPostStateReconciliation {
    const postCheck = asRecord(input.result.postCheck);
    const pageState = asRecord(input.result.pageState);
    const targetReached = postCheck?.targetReached === true;
    const meaningfulPage = typeof pageState?.pageUrl === 'string' && !isBrowserErrorPage(pageState.pageUrl);
    const recovered =
      (input.action === 'goto' || input.action === 'navigate') &&
      input.result.success !== true &&
      input.result.executionState === 'ambiguous' &&
      targetReached &&
      meaningfulPage;
    return {
      recovered,
      ...(recovered ? { warningCode: 'NAVIGATION_TIMEOUT_RECOVERED' } : {}),
      verification: {
        success: recovered || input.result.success === true,
        confidence: recovered ? 0.9 : input.result.success === true ? 1 : 0,
        checks: Array.isArray(postCheck?.evidence) ? postCheck.evidence.filter(isRecord) : [],
      },
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBrowserErrorPage(url: string): boolean {
  return /^(?:chrome-error:|about:neterror|data:text\/html,chromewebdata)/iu.test(url);
}
