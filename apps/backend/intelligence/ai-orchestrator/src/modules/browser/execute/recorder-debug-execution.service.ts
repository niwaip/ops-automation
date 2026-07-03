import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { getBrowserWorkerUrl } from '../../../config/service-endpoints';
import { BrowserActionValidatorService, BrowserCommand, BrowserCommandCandidate } from '../intent';
import {
  RecorderObservationService,
  RecorderSnapshotService,
  RecorderSnapshotReuseService,
  RecorderTargetResolutionReuseService,
  RecorderStructureProbeService,
  SnapshotNode,
  SnapshotResolutionState,
} from '../observe';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import type { BrowserExecuteResponse, RecorderDebugObservation } from './recorder-debug.types';

interface PreparedBrowserCommand {
  command: BrowserCommand;
  synthetic: boolean;
}

type RecorderDebugExecutionSession = {
  sessionId?: string;
  backend: string;
  runtimeSessionId: string;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
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
    private readonly recorderSnapshotReuseService: RecorderSnapshotReuseService,
    private readonly recorderTargetResolutionReuseService: RecorderTargetResolutionReuseService,
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
    return this.enrichObservationState(session, observation, snapshotState);
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

  private enrichObservationState(
    session: RecorderDebugExecutionSession,
    observation: RecorderDebugObservation,
    snapshotState: SnapshotResolutionState | null
  ): RecorderDebugObservation {
    const snapshotVersion = (session.lastObservation?.snapshotVersion || 0) + 1;
    const capturedAt = new Date().toISOString();
    const snapshotContentHash = this.buildSnapshotContentHash(snapshotState);
    const observationFingerprint = this.buildObservationFingerprint(observation);
    const reuseAssessment = this.recorderSnapshotReuseService.assessReuse({
      previousObservation: session.lastObservation,
      currentObservation: observation,
      snapshotContentHash,
      observationFingerprint,
      hasSnapshotNodes: Boolean(snapshotState?.nodes.length),
    });
    const reusedResolution = this.recorderTargetResolutionReuseService.mergeReusableCandidates({
      previousObservation: session.lastObservation,
      currentObservation: observation,
      currentSnapshotContentHash: snapshotContentHash,
      reuseEligibility: reuseAssessment.reuseEligibility,
    });
    const candidates = reusedResolution.candidates || observation.candidates || [];
    const candidateTrace = reusedResolution.candidateTrace || observation.candidateTrace || [];
    const inputs = this.enrichObservedRecords(observation.inputs, 'input');
    const buttons = this.enrichObservedRecords(observation.buttons, 'button');

    return {
      ...observation,
      candidates,
      candidateTrace,
      inputs,
      buttons,
      observationVersion: 'v1',
      snapshotId: `${session.runtimeSessionId}:${snapshotVersion}`,
      snapshotVersion,
      ...(snapshotContentHash ? { snapshotContentHash } : {}),
      observationFingerprint,
      reuseEligibility: reuseAssessment.reuseEligibility,
      ...(reuseAssessment.staleReason ? { staleReason: reuseAssessment.staleReason } : {}),
      capturedAt,
      page: {
        url: observation.currentPageUrl,
        title: observation.title,
        snapshotId: `${session.runtimeSessionId}:${snapshotVersion}`,
        snapshotVersion,
        ...(snapshotContentHash ? { snapshotContentHash } : {}),
        observationFingerprint,
        ...(observation.snapshotPath ? { snapshotPath: observation.snapshotPath } : {}),
        capturedAt,
        reuseEligibility: reuseAssessment.reuseEligibility,
        ...(reuseAssessment.staleReason ? { staleReason: reuseAssessment.staleReason } : {}),
      },
      textState: {
        visibleText: observation.text,
        salientTexts: this.buildSalientTexts(observation),
        headings: observation.headings,
        links: observation.links,
      },
      interactiveState: {
        inputs: inputs.map((item) => this.toObservedNode(item, 'input')),
        buttons: buttons.map((item) => this.toObservedNode(item, 'button')),
        candidates: candidates.map((candidate, index) => ({
          ref: candidate.ref,
          diffKey: candidate.ref || candidate.candidateId || `candidate-${index + 1}`,
          role: candidate.role,
          name: candidate.label,
          text: candidate.summary,
          visible: true,
          regionId: typeof candidate.preferredLocator?.value === 'string' ? candidate.preferredLocator.value : undefined,
          ordinal: index + 1,
          attributes: {
            confidence: typeof candidate.score === 'number' ? candidate.score : 0,
          },
        })),
      },
      facts: this.buildPageFacts(observation),
    };
  }

  private enrichObservedRecords(
    records: Array<Record<string, unknown>>,
    kind: 'input' | 'button'
  ): Array<Record<string, unknown>> {
    return records.map((record, index) => {
      const role = this.pickString(record.role, record.tagName, kind);
      const name = this.pickString(record.label, record.labelText, record.placeholder, record.text);
      const text = this.pickString(record.text, record.value, record.labelText);
      const regionId = this.pickString(record.region, record.regionType, `global-${kind}`);
      const contextLabel = this.pickString(record.label, record.labelText, record.stableName);
      const ref = this.pickString(record.ref);
      const ordinal = this.pickNumber(record.ordinal, record.index, record.rowIndex, index);
      const selected = this.pickBoolean(
        record.selected,
        record.checked,
        record.ariaSelected,
        record.ariaPressed
      );
      const disabled = this.pickBoolean(record.disabled);
      const visible = this.pickBoolean(record.visible, true);
      const value = this.pickString(record.value);
      const diffKey = this.buildDiffKey({
        ref,
        role,
        name,
        text,
        contextLabel,
        regionId,
        ordinal,
      });

      return {
        ...record,
        role,
        ...(name ? { name } : {}),
        ...(text ? { text } : {}),
        ...(contextLabel ? { contextLabel } : {}),
        ...(regionId ? { regionId } : {}),
        ...(ordinal !== undefined ? { ordinal } : {}),
        ...(ref ? { ref } : {}),
        diffKey,
        ...(selected !== undefined ? { selected } : {}),
        ...(disabled !== undefined ? { disabled } : {}),
        ...(visible !== undefined ? { visible } : {}),
        ...(value ? { value } : {}),
        attributes: this.buildRecordAttributes(record),
      };
    });
  }

  private buildRecordAttributes(
    record: Record<string, unknown>
  ): Record<string, string | boolean | number> {
    const rawEntries: Array<[string, unknown]> = [
      ['checked', record.checked],
      ['ariaSelected', record.ariaSelected],
      ['ariaPressed', record.ariaPressed],
      ['dataState', record.dataState],
      ['stableName', record.stableName],
    ];
    return rawEntries.reduce<Record<string, string | boolean | number>>((accumulator, [key, value]) => {
      if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
        accumulator[key] = value;
      }
      return accumulator;
    }, {});
  }

  private toObservedNode(
    record: Record<string, unknown>,
    kind: 'input' | 'button'
  ): {
    ref?: string;
    diffKey?: string;
    role?: string;
    name?: string;
    text?: string;
    contextLabel?: string;
    selected?: boolean;
    disabled?: boolean;
    visible?: boolean;
    value?: string;
    regionId?: string;
    ordinal?: number;
    attributes?: Record<string, string | boolean | number>;
  } {
    return {
      ref: this.pickString(record.ref),
      diffKey: this.pickString(record.diffKey, this.buildDiffKey({ role: kind })),
      role: this.pickString(record.role, kind),
      name: this.pickString(record.name, record.label, record.labelText),
      text: this.pickString(record.text),
      contextLabel: this.pickString(record.contextLabel, record.label, record.labelText),
      selected: this.pickBoolean(record.selected),
      disabled: this.pickBoolean(record.disabled),
      visible: this.pickBoolean(record.visible, true),
      value: this.pickString(record.value),
      regionId: this.pickString(record.regionId, record.region),
      ordinal: this.pickNumber(record.ordinal, record.index),
      attributes:
        record.attributes && typeof record.attributes === 'object'
          ? (record.attributes as Record<string, string | boolean | number>)
          : {},
    };
  }

  private buildSnapshotContentHash(snapshotState: SnapshotResolutionState | null): string | undefined {
    if (!snapshotState?.nodes.length) {
      return undefined;
    }
    const normalized = snapshotState.nodes
      .map((node) => [node.role, node.name || '', node.text || '', node.contextLabel || ''].join('|'))
      .join('\n');
    return createHash('sha1').update(normalized).digest('hex');
  }

  private buildObservationFingerprint(observation: RecorderDebugObservation): string {
    const normalized = [
      observation.currentPageUrl || '',
      observation.title || '',
      ...(observation.headings || []).slice(0, 8),
      ...(observation.buttons || []).slice(0, 8).map((item) => this.pickString(item.text, item.name) || ''),
      ...(observation.inputs || []).slice(0, 6).map((item) => this.pickString(item.label, item.name) || ''),
    ].join('|');
    return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  }

  private buildSalientTexts(observation: RecorderDebugObservation): string[] {
    const values = [
      observation.title || '',
      ...(observation.headings || []),
      ...(observation.links || []).slice(0, 8),
      ...(observation.buttons || [])
        .slice(0, 8)
        .map((item) => this.pickString(item.text, item.name) || ''),
    ]
      .map((item) => item.trim())
      .filter(Boolean);
    return [...new Set(values)].slice(0, 16);
  }

  private buildPageFacts(observation: RecorderDebugObservation): Array<{
    type: string;
    value?: string | number | boolean;
    confidence?: number;
    source?: 'structure' | 'text' | 'visual';
  }> {
    const facts: Array<{
      type: string;
      value?: string | number | boolean;
      confidence?: number;
      source?: 'structure' | 'text' | 'visual';
    }> = [];
    if (observation.inputs.length > 0) {
      facts.push({
        type: 'form-field-count',
        value: observation.inputs.length,
        confidence: 0.9,
        source: 'structure',
      });
    }
    if ((observation.rows?.length || 0) > 0) {
      facts.push({
        type: 'selectable-list',
        value: observation.rows?.length || 0,
        confidence: 0.8,
        source: 'structure',
      });
    }
    if (/(登录|登入|log\s*in|sign\s*in|ログイン)/i.test(`${observation.title || ''} ${observation.text || ''}`)) {
      facts.push({
        type: 'location',
        value: 'login',
        confidence: 0.8,
        source: 'text',
      });
    }
    return facts;
  }

  private buildDiffKey(input: {
    ref?: string;
    role?: string;
    name?: string;
    text?: string;
    contextLabel?: string;
    regionId?: string;
    ordinal?: number;
  }): string {
    if (input.ref) {
      return input.ref;
    }
    const roleNameKey = [input.role, input.name, input.contextLabel].filter(Boolean).join('|');
    if (roleNameKey) {
      return roleNameKey;
    }
    return [input.regionId || 'global', input.ordinal ?? 0, input.text || 'node'].join('|');
  }

  private pickString(...values: unknown[]): string | undefined {
    const found = values.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof found === 'string' ? found.trim() : undefined;
  }

  private pickBoolean(...values: unknown[]): boolean | undefined {
    for (const value of values) {
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        if (value === 'true') {
          return true;
        }
        if (value === 'false') {
          return false;
        }
      }
    }
    return undefined;
  }

  private pickNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  }
}
