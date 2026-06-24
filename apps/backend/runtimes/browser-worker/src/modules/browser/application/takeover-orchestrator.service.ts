import { Injectable, NotFoundException } from '@nestjs/common';
import { BrowserExecutionBackend, MCPCommand } from '../adapters/browser-execution.adapter';
import { BrowserExecutionBackendDto } from '../../../dto/worker.dto';
import { BrowserCommandService } from './browser-command.service';
import { BrowserSessionService } from './browser-session.service';
import { CodegenScriptParserService } from './codegen-script-parser.service';
import { BrowserSessionRegistry } from '../infrastructure/browser-session.registry';
import {
  ObservationSnapshot,
  ResumeAfterTakeoverRequest,
  ResumeAfterTakeoverResponse,
  StartTakeoverRequest,
  StartTakeoverResponse,
  StopTakeoverRequest,
  StopTakeoverResponse,
  TakeoverSessionState,
} from '../domain/takeover.types';
import { RecorderService } from '../../recorder/recorder.service';
import { WorkerService } from '../../worker/worker.service';

@Injectable()
export class TakeoverOrchestratorService {
  private readonly takeoverSessions = new Map<string, TakeoverSessionState>();

  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly browserCommandService: BrowserCommandService,
    private readonly recorderService: RecorderService,
    private readonly parser: CodegenScriptParserService,
    private readonly registry: BrowserSessionRegistry,
    private readonly workerService: WorkerService
  ) {}

  async startTakeover(input: StartTakeoverRequest): Promise<StartTakeoverResponse> {
    const runtime = this.registry.get(input.runtimeSessionId);
    const worker = await this.workerService.getWorkerByRuntimeSessionId(input.runtimeSessionId);
    if (!runtime && !worker) {
      throw new NotFoundException('Runtime session not found');
    }

    await this.browserSessionService.freeze({
      runtimeSessionId: input.runtimeSessionId,
      backend: this.toBackendDto(input.backend),
      reason: input.reason ?? 'Takeover requested after failure',
    });

    const startUrl = runtime?.currentUrl || 'about:blank';
    const recording = await this.recorderService.startTakeoverRecording(input.runtimeSessionId, {
      startUrl,
      reuseExistingPage: true,
    });

    const sessionState: TakeoverSessionState = {
      takeoverSessionId: recording.sessionId,
      runtimeSessionId: input.runtimeSessionId,
      sessionId: input.sessionId,
      backend: input.backend,
      status: 'recording',
      startedAt: new Date().toISOString(),
      failedStepId: input.failedStepId,
      failedCommand: input.failedCommand,
      reason: input.reason,
    };
    this.takeoverSessions.set(input.runtimeSessionId, sessionState);

    this.registry.patch(input.runtimeSessionId, {
      controlMode: 'HUMAN_CONTROL',
      takeoverStatus: 'recording',
      activeTakeoverSessionId: recording.sessionId,
      lastFailedStepId: input.failedStepId,
      lastFailureReason: input.failedCommand?.errorMessage ?? input.reason,
    });

    return {
      success: true,
      runtimeSessionId: input.runtimeSessionId,
      takeoverSessionId: recording.sessionId,
      status: 'recording',
      controlMode: 'HUMAN_CONTROL',
      endpoints: worker?.endpoints
        ? {
            novnc: worker.endpoints.novnc,
            cdp: worker.endpoints.cdp,
          }
        : runtime?.endpoints,
      startedAt: sessionState.startedAt,
    };
  }

  async stopTakeover(input: StopTakeoverRequest): Promise<StopTakeoverResponse> {
    const takeoverSession = this.getRequiredTakeoverSession(
      input.runtimeSessionId,
      input.takeoverSessionId
    );
    const stopped = await this.recorderService.stopTakeoverRecording(input.runtimeSessionId);
    const patchSteps = this.parser.parse(stopped.rawScript, {
      backend: takeoverSession.backend,
      source: 'manual_takeover',
      runtimeSessionId: input.runtimeSessionId,
    });
    const observation = await this.captureObservation(
      input.runtimeSessionId,
      takeoverSession.backend as BrowserExecutionBackend
    );
    const patchScript = {
      rawScript: stopped.rawScript,
      lineCount: stopped.rawScript ? stopped.rawScript.split('\n').length : 0,
      parserVersion: 'v1',
      recordedAt: stopped.recordedAt,
    };

    const nextState: TakeoverSessionState = {
      ...takeoverSession,
      status: 'ready_to_resume',
      stoppedAt: new Date().toISOString(),
      patchScript,
      patchSteps,
      observation,
    };
    this.takeoverSessions.set(input.runtimeSessionId, nextState);

    this.registry.patch(input.runtimeSessionId, {
      takeoverStatus: 'ready_to_resume',
      lastObservationAt: observation.timestamp,
    });

    return {
      success: true,
      runtimeSessionId: input.runtimeSessionId,
      takeoverSessionId: input.takeoverSessionId,
      status: 'ready_to_resume',
      patchScript,
      patchSteps,
      observation,
    };
  }

  async resumeTakeover(input: ResumeAfterTakeoverRequest): Promise<ResumeAfterTakeoverResponse> {
    const takeoverSession = input.takeoverSessionId
      ? this.getRequiredTakeoverSession(input.runtimeSessionId, input.takeoverSessionId)
      : this.takeoverSessions.get(input.runtimeSessionId);

    this.registry.patch(input.runtimeSessionId, {
      controlMode: 'AGENT_RUNNING',
      takeoverStatus: 'resuming',
    });

    await this.browserSessionService.resume({
      runtimeSessionId: input.runtimeSessionId,
      backend: this.toBackendDto(input.backend),
    });

    const execution = await this.browserCommandService.executeCommands(input.resumeCommands, {
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      includeSteps: true,
    });

    const status = execution.success ? 'completed' : 'error';
    this.registry.patch(input.runtimeSessionId, {
      takeoverStatus: status,
    });

    if (takeoverSession) {
      this.takeoverSessions.set(input.runtimeSessionId, {
        ...takeoverSession,
        status,
        strategy: input.strategy,
        resumeCommands: input.resumeCommands,
      });
    }

    return {
      success: execution.success,
      runtimeSessionId: input.runtimeSessionId,
      status,
      results: execution.results as Array<Record<string, unknown>>,
      generatedSteps: execution.steps,
    };
  }

  getTakeoverState(runtimeSessionId: string): {
    runtimeSessionId: string;
    runtime?: ReturnType<BrowserSessionRegistry['get']>;
    takeover?: TakeoverSessionState;
  } {
    return {
      runtimeSessionId,
      runtime: this.registry.get(runtimeSessionId),
      takeover: this.takeoverSessions.get(runtimeSessionId),
    };
  }

  private getRequiredTakeoverSession(
    runtimeSessionId: string,
    takeoverSessionId: string
  ): TakeoverSessionState {
    const session = this.takeoverSessions.get(runtimeSessionId);
    if (!session || session.takeoverSessionId !== takeoverSessionId) {
      throw new NotFoundException('Takeover session not found');
    }
    return session;
  }

  private async captureObservation(
    runtimeSessionId: string,
    backend: BrowserExecutionBackend
  ): Promise<ObservationSnapshot> {
    const pageState = await this.browserCommandService.inspectState({
      runtimeSessionId,
      backend: this.toBackendDto(backend),
    });
    const execution = await this.browserCommandService.executeCommands(
      [
        { tool: 'snapshot', params: {}, description: 'Capture page snapshot after takeover' },
        {
          tool: 'get_text',
          params: { max_length: 4000 },
          description: 'Read visible page text after takeover',
        },
      ] satisfies MCPCommand[],
      {
        runtimeSessionId,
        backend,
        includeArtifacts: true,
        includeSteps: false,
      }
    );

    const snapshotResult = execution.results.find((item) => item?.command === 'snapshot') as
      | { snapshot?: { path?: string }; data?: { path?: string } }
      | undefined;
    const textResult = execution.results.find(
      (item) => item?.command === 'get_text' || item?.command === 'read_page'
    ) as { data?: { text?: string }; text?: string } | undefined;

    return {
      currentPageUrl: pageState.pageUrl,
      title: pageState.pageTitle,
      text: textResult?.data?.text || textResult?.text,
      snapshotPath: snapshotResult?.snapshot?.path || snapshotResult?.data?.path,
      timestamp: new Date().toISOString(),
    };
  }

  private toBackendDto(
    backend: BrowserExecutionBackend | 'cli' | 'chrome-devtools'
  ): BrowserExecutionBackendDto {
    return backend === 'chrome-devtools'
      ? BrowserExecutionBackendDto.CHROME_DEVTOOLS
      : BrowserExecutionBackendDto.CLI;
  }
}
