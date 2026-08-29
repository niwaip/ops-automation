import { Injectable, Optional } from '@nestjs/common';
import axios from 'axios';
import { BrowserRecordingRuntimeStep } from '../compiler/browser-recording-runtime.types';
import { CapabilityReleaseBrowserSessionBrokerService } from './capability-release-browser-session-broker.service';

type BrowserBranchEvaluationResult = {
  outcome: 'continue' | 'stop' | 'takeover';
  message?: string;
  error?: string;
  takeover?: boolean;
  takeoverReason?: string;
};

@Injectable()
export class CapabilityReleaseBrowserRuntimeSupportService {
  constructor(
    @Optional()
    private readonly browserSessionBroker?: CapabilityReleaseBrowserSessionBrokerService
  ) {}

  reportApproveThresholdDebug(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    msg: string,
    data: Record<string, unknown>,
    runId = 'pre-fix'
  ): void {
    const localFs = require('fs') as typeof import('fs');
    const envPaths = [
      '/app/.dbg/gross-margin-branch.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/gross-margin-branch.env',
      '/app/.dbg/approve-threshold-param.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/approve-threshold-param.env',
    ];
    let serverUrl = 'http://host.docker.internal:7777/event';
    let sessionId = 'gross-margin-branch';
    for (const envPath of envPaths) {
      try {
        const envContent = localFs.readFileSync(envPath, 'utf8');
        const resolvedUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim();
        const resolvedSessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim();
        if (resolvedUrl) {
          serverUrl = resolvedUrl;
        }
        if (resolvedSessionId) {
          sessionId = resolvedSessionId;
        }
        break;
      } catch {}
    }
    const payload = {
      sessionId,
      runId,
      hypothesisId,
      location: 'capability-release-browser-runtime.service',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    };
    void fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .catch(() =>
        fetch('http://host.docker.internal:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => undefined)
      );
  }

  extractBrowserStepText(output?: Record<string, unknown>): string {
    const rawValue =
      (typeof output?.text === 'string' && output.text) ||
      (typeof output?.stdout === 'string' && output.stdout) ||
      '';
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return '';
    }

    const resultBlockMatch = trimmed.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
    const candidate = resultBlockMatch?.[1]?.trim() || trimmed;
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

  extractLoopPageSignalValue(output: unknown, key: string): unknown {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return undefined;
    }
    const keyParts = trimmedKey
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);
    let current: unknown = output;
    for (const part of keyParts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  evaluateLoopStopCondition(conditionFn: string, value: unknown): boolean {
    try {
      const evaluator = new Function(
        'value',
        `const fn = (value) => ${conditionFn}; return fn(value);`
      ) as (input: unknown) => unknown;
      return Boolean(evaluator(value));
    } catch {
      if (typeof value === 'number') {
        return value === 0;
      }
      if (typeof value === 'string') {
        return value.trim().length === 0;
      }
      return value === false || value == null;
    }
  }

  evaluateBrowserBranchStep(
    step: Pick<BrowserRecordingRuntimeStep, 'branch'>,
    variables: Record<string, unknown>
  ): BrowserBranchEvaluationResult {
    const branch = step.branch;
    if (!branch?.conditionFn) {
      return {
        outcome: 'stop',
        error: 'branch step missing conditionFn',
      };
    }

    try {
      const evaluator = new Function(
        'ctx',
        `const fn = ${branch.conditionFn}; return fn(ctx);`
      ) as (ctx: Record<string, unknown>) => unknown;
      const matched = Boolean(evaluator(variables));
      const outcome = matched ? branch.onMatch : branch.onMismatch;

      if (outcome === 'continue') {
        return {
          outcome: 'continue',
          message: matched ? '条件成立，继续执行' : '条件不成立，但配置为继续执行',
        };
      }
      if (outcome === 'stop') {
        return {
          outcome: 'stop',
          error: matched ? '条件成立，按配置停止执行' : '条件不满足，按配置停止执行',
          message: branch.description || '条件分歧停止执行',
        };
      }
      return {
        outcome: 'takeover',
        takeover: true,
        error: branch.takeoverReason || '条件不满足，需要人工接管',
        message: branch.description || '条件分歧触发人工接管',
        takeoverReason: branch.takeoverReason || '条件不满足，需要人工接管',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outcome: 'stop',
        error: `执行条件表达式失败: ${message}`,
      };
    }
  }

  async freezeBrowserRuntimeSession(
    browserWorkerUrl: string,
    runtimeSessionId: string,
    backend: string,
    reason: string
  ): Promise<void> {
    if (this.browserSessionBroker) {
      try {
        await this.browserSessionBroker.freeze(runtimeSessionId, reason);
        return;
      } catch {
        // Compatibility fallback for legacy sessions created before the
        // session-broker invariant was introduced.
      }
    }
    await axios
      .post(
        `${browserWorkerUrl}/browser/freeze`,
        {
          runtimeSessionId,
          backend,
          reason,
        },
        { timeout: 30000 }
      )
      .catch(() => undefined);
  }
}
