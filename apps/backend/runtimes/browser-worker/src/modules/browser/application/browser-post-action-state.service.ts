import { Injectable } from '@nestjs/common';
import { BrowserPageStateDto, ExecuteStepDto, ExecuteStepResultDto } from '../../../dto/worker.dto';

@Injectable()
export class BrowserPostActionStateService {
  async observe(input: {
    dto: ExecuteStepDto;
    result: ExecuteStepResultDto;
    inspect: () => Promise<BrowserPageStateDto>;
  }): Promise<Pick<ExecuteStepResultDto, 'pageState' | 'executionState' | 'attemptedAt' | 'observedAt' | 'postCheck' | 'warningCodes'>> {
    const attemptedAt = new Date().toISOString();
    let pageState = input.result.pageState;
    let observationFailed = false;
    try {
      pageState = await input.inspect();
    } catch {
      observationFailed = true;
    }
    const target = navigationTarget(input.dto);
    const targetReached = target && pageState?.pageUrl ? urlsEquivalent(target, pageState.pageUrl) : undefined;
    const meaningfulPage = Boolean(pageState?.pageUrl && !isBrowserErrorPage(pageState.pageUrl));
    const executionState = input.result.success ? 'completed' : targetReached && meaningfulPage ? 'ambiguous' : 'failed';
    return {
      attemptedAt,
      observedAt: pageState?.observedAt || new Date().toISOString(),
      ...(pageState ? { pageState } : {}),
      executionState,
      postCheck: {
        inspected: !observationFailed,
        ...(targetReached !== undefined ? { targetReached } : {}),
        evidence: target
          ? [{ code: 'navigation_target', passed: targetReached ?? 'unknown', expected: target, actual: pageState?.pageUrl }]
          : [],
      },
      ...(observationFailed ? { warningCodes: ['POST_STATE_OBSERVATION_FAILED'] } : {}),
    };
  }
}

function navigationTarget(dto: ExecuteStepDto): string | undefined {
  if (dto.action !== 'goto' && dto.action !== 'navigate') return undefined;
  const argUrl = typeof dto.args?.url === 'string' ? dto.args.url.trim() : '';
  return argUrl || dto.target?.trim() || undefined;
}

function urlsEquivalent(expected: string, actual: string): boolean {
  try {
    const left = new URL(expected);
    const right = new URL(actual);
    return left.protocol === right.protocol && left.hostname === right.hostname && left.port === right.port && left.pathname === right.pathname && left.search === right.search && left.hash === right.hash;
  } catch {
    return expected === actual;
  }
}

function isBrowserErrorPage(url: string): boolean {
  return /^(?:chrome-error:|about:neterror|data:text\/html,chromewebdata)/iu.test(url);
}
