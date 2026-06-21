import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs/promises';
import { getBrowserWorkerUrl } from '../../../config/service-endpoints';
import { BrowserActionValidatorService } from '../intent/browser-action-validator.service';
import { BrowserCommand, BrowserCommandCandidate } from '../intent/browser-command.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderObservationService } from '../observe/recorder-observation.service';
import {
  RecorderSnapshotService,
  SnapshotNode,
  SnapshotResolutionState,
} from '../observe/recorder-snapshot.service';
import { RecorderStructureProbeService } from '../observe/recorder-structure-probe.service';
import type { BrowserExecuteResponse, RecorderDebugObservation } from './recorder-debug.service';

interface PreparedBrowserCommand {
  command: BrowserCommand;
  synthetic: boolean;
}

type RecorderDebugExecutionSession = {
  sessionId?: string;
  backend: string;
  runtimeSessionId: string;
  currentPageUrl?: string;
};

@Injectable()
export class RecorderDebugExecutionService {
  private readonly logger = new Logger(RecorderDebugExecutionService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();
  private readonly defaultPostCommandWaitMs = parseInt(
    process.env.RECORDER_DEBUG_POST_COMMAND_WAIT_MS || '800',
    10
  );
  private readonly postCommandWaitStrategy = (
    process.env.RECORDER_DEBUG_POST_COMMAND_WAIT_STRATEGY || 'final_only'
  ).toLowerCase();
  private readonly observeTimeoutMs = parseInt(
    process.env.RECORDER_DEBUG_OBSERVE_TIMEOUT_MS || '15000',
    10
  );

  constructor(
    private readonly browserActionValidatorService: BrowserActionValidatorService,
    private readonly recorderDebugChatSupportService: RecorderDebugChatSupportService,
    private readonly recorderObservationService: RecorderObservationService,
    private readonly recorderSnapshotService: RecorderSnapshotService,
    private readonly recorderStructureProbeService: RecorderStructureProbeService
  ) {}

  async observePage(session: RecorderDebugExecutionSession): Promise<RecorderDebugObservation> {
    const response = await this.executeBrowserCommands(
      session,
      [
        {
          tool: 'snapshot',
          params: {},
          description: 'Capture accessibility snapshot',
        },
        {
          tool: 'evaluate',
          params: { script: this.recorderStructureProbeService.buildStructureProbeScript() },
          description: 'Inspect current page structure',
        },
        {
          tool: 'get_text',
          params: { max_length: 1600 },
          description: 'Read visible page text',
        },
      ],
      {
        timeoutMs: this.observeTimeoutMs,
        skipValidation: true,
      }
    );

    const evaluateResult = response.results.find((item) => item.command === 'evaluate') || {};
    const textResult =
      response.results.find(
        (item) => item.command === 'get_text' || item.command === 'read_page'
      ) || {};

    const structure =
      this.recorderStructureProbeService.parseJsonResult(
        evaluateResult?.data?.result || evaluateResult?.result || evaluateResult?.stdout
      ) || {};
    const snapshotState = await this.loadSnapshotResolutionState(response);
    const snapshotObservation = snapshotState
      ? this.buildObservationFromSnapshotState(snapshotState)
      : undefined;
    const observation = this.recorderStructureProbeService.buildObservationFromStructure({
      structure,
      textResult,
      snapshotObservation,
    }) as RecorderDebugObservation;

    const { candidates, trace } = this.buildCandidatesAndTrace(observation);
    observation.candidates = candidates;
    observation.candidateTrace = trace;
    observation.suggestedParameters = this.inferSuggestedParameters(observation);
    return observation;
  }

  async executeBrowserCommands(
    session: RecorderDebugExecutionSession,
    commands: BrowserCommand[],
    options?: { appendDefaultWait?: boolean; timeoutMs?: number; skipValidation?: boolean }
  ): Promise<BrowserExecuteResponse> {
    if (!options?.skipValidation) {
      const validation = this.browserActionValidatorService.assessCommands(commands, {
        currentPageUrl: session.currentPageUrl,
      });
      if (validation.forbidden) {
        return {
          success: false,
          results: [],
          message: this.recorderDebugChatSupportService.buildActionValidationReason(validation),
          steps: [],
          executedCommands: [],
        };
      }
    }

    const preparedCommands = this.prepareExecutionQueue(commands, options);
    const aggregated: BrowserExecuteResponse = {
      success: true,
      results: [],
      steps: [],
      executedCommands: [],
    };
    let snapshotState: SnapshotResolutionState | null = null;

    for (const prepared of preparedCommands) {
      const resolvedCommand = this.rewriteCommandWithSnapshotRefs(prepared.command, snapshotState);
      const response = await this.executeBrowserCommandBatch(session, [resolvedCommand], options);

      aggregated.results.push(...(Array.isArray(response.results) ? response.results : []));
      if (Array.isArray(response.steps) && aggregated.steps) {
        aggregated.steps.push(...response.steps);
      }

      if (!response.success) {
        aggregated.success = false;
        aggregated.message =
          aggregated.message ||
          response.message ||
          this.recorderDebugChatSupportService.extractExecutionError(response);
        break;
      }

      if (!prepared.synthetic && aggregated.executedCommands) {
        aggregated.executedCommands.push(
          this.enrichCommandWithExecutionStep(resolvedCommand, response)
        );
      }

      if (resolvedCommand.tool === 'snapshot') {
        snapshotState = await this.loadSnapshotResolutionState(response);
      }
    }

    if (!aggregated.steps?.length) {
      delete aggregated.steps;
    }
    if (!aggregated.executedCommands?.length) {
      delete aggregated.executedCommands;
    }

    return aggregated;
  }

  mergeObservationWithExecution<TObservation extends { currentPageUrl?: string }>(
    observation: TObservation,
    execution: BrowserExecuteResponse
  ): TObservation {
    const nextUrl = this.extractUrlFromExecution(execution);
    if (!nextUrl) {
      return observation;
    }

    return {
      ...observation,
      currentPageUrl: nextUrl,
    };
  }

  async executeBrowserCommandBatch(
    session: RecorderDebugExecutionSession,
    commands: BrowserCommand[],
    options?: { timeoutMs?: number }
  ): Promise<BrowserExecuteResponse> {
    const response = await axios.post<BrowserExecuteResponse>(
      `${this.browserWorkerUrl}/browser/execute`,
      {
        backend: session.backend,
        runtimeSessionId: session.runtimeSessionId,
        commands,
      },
      {
        timeout: options?.timeoutMs || 120000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    return response.data;
  }

  extractUrlFromExecution(execution: BrowserExecuteResponse): string | undefined {
    const results = Array.isArray(execution.results) ? execution.results : [];
    for (let i = results.length - 1; i >= 0; i--) {
      const item = results[i] || {};
      const data = item.data || {};
      const directUrl = typeof data.url === 'string' ? data.url.trim() : undefined;
      if (directUrl) {
        return directUrl;
      }
      const landedUrl = typeof data.landedUrl === 'string' ? data.landedUrl.trim() : undefined;
      if (landedUrl) {
        return landedUrl;
      }
      const stdout = typeof item.stdout === 'string' ? item.stdout : '';
      const stdoutMatch = stdout.match(/- Page URL:\s*(.+)/);
      if (stdoutMatch?.[1]) {
        return stdoutMatch[1].trim();
      }
    }

    return undefined;
  }

  private requiresSnapshotBeforeAction(command: BrowserCommand): boolean {
    return ['click', 'fill', 'hover', 'drag', 'press_key', 'type_text'].includes(command.tool);
  }

  prepareExecutionQueue(
    commands: BrowserCommand[],
    options?: { appendDefaultWait?: boolean; timeoutMs?: number }
  ): PreparedBrowserCommand[] {
    const prepared: PreparedBrowserCommand[] = [];

    for (const command of commands) {
      if (this.requiresSnapshotBeforeAction(command)) {
        prepared.push({
          synthetic: true,
          command: {
            tool: 'snapshot',
            params: {},
            description: '执行动作前先获取页面快照',
          },
        });
      }

      prepared.push({ command, synthetic: false });

      if (
        options?.appendDefaultWait &&
        this.postCommandWaitStrategy === 'per_command' &&
        this.defaultPostCommandWaitMs > 0 &&
        command.tool !== 'wait'
      ) {
        prepared.push({
          synthetic: true,
          command: {
            tool: 'wait',
            params: { duration: this.defaultPostCommandWaitMs },
            description: `等待 ${this.defaultPostCommandWaitMs}ms`,
          },
        });
      }
    }

    if (
      options?.appendDefaultWait &&
      this.postCommandWaitStrategy !== 'none' &&
      this.postCommandWaitStrategy !== 'per_command' &&
      this.defaultPostCommandWaitMs > 0
    ) {
      const lastCommand = commands[commands.length - 1];
      if (lastCommand && lastCommand.tool !== 'wait') {
        prepared.push({
          synthetic: true,
          command: {
            tool: 'wait',
            params: { duration: this.defaultPostCommandWaitMs },
            description: `等待 ${this.defaultPostCommandWaitMs}ms`,
          },
        });
      }
    }

    return prepared;
  }

  private enrichCommandWithExecutionStep(
    command: BrowserCommand,
    execution: BrowserExecuteResponse
  ): BrowserCommand {
    const step = Array.isArray(execution.steps) ? execution.steps[0] : undefined;
    if (!step || typeof step !== 'object') {
      return command;
    }

    const locator =
      step.locator && typeof step.locator === 'object'
        ? (step.locator as BrowserCommand['locator'])
        : undefined;
    const params =
      step.params && typeof step.params === 'object'
        ? (step.params as Record<string, unknown>)
        : command.params;

    return {
      ...command,
      params,
      ...(locator ? { locator } : {}),
    };
  }

  rewriteCommandWithSnapshotRefs(
    command: BrowserCommand,
    snapshotState: SnapshotResolutionState | null
  ): BrowserCommand {
    return this.recorderSnapshotService.rewriteCommandWithSnapshotRefs(command, snapshotState);
  }

  private async loadSnapshotResolutionState(
    execution: BrowserExecuteResponse
  ): Promise<SnapshotResolutionState | null> {
    const results = Array.isArray(execution.results) ? execution.results : [];
    const snapshotResult = [...results].reverse().find((item) => item?.command === 'snapshot');
    const snapshotContentFromData = this.extractSnapshotContentFromData(snapshotResult);
    if (snapshotContentFromData) {
      return {
        nodes: this.parseSnapshotNodes(snapshotContentFromData),
      };
    }

    const snapshotContent = this.extractSnapshotContentFromStdout(snapshotResult);
    if (snapshotContent) {
      return {
        nodes: this.parseSnapshotNodes(snapshotContent),
      };
    }

    const snapshotPath = this.extractSnapshotPath(snapshotResult);
    if (!snapshotPath) {
      return null;
    }

    try {
      const content = await fs.readFile(snapshotPath, 'utf8');
      return {
        path: snapshotPath,
        nodes: this.parseSnapshotNodes(content),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to read snapshot file ${snapshotPath}: ${message}`);
      return null;
    }
  }

  private extractSnapshotPath(result?: Record<string, any>): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const snapshot = result.snapshot;
    if (snapshot && typeof snapshot.path === 'string' && snapshot.path.trim().length > 0) {
      return snapshot.path.trim();
    }

    const data = result.data;
    if (data && typeof data.path === 'string' && data.path.trim().length > 0) {
      return data.path.trim();
    }

    return undefined;
  }

  private extractSnapshotContentFromData(result?: Record<string, any>): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const data = result.data;
    if (data && typeof data.content === 'string' && data.content.trim().length > 0) {
      return data.content.trim();
    }

    return undefined;
  }

  private extractSnapshotContentFromStdout(result?: Record<string, any>): string | undefined {
    if (!result || typeof result.stdout !== 'string') {
      return undefined;
    }

    const stdout = result.stdout;
    const pageMarkerIndex = stdout.indexOf('\n### Page');
    const ranCodeMarkerIndex = stdout.indexOf('\n### Ran Playwright code');
    const endIndex =
      pageMarkerIndex >= 0
        ? pageMarkerIndex
        : ranCodeMarkerIndex >= 0
          ? ranCodeMarkerIndex
          : stdout.length;
    const content = stdout.slice(0, endIndex).trim();

    return content.length > 0 ? content : undefined;
  }

  parseSnapshotNodes(content: string): SnapshotNode[] {
    return this.recorderSnapshotService.parseSnapshotNodes(content);
  }

  private buildObservationFromSnapshotState(
    snapshotState: SnapshotResolutionState
  ): Pick<RecorderDebugObservation, 'inputs' | 'buttons' | 'headings' | 'links' | 'snapshotPath'> {
    return this.recorderSnapshotService.buildObservationFromSnapshotState(snapshotState);
  }

  private buildCandidatesAndTrace(observation: RecorderDebugObservation): {
    candidates: BrowserCommandCandidate[];
    trace: Array<{
      candidateId: string;
      source: string;
      kind: string;
      reasons: string[];
      summary: string;
    }>;
  } {
    return this.recorderObservationService.buildCandidatesAndTrace(observation);
  }

  private inferSuggestedParameters(
    observation: Pick<RecorderDebugObservation, 'inputs' | 'buttons' | 'title' | 'text'>
  ): Array<{ name: string; label: string; required: boolean; reason: string }> {
    return this.recorderObservationService.inferSuggestedParameters(observation);
  }
}
