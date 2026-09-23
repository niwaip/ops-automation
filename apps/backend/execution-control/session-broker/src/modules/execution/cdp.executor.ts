import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { CdpWorkerClientService } from './cdp-worker-client.service';
import { CdpStepRunnerService } from './cdp-step-runner.service';
import { CdpLoopRunnerService } from './cdp-loop-runner.service';
import {
  type ExecuteStepsOptions,
  type ExecutionResult,
  type TemplateStep,
} from './cdp-executor.types';

export type {
  ExecuteStepsOptions,
  ExecutionResult,
  TemplateLoopDraft,
  TemplateStep,
} from './cdp-executor.types';

@Injectable()
export class CdpExecutor implements OnModuleDestroy {
  private readonly logger = new Logger(CdpExecutor.name);
  private readonly workerClient: CdpWorkerClientService;
  private readonly stepRunner: CdpStepRunnerService;
  private readonly loopRunner: CdpLoopRunnerService;

  constructor(
    @Optional() workerClient?: CdpWorkerClientService,
    @Optional() stepRunner?: CdpStepRunnerService,
    @Optional() loopRunner?: CdpLoopRunnerService
  ) {
    this.workerClient = workerClient || new CdpWorkerClientService();
    const proxyClient = {
      postJson: <T>(path: string, body: Record<string, unknown>) => this.postJson<T>(path, body),
    } as CdpWorkerClientService;
    this.stepRunner = stepRunner || new CdpStepRunnerService(proxyClient);
    this.loopRunner = loopRunner || new CdpLoopRunnerService(proxyClient, this.stepRunner);
  }

  async onModuleDestroy() {
    this.logger.log('CdpExecutor destroyed');
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.workerClient.postJson<T>(path, body);
  }

  async startBrowser(
    sessionId: string,
    url: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.workerClient.startBrowser(sessionId, url);
  }

  async navigateToUrl(
    url: string,
    sessionId?: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.workerClient.navigateToUrl(url, sessionId);
  }

  async executeStep(step: TemplateStep, sessionId?: string): Promise<ExecutionResult> {
    const results = await this.executeSteps([step], sessionId, {}, 'cli');
    return (
      results[0] || {
        success: false,
        step_id: step.step_id,
        action: step.action,
        error: 'Step execution returned no result',
      }
    );
  }

  async executeSteps(
    steps: TemplateStep[],
    sessionId?: string,
    params: Record<string, unknown> = {},
    backend: string = 'cli',
    options: ExecuteStepsOptions = {}
  ): Promise<ExecutionResult[]> {
    this.logger.log(`Executing ${steps.length} steps for session ${sessionId}`);
    this.logger.debug(`Steps: ${JSON.stringify(steps)}, Params: ${JSON.stringify(params)}`);
    const variables: Record<string, unknown> = { ...params };

    try {
      const initResult = await this.postJson<{ success: boolean; message?: string }>(
        '/browser/init',
        { runtimeSessionId: sessionId, backend }
      );
      if (!initResult.success) {
        throw new Error(initResult.message || 'Failed to initialize browser');
      }

      const results: ExecutionResult[] = [];
      const executeSequence = async (sequence: TemplateStep[]): Promise<ExecutionResult | null> => {
        for (const step of sequence) {
          const result = await this.stepRunner.executeSingleStep(step, sessionId, params, backend, variables);
          results.push(result);
          if (!result.success) {
            return result;
          }
        }
        return null;
      };

      const loopPlan = this.loopRunner.buildLoopPlan(steps, options.loopDraft);
      this.workerClient.emitDebugEvent(
        'cdp.executor.ts:executeSteps:plan',
        '[DEBUG] cdpExecutor initialized execution plan',
        {
          sessionId,
          backend,
          stepIds: steps.map((s) => s.step_id),
          hasLoopDraft: Boolean(options.loopDraft),
          hasLoopPlan: Boolean(loopPlan),
          preLoopCount: loopPlan?.preLoopSteps.length || 0,
          iterationCount: loopPlan?.iterationSteps.length || 0,
          postLoopCount: loopPlan?.postLoopSteps.length || 0,
        }
      );

      if (loopPlan) {
        const loopFailure = await this.loopRunner.runLoop(
          loopPlan,
          sessionId,
          params,
          backend,
          variables,
          results,
          executeSequence
        );
        if (loopFailure) {
          return results;
        }
      } else {
        const linearFailure = await executeSequence(steps);
        if (linearFailure) {
          return results;
        }
      }

      this.workerClient.emitDebugEvent(
        'cdp.executor.ts:executeSteps:results',
        '[DEBUG] cdpExecutor finished execution',
        {
          sessionId,
          resultCount: results.length,
          failedCount: results.filter((item) => !item.success).length,
          lastResult: results[results.length - 1] || null,
        }
      );
      return results;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Execution failed: ${errorMsg}`);
      this.workerClient.emitDebugEvent(
        'cdp.executor.ts:executeSteps:error',
        '[DEBUG] cdpExecutor execution failed',
        { sessionId, backend, error: errorMsg }
      );
      return [
        {
          success: false,
          step_id: 'all',
          action: 'batch',
          error: errorMsg,
        },
      ];
    }
  }

  async captureFinalState(
    sessionId?: string,
    backend: string = 'cli',
    extractedPage?: Pick<ExecutionResult, 'text' | 'html'>
  ): Promise<ExecutionResult> {
    return this.workerClient.captureFinalState(
      sessionId,
      backend,
      extractedPage,
      (raw) => this.stepRunner.extractHtmlResult(raw)
    );
  }

  async closeBrowser(sessionId?: string): Promise<void> {
    return this.workerClient.closeBrowser(sessionId);
  }
}
