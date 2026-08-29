import { Injectable } from '@nestjs/common';

type BrowserPageReadinessPolicy = {
  waitUntil?: 'domcontentloaded' | 'networkidle';
  timeoutMs?: number;
  stableMs?: number;
  selector?: string;
  minCount?: number;
};

export type BrowserPageReadinessResult = {
  ready: boolean;
  required: boolean;
  reason: 'stable' | 'selector_timeout' | 'dom_not_stable' | 'not_applicable';
  selector?: string;
  selectorCount?: number;
  observedContentChars?: number;
  elapsedMs?: number;
};

type ScriptExecutor = (script: string) => Promise<string>;

const PAGE_CHANGING_ACTIONS = new Set([
  'goto',
  'navigate',
  'click',
  'smart_search',
  'click_result',
  'switch_latest_tab',
  'focus_latest_page',
]);

@Injectable()
export class BrowserPageReadinessService {
  async wait(input: {
    action: string;
    captureProfile?: Record<string, unknown>;
    execute: ScriptExecutor;
  }): Promise<BrowserPageReadinessResult> {
    if (!PAGE_CHANGING_ACTIONS.has(input.action)) {
      return { ready: true, required: false, reason: 'not_applicable' };
    }

    const policy = this.resolvePolicy(input.captureProfile);
    const raw = await input.execute(this.buildScript(policy));
    const parsed = this.parseResult(raw);
    return {
      ...parsed,
      required: Boolean(policy.selector),
      ...(policy.selector ? { selector: policy.selector } : {}),
    };
  }

  resolvePolicy(
    captureProfile?: Record<string, unknown>
  ): Required<Omit<BrowserPageReadinessPolicy, 'selector'>> & { selector?: string } {
    const readiness = asRecord(captureProfile?.readiness);
    const selector = nonEmptyString(readiness?.selector);
    return {
      waitUntil: readiness?.waitUntil === 'domcontentloaded' ? 'domcontentloaded' : 'networkidle',
      timeoutMs: boundedInteger(readiness?.timeoutMs, 8_000, 500, 60_000),
      stableMs: boundedInteger(readiness?.stableMs, 750, 0, 10_000),
      minCount: boundedInteger(readiness?.minCount, 1, 1, 10_000),
      ...(selector ? { selector } : {}),
    };
  }

  private buildScript(policy: ReturnType<BrowserPageReadinessService['resolvePolicy']>): string {
    const sampleIntervalMs = Math.min(250, Math.max(100, policy.stableMs || 100));
    return `async page => {
      const activePage = page.context().pages().length
        ? page.context().pages()[page.context().pages().length - 1]
        : page;
      const startedAt = Date.now();
      const timeoutMs = ${policy.timeoutMs};
      const stableMs = ${policy.stableMs};
      const selector = ${JSON.stringify(policy.selector || '')};
      const minCount = ${policy.minCount};
      await activePage.bringToFront().catch(() => {});
      await activePage.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
      if (${JSON.stringify(policy.waitUntil)} === 'networkidle') {
        await activePage.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5000) }).catch(() => {});
      }

      let previousSignature = '';
      let stableSince = 0;
      let selectorCount = 0;
      let observedContentChars = 0;
      while (Date.now() - startedAt <= timeoutMs) {
        const sample = await activePage.evaluate(() => {
          const bodyText = document.body ? (document.body.innerText || '') : '';
          const html = document.documentElement ? document.documentElement.innerHTML : '';
          return {
            readyState: document.readyState,
            contentChars: bodyText.trim().length,
            htmlChars: html.length,
            elementCount: document.body ? document.body.getElementsByTagName('*').length : 0,
          };
        }).catch(() => ({ readyState: '', contentChars: 0, htmlChars: 0, elementCount: 0 }));
        selectorCount = selector
          ? await activePage.locator(selector).count().catch(() => 0)
          : 0;
        observedContentChars = sample.contentChars;
        const selectorReady = !selector || selectorCount >= minCount;
        const documentReady = sample.readyState === 'interactive' || sample.readyState === 'complete';
        const signature = [sample.readyState, sample.contentChars, sample.htmlChars, sample.elementCount, selectorCount].join(':');

        if (documentReady && selectorReady && signature === previousSignature) {
          if (!stableSince) stableSince = Date.now();
          if (Date.now() - stableSince >= stableMs) {
            return JSON.stringify({
              ready: true,
              reason: 'stable',
              selectorCount,
              observedContentChars,
              elapsedMs: Date.now() - startedAt,
            });
          }
        } else {
          stableSince = 0;
          previousSignature = signature;
        }
        await activePage.waitForTimeout(${sampleIntervalMs}).catch(() => {});
      }

      return JSON.stringify({
        ready: false,
        reason: selector && selectorCount < minCount ? 'selector_timeout' : 'dom_not_stable',
        selectorCount,
        observedContentChars,
        elapsedMs: Date.now() - startedAt,
      });
    }`;
  }

  private parseResult(raw: string): Omit<BrowserPageReadinessResult, 'required' | 'selector'> {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        ready: parsed.ready === true,
        reason:
          parsed.reason === 'selector_timeout' || parsed.reason === 'dom_not_stable'
            ? parsed.reason
            : 'stable',
        selectorCount: finiteNumber(parsed.selectorCount),
        observedContentChars: finiteNumber(parsed.observedContentChars),
        elapsedMs: finiteNumber(parsed.elapsedMs),
      };
    } catch {
      return { ready: false, reason: 'dom_not_stable' };
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const candidate = Number(value);
  return Number.isInteger(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : fallback;
}

function finiteNumber(value: unknown): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}
