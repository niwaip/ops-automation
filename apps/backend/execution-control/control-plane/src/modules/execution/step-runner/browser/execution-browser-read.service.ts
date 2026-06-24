import { Injectable } from '@nestjs/common';
import { BrowserRuntimeAdapter } from '../../adapters/browser-runtime.adapter';
import { BROWSER_ACTIONS, BROWSER_RUNTIME } from './browser-execution-constants';

@Injectable()
export class ExecutionBrowserReadService {
  constructor(private readonly browserRuntimeAdapter: BrowserRuntimeAdapter) {}

  async readBrowserTextBySelector(
    runtimeSessionId: string,
    selector: string
  ): Promise<string | undefined> {
    const result = await this.browserRuntimeAdapter.invokeStep({
      requestId: `loop-stop:${runtimeSessionId}:${Date.now()}`,
      executionId: runtimeSessionId,
      stepId: `loop-stop:${runtimeSessionId}`,
      runtimeType: BROWSER_RUNTIME.TYPE,
      runtimeSessionId,
      capabilityType: BROWSER_RUNTIME.CAPABILITY_TYPE,
      action: BROWSER_ACTIONS.GET_TEXT,
      input: {
        target: selector,
        args: {
          selector,
          method: 'textContent',
        },
      },
    });
    const output = result.output || {};
    const data = output.data && typeof output.data === 'object' ? output.data : undefined;
    const parsedValue = this.extractBrowserTextResult([
      data && (data as Record<string, unknown>).text,
      output.text,
      output.stdout,
      output.value,
    ]);
    return parsedValue ?? '';
  }

  extractBrowserTextResult(candidates: unknown[]): string | undefined {
    const rawValue = this.readNonEmptyString(...candidates);
    if (!rawValue) {
      return undefined;
    }

    const resultBlockMatch = rawValue.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
    const candidate = resultBlockMatch?.[1]?.trim() || rawValue.trim();
    if (!candidate) {
      return undefined;
    }
    if (candidate.startsWith('"') && candidate.endsWith('"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === 'string') {
          return parsed.trim();
        }
      } catch {
        return candidate.slice(1, -1).trim();
      }
    }
    return candidate;
  }

  private readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }
}
