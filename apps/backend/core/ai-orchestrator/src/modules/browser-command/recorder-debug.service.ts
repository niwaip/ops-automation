import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs/promises';
import { BrowserCommand, BrowserCommandService } from './browser-command.service';
import { ModelService } from '../model/model.service';
import { RedisService } from '../redis/redis.service';

type RecorderDebugBackend = 'cli' | 'chrome-devtools' | 'mcp';
type RecorderDebugTurnRole = 'user' | 'assistant' | 'system';

interface BrowserExecuteResponse {
  success: boolean;
  results: Array<Record<string, any>>;
  message?: string;
  steps?: Array<Record<string, any>>;
  executedCommands?: BrowserCommand[];
}

interface PreparedBrowserCommand {
  command: BrowserCommand;
  synthetic: boolean;
}

interface SnapshotNode {
  ref: string;
  role: string;
  name?: string;
  text?: string;
  line: string;
}

interface SnapshotResolutionState {
  path?: string;
  nodes: SnapshotNode[];
}

interface BrowserInitResponse {
  success: boolean;
  message: string;
}

export interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  inputs: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
  headings: string[];
  links: string[];
  suggestedParameters: Array<{
    name: string;
    label: string;
    required: boolean;
    reason: string;
  }>;
  snapshotPath?: string;
}

export interface RecorderDebugExportArtifacts {
  script: string;
  guidance: string;
  skillDraft: {
    name: string;
    description: string;
    invocation: string;
    parameterOnly: true;
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    usageNotes: string[];
    usageMarkdown: string;
    publishPayload: {
      name: string;
      description: string;
      triggerKeywords: string[];
      paramsSchema: {
        properties: Record<string, {
          type: 'string' | 'number' | 'date' | 'boolean';
          description: string;
          required?: boolean;
          default?: string | number | boolean;
          extractionPrompt?: string;
        }>;
        required: string[];
      };
      executionFlowTemplateIds: string[];
      executionFlow: Array<Record<string, unknown>>;
      tools: string[];
      apiEndpoints: {
        runtimeMetadata: Record<string, unknown>;
      };
    };
    executionPlan: {
      backend: RecorderDebugBackend;
      runtimeSessionId: string;
      commands: BrowserCommand[];
    };
    commands: BrowserCommand[];
  };
}

interface RecorderDebugTurn {
  role: RecorderDebugTurnRole;
  content: string;
  timestamp: string;
  commands?: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  observation?: RecorderDebugObservation;
  exportArtifacts?: RecorderDebugExportArtifacts;
}

interface RecorderDebugSession {
  sessionId: string;
  runtimeSessionId: string;
  backend: RecorderDebugBackend;
  browserInitialized: boolean;
  currentPageUrl?: string;
  lastObservation?: RecorderDebugObservation;
  history: RecorderDebugTurn[];
  executedCommands: BrowserCommand[];
  createdAt: string;
  updatedAt: string;
}

interface RecorderExportMetadata {
  name: string;
  description: string;
}

const FORBIDDEN_TEMPLATE_PARAM_TOKENS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'apikey',
] as const;

export interface RecorderDebugChatRequest {
  sessionId?: string;
  runtimeSessionId?: string;
  message: string;
  backend?: RecorderDebugBackend;
  modelId?: string;
  userRoles?: string[];
}

export interface RecorderDebugChatResponse {
  sessionId: string;
  runtimeSessionId: string;
  reply: string;
  status: 'executed' | 'answer' | 'question' | 'completed';
  browserReady: boolean;
  currentPageUrl?: string;
  observation?: RecorderDebugObservation;
  commands?: BrowserCommand[];
  execution?: BrowserExecuteResponse;
  exportArtifacts?: RecorderDebugExportArtifacts;
}

const getBrowserWorkerUrl = () => {
  if (process.env.BROWSER_WORKER_URL) {
    return process.env.BROWSER_WORKER_URL;
  }
  if (process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production') {
    return 'http://ops-browser-worker:3004';
  }
  return 'http://localhost:3004';
};

@Injectable()
export class RecorderDebugService {
  private readonly logger = new Logger(RecorderDebugService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();
  private readonly sessionTtlSeconds = parseInt(process.env.CHAT_SESSION_TTL_SECONDS || '259200', 10);
  private readonly maxHistory = parseInt(process.env.CHAT_SESSION_MAX_MESSAGES || '20', 10);
  private readonly defaultPostCommandWaitMs = parseInt(process.env.RECORDER_DEBUG_POST_COMMAND_WAIT_MS || '800', 10);
  private readonly postCommandWaitStrategy = (process.env.RECORDER_DEBUG_POST_COMMAND_WAIT_STRATEGY || 'final_only').toLowerCase();
  private readonly observeTimeoutMs = parseInt(process.env.RECORDER_DEBUG_OBSERVE_TIMEOUT_MS || '15000', 10);

  constructor(
    private readonly browserCommandService: BrowserCommandService,
    private readonly modelService: ModelService,
    private readonly redisService: RedisService,
  ) {}

  async chat(request: RecorderDebugChatRequest): Promise<RecorderDebugChatResponse> {
    const message = request.message.trim();
    if (!message) {
      throw new Error('Message is required');
    }

    const sessionId = request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession(sessionId, request);

    session.history.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    await this.ensureBrowserReady(session);
    const observation = await this.observePageSafely(session);
    session.lastObservation = observation;
    session.currentPageUrl = observation.currentPageUrl || session.currentPageUrl;

    let response: RecorderDebugChatResponse;
    if (this.isExportIntent(message)) {
      const exportArtifacts = await this.buildExportArtifacts(session, message);
      response = {
        sessionId: session.sessionId,
        runtimeSessionId: session.runtimeSessionId,
        reply: '已根据当前对话与执行历史生成 CLI 脚本和内部 skill 草稿。',
        status: 'completed',
        browserReady: session.browserInitialized,
        currentPageUrl: session.currentPageUrl,
        observation,
        exportArtifacts,
      };
      session.history.push({
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
        observation,
        exportArtifacts,
      });
    } else if (this.isObservationIntent(message)) {
      const reply = await this.describePage(message, observation, request.userRoles || [], request.modelId);
      response = {
        sessionId: session.sessionId,
        runtimeSessionId: session.runtimeSessionId,
        reply,
        status: 'answer',
        browserReady: session.browserInitialized,
        currentPageUrl: session.currentPageUrl,
        observation,
      };
      session.history.push({
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
        observation,
      });
    } else {
      const parsed = await this.browserCommandService.parseCommand({
        input: message,
        context: {
          currentPageUrl: session.currentPageUrl,
          backend: session.backend,
          lastObservationText: observation.text,
          availableInputs: observation.inputs
            .map((item) => this.describeObservedElement(item))
            .filter((item): item is string => Boolean(item)),
          availableButtons: observation.buttons
            .map((item) => this.describeObservedElement(item))
            .filter((item): item is string => Boolean(item)),
        },
      });

      if (!parsed.success || parsed.commands.length === 0) {
        const reply = this.buildClarificationReply(observation);
        response = {
          sessionId: session.sessionId,
          runtimeSessionId: session.runtimeSessionId,
          reply,
          status: 'question',
          browserReady: session.browserInitialized,
          currentPageUrl: session.currentPageUrl,
          observation,
        };
        session.history.push({
          role: 'assistant',
          content: reply,
          timestamp: new Date().toISOString(),
          observation,
        });
      } else {
        const execution = await this.executeBrowserCommands(session, parsed.commands, { appendDefaultWait: true });
        const nextObservation = execution.success
          ? this.mergeObservationWithExecution(observation, execution)
          : observation;
        session.lastObservation = nextObservation;
        session.currentPageUrl = nextObservation.currentPageUrl || session.currentPageUrl;
        session.executedCommands.push(...(execution.executedCommands || parsed.commands));

        const reply = execution.success
          ? `${parsed.explanation}\n已执行当前页面操作。`
          : `${parsed.explanation}\n执行失败：${execution.message || this.extractExecutionError(execution)}`;

        response = {
          sessionId: session.sessionId,
          runtimeSessionId: session.runtimeSessionId,
          reply,
          status: 'executed',
          browserReady: session.browserInitialized,
          currentPageUrl: session.currentPageUrl,
          observation: nextObservation,
          commands: parsed.commands,
          execution,
        };
        session.history.push({
          role: 'assistant',
          content: reply,
          timestamp: new Date().toISOString(),
          commands: parsed.commands,
          execution,
          observation: nextObservation,
        });
      }
    }

    session.history = session.history.slice(-this.maxHistory);
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    if (response.status === 'executed' && response.execution?.success) {
      void this.refreshObservationAfterExecution(session);
    }
    return response;
  }

  async exportArtifacts(request: Omit<RecorderDebugChatRequest, 'message'> & { userGoal?: string }) {
    const sessionId = request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession(sessionId, request);
    const exportArtifacts = await this.buildExportArtifacts(session, request.userGoal || '浏览器调试任务');
    session.history.push({
      role: 'assistant',
      content: '已导出 CLI 脚本和内部 skill 草稿。',
      timestamp: new Date().toISOString(),
      exportArtifacts,
      observation: session.lastObservation,
    });
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
    return {
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      exportArtifacts,
      currentPageUrl: session.currentPageUrl,
    };
  }

  async resetSession(sessionId: string): Promise<void> {
    await this.redisService.del(this.getSessionKey(sessionId));
  }

  private async loadOrCreateSession(
    sessionId: string,
    request: Omit<RecorderDebugChatRequest, 'message'>,
  ): Promise<RecorderDebugSession> {
    const existing = await this.loadSession(sessionId);
    if (existing) {
      existing.backend = request.backend || existing.backend;
      existing.runtimeSessionId = request.runtimeSessionId || existing.runtimeSessionId;
      return existing;
    }

    const now = new Date().toISOString();
    return {
      sessionId,
      runtimeSessionId: request.runtimeSessionId || sessionId,
      backend: request.backend || 'cli',
      browserInitialized: false,
      history: [],
      executedCommands: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private async loadSession(sessionId: string): Promise<RecorderDebugSession | null> {
    const raw = await this.redisService.get(this.getSessionKey(sessionId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RecorderDebugSession;
  }

  private async saveSession(session: RecorderDebugSession): Promise<void> {
    await this.redisService.set(
      this.getSessionKey(session.sessionId),
      JSON.stringify(session),
      this.sessionTtlSeconds,
    );
  }

  private getSessionKey(sessionId: string): string {
    return `recorder_debug_session:${sessionId}`;
  }

  private async ensureBrowserReady(session: RecorderDebugSession): Promise<void> {
    if (session.browserInitialized) {
      return;
    }

    const response = await axios.post<BrowserInitResponse>(
      `${this.browserWorkerUrl}/browser/init`,
      {
        backend: session.backend,
        runtimeSessionId: session.runtimeSessionId,
        sessionPreferences: {
          mode: 'interactive',
          enableCodegen: true,
          headless: false,
        },
      },
      {
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    session.browserInitialized = response.data.success;
  }

  private async observePage(session: RecorderDebugSession): Promise<RecorderDebugObservation> {
    const response = await this.executeBrowserCommands(session, [
      {
        tool: 'evaluate',
        params: { script: this.buildStructureProbeScript() },
        description: 'Inspect current page structure',
      },
      {
        tool: 'get_text',
        params: { max_length: 1600 },
        description: 'Read visible page text',
      },
    ], {
      timeoutMs: this.observeTimeoutMs,
    });

    const evaluateResult = response.results.find((item) => item.command === 'evaluate') || {};
    const textResult = response.results.find((item) => item.command === 'get_text' || item.command === 'read_page') || {};

    const structure = this.parseJsonResult(
      evaluateResult?.data?.result
      || evaluateResult?.result
      || evaluateResult?.stdout,
    ) || {};

    const inputs = Array.isArray(structure.inputs) ? structure.inputs : [];
    const buttons = Array.isArray(structure.buttons) ? structure.buttons : [];
    const observation: RecorderDebugObservation = {
      currentPageUrl: structure.url,
      title: structure.title,
      text: textResult?.data?.text || textResult?.text || textResult?.stdout || '',
      inputs,
      buttons,
      headings: Array.isArray(structure.headings) ? structure.headings : [],
      links: Array.isArray(structure.links) ? structure.links : [],
      suggestedParameters: [],
    };

    observation.suggestedParameters = this.inferSuggestedParameters(observation);
    return observation;
  }

  private async executeBrowserCommands(
    session: RecorderDebugSession,
    commands: BrowserCommand[],
    options?: { appendDefaultWait?: boolean; timeoutMs?: number },
  ): Promise<BrowserExecuteResponse> {
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

      if (!prepared.synthetic && aggregated.executedCommands) {
        aggregated.executedCommands.push(this.enrichCommandWithExecutionStep(resolvedCommand, response));
      }

      if (!response.success) {
        aggregated.success = false;
        aggregated.message = aggregated.message || response.message || this.extractExecutionError(response);
        break;
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

  private async executeBrowserCommandBatch(
    session: RecorderDebugSession,
    commands: BrowserCommand[],
    options?: { timeoutMs?: number },
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
      },
    );

    return response.data;
  }

  private async observePageSafely(
    session: RecorderDebugSession,
    fallback?: RecorderDebugObservation,
  ): Promise<RecorderDebugObservation> {
    try {
      return await this.observePage(session);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`observePage failed for session ${session.sessionId}: ${errorMessage}`);
      if (fallback) {
        return fallback;
      }
      return {
        currentPageUrl: session.currentPageUrl,
        title: undefined,
        text: '',
        inputs: [],
        buttons: [],
        headings: [],
        links: [],
        suggestedParameters: [],
      };
    }
  }

  private mergeObservationWithExecution(
    observation: RecorderDebugObservation,
    execution: BrowserExecuteResponse,
  ): RecorderDebugObservation {
    const nextUrl = this.extractUrlFromExecution(execution);
    if (!nextUrl) {
      return observation;
    }

    return {
      ...observation,
      currentPageUrl: nextUrl,
    };
  }

  private extractUrlFromExecution(execution: BrowserExecuteResponse): string | undefined {
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

  private async refreshObservationAfterExecution(session: RecorderDebugSession): Promise<void> {
    const refreshedObservation = await this.observePageSafely(
      session,
      session.lastObservation,
    );
    const latestSession = await this.loadSession(session.sessionId);
    const sessionToUpdate = latestSession || session;
    sessionToUpdate.lastObservation = refreshedObservation;
    sessionToUpdate.currentPageUrl = refreshedObservation.currentPageUrl || sessionToUpdate.currentPageUrl;
    sessionToUpdate.updatedAt = new Date().toISOString();
    await this.saveSession(sessionToUpdate);
  }

  private requiresSnapshotBeforeAction(command: BrowserCommand): boolean {
    return ['click', 'fill', 'hover', 'drag', 'press_key', 'type_text'].includes(command.tool);
  }

  private prepareExecutionQueue(
    commands: BrowserCommand[],
    options?: { appendDefaultWait?: boolean; timeoutMs?: number },
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
        options?.appendDefaultWait
        && this.postCommandWaitStrategy === 'per_command'
        && this.defaultPostCommandWaitMs > 0
        && command.tool !== 'wait'
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
      options?.appendDefaultWait
      && this.postCommandWaitStrategy !== 'none'
      && this.postCommandWaitStrategy !== 'per_command'
      && this.defaultPostCommandWaitMs > 0
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
    execution: BrowserExecuteResponse,
  ): BrowserCommand {
    const step = Array.isArray(execution.steps) ? execution.steps[0] : undefined;
    if (!step || typeof step !== 'object') {
      return command;
    }

    const locator = step.locator && typeof step.locator === 'object'
      ? step.locator as BrowserCommand['locator']
      : undefined;
    const params = step.params && typeof step.params === 'object'
      ? step.params as Record<string, unknown>
      : command.params;

    return {
      ...command,
      params,
      ...(locator ? { locator } : {}),
    };
  }

  private rewriteCommandWithSnapshotRefs(
    command: BrowserCommand,
    snapshotState: SnapshotResolutionState | null,
  ): BrowserCommand {
    if (!snapshotState?.nodes.length || !this.requiresSnapshotBeforeAction(command)) {
      return command;
    }

    const targetCandidate = this.extractCommandTargetCandidate(command);
    if (!targetCandidate || /^e\d+$/i.test(targetCandidate)) {
      return command;
    }

    const ref = command.tool === 'fill'
      ? this.resolveSnapshotRefForFill(targetCandidate, snapshotState.nodes)
      : this.resolveSnapshotRefForAction(targetCandidate, snapshotState.nodes);

    if (!ref) {
      return command;
    }

    return {
      ...command,
      params: {
        ...command.params,
        target: ref,
      },
    };
  }

  private extractCommandTargetCandidate(command: BrowserCommand): string | undefined {
    const params = command.params || {};
    const candidates = [params.target, params.selector, params.text, params.key];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  private resolveSnapshotRefForFill(target: string, nodes: SnapshotNode[]): string | undefined {
    const inputNodes = nodes.filter((node) => ['textbox', 'searchbox', 'combobox', 'textarea', 'input'].includes(node.role));
    return this.pickBestSnapshotNode(target, inputNodes)?.ref;
  }

  private resolveSnapshotRefForAction(target: string, nodes: SnapshotNode[]): string | undefined {
    const preferredNodes = nodes.filter((node) => ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(node.role));
    return this.pickBestSnapshotNode(target, preferredNodes)?.ref
      || this.pickBestSnapshotNode(target, nodes)?.ref;
  }

  private pickBestSnapshotNode(target: string, nodes: SnapshotNode[]): SnapshotNode | undefined {
    const normalizedTarget = this.normalizeSnapshotText(target);
    if (!normalizedTarget) {
      return undefined;
    }

    const scored = nodes
      .map((node) => ({ node, score: this.scoreSnapshotNode(node, normalizedTarget) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    return scored[0]?.node;
  }

  private scoreSnapshotNode(node: SnapshotNode, normalizedTarget: string): number {
    const candidates = [
      node.name,
      node.text,
      node.line,
    ]
      .map((item) => this.normalizeSnapshotText(item))
      .filter((item): item is string => Boolean(item));
    const targetVariants = this.expandSnapshotTargetVariants(normalizedTarget);

    let score = 0;
    for (const variant of targetVariants) {
      for (const candidate of candidates) {
        if (candidate === variant) {
          score = Math.max(score, 120);
        } else if (candidate.includes(variant)) {
          score = Math.max(score, 95);
        } else if (variant.includes(candidate)) {
          score = Math.max(score, 70);
        }
      }
    }

    if (normalizedTarget.includes('用户名') || normalizedTarget.includes('账号')) {
      if (candidates.some((candidate) => candidate.includes('用户名') || candidate.includes('账号') || candidate.includes('user'))) {
        score += 25;
      }
    }

    if (normalizedTarget.includes('密码')) {
      if (candidates.some((candidate) => candidate.includes('密码') || candidate.includes('password') || candidate.includes('pass'))) {
        score += 25;
      }
    }

    if (node.role === 'button' && candidates.some((candidate) => candidate.includes(normalizedTarget))) {
      score += 10;
    }

    return score;
  }

  private expandSnapshotTargetVariants(normalizedTarget: string): string[] {
    const variants = new Set<string>([normalizedTarget]);
    const synonyms: Array<[RegExp, string[]]> = [
      [/(用户名|账号)/, ['username', 'user', 'account', 'enterusername']],
      [/(密码)/, ['password', 'pass', 'enterpassword']],
      [/(登录)/, ['login', 'signin', 'logon', 'submit']],
      [/(执行管理)/, ['executions', 'execution', 'runs', 'runmanagement']],
      [/(记住我)/, ['rememberme']],
    ];

    for (const [pattern, aliasList] of synonyms) {
      if (pattern.test(normalizedTarget)) {
        aliasList.forEach((alias) => variants.add(alias));
      }
    }

    return [...variants];
  }

  private normalizeSnapshotText(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .toLowerCase()
      .replace(/[\s"'`:,.:;|()[\]{}<>【】]/g, '')
      .trim();
  }

  private async loadSnapshotResolutionState(
    execution: BrowserExecuteResponse,
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
    const endIndex = pageMarkerIndex >= 0
      ? pageMarkerIndex
      : ranCodeMarkerIndex >= 0
        ? ranCodeMarkerIndex
        : stdout.length;
    const content = stdout.slice(0, endIndex).trim();

    return content.length > 0 ? content : undefined;
  }

  private parseSnapshotNodes(content: string): SnapshotNode[] {
    return content
      .split('\n')
      .map((line) => line.trimEnd())
      .map((line) => {
        const refMatch = line.match(/\[ref=(e\d+)\]/i);
        if (!refMatch?.[1]) {
          return null;
        }

        const nodeMatch = line.match(/^\s*-\s*([a-z-]+)(?:\s+"([^"]+)")?.*?(?::\s*(.+))?$/i);
        if (!nodeMatch?.[1]) {
          return null;
        }

        return {
          ref: refMatch[1],
          role: nodeMatch[1].toLowerCase(),
          ...(nodeMatch[2] ? { name: nodeMatch[2].trim() } : {}),
          ...(nodeMatch[3] ? { text: nodeMatch[3].trim() } : {}),
          line: line.trim(),
        } satisfies SnapshotNode;
      })
      .filter((item): item is SnapshotNode => Boolean(item));
  }

  private describeObservedElement(item: Record<string, unknown>): string | undefined {
    const fields = [
      item.label,
      item.placeholder,
      item.text,
      item.name,
      item.type,
      item.role,
    ];

    for (const field of fields) {
      if (typeof field === 'string' && field.trim().length > 0) {
        return field.trim();
      }
    }

    return undefined;
  }

  private parseJsonResult(value: unknown): Record<string, any> | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed) as Record<string, any> | string;
      if (typeof parsed === 'string') {
        return JSON.parse(parsed) as Record<string, any>;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async describePage(
    userMessage: string,
    observation: RecorderDebugObservation,
    userRoles: string[],
    modelId?: string,
  ): Promise<string> {
    const structuredSummary = this.buildObservationSummary(observation);
    const preferredModel = modelId || this.modelService.getPreferredDefaultModel({
      mode: 'chat',
      userRoles,
    })?.id;

    if (!preferredModel) {
      return structuredSummary;
    }

    try {
      const response = await this.modelService.callModel(
        preferredModel,
        [
          'You are helping a user debug a React page through browser observations.',
          'Answer in concise Chinese.',
          'If the user asks what parameters are needed, focus on the visible inputs, buttons, and current page context.',
          `User question: ${userMessage}`,
          `Page observation:\n${structuredSummary}`,
        ].join('\n\n'),
      );
      return response.content || structuredSummary;
    } catch (error) {
      this.logger.warn(`Failed to generate recorder debug description: ${error instanceof Error ? error.message : 'unknown error'}`);
      return structuredSummary;
    }
  }

  private buildObservationSummary(observation: RecorderDebugObservation): string {
    const lines = [
      `当前页面: ${observation.currentPageUrl || 'unknown'}`,
      `页面标题: ${observation.title || 'unknown'}`,
      observation.inputs.length > 0
        ? `可见输入项: ${observation.inputs.map((input) => JSON.stringify(input)).join('；')}`
        : '可见输入项: 无',
      observation.buttons.length > 0
        ? `可见按钮: ${observation.buttons.map((button) => JSON.stringify(button)).join('；')}`
        : '可见按钮: 无',
      observation.headings.length > 0
        ? `主要标题: ${observation.headings.join('；')}`
        : '主要标题: 无',
      observation.links.length > 0
        ? `主要链接: ${observation.links.join('；')}`
        : '主要链接: 无',
      observation.suggestedParameters.length > 0
        ? `建议补充参数: ${observation.suggestedParameters.map((param) => `${param.name}(${param.label})`).join('；')}`
        : '建议补充参数: 暂无',
      observation.text
        ? `页面文本摘录: ${observation.text.slice(0, 500)}`
        : '页面文本摘录: 无',
    ];
    return lines.join('\n');
  }

  private buildClarificationReply(observation: RecorderDebugObservation): string {
    if (observation.suggestedParameters.length > 0) {
      const suggested = observation.suggestedParameters
        .slice(0, 3)
        .map((param) => `\`${param.name}\``)
        .join('、');
      return `我已经看过当前页面。你可以直接描述操作，也可以先补充参数，例如 ${suggested}。`;
    }
    if (observation.inputs.length > 0) {
      return `我已经看过当前页面。你可以直接告诉我目标，例如“点击登录”“填写账号 admin”“智搜 MCP”。当前页面可见输入项有 ${observation.inputs.length} 个。`;
    }
    return '我已经观察了当前页面。请更具体地告诉我要执行的操作，或者直接问我“页面上有什么”“需要输入哪些参数”。';
  }

  private isObservationIntent(message: string): boolean {
    return /(页面|结构|表单|参数|输入|按钮|字段|页面上有什么|需要输入什么)/i.test(message);
  }

  private isExportIntent(message: string): boolean {
    return /(导出|生成.*脚本|生成.*skill|内部skill|发布成skill|完成任务|结束任务)/i.test(message);
  }

  private extractExecutionError(execution: BrowserExecuteResponse): string | undefined {
    return execution.results.find((item) => item.status === 'error')?.message || execution.message;
  }

  private async buildExportArtifacts(
    session: RecorderDebugSession,
    userGoal: string,
  ): Promise<RecorderDebugExportArtifacts> {
    const parameters = this.inferSkillParameters(session.executedCommands);
    const outputs = this.inferSkillOutputs(session.executedCommands, session.lastObservation);
    const metadata = await this.generateExportMetadata(session, userGoal, parameters, outputs);
    const publishPayload = this.buildSkillPublishPayload({
      userGoal,
      backend: session.backend,
      runtimeSessionId: session.runtimeSessionId,
      commands: session.executedCommands,
      parameters,
      outputs,
      metadata,
    });
    const executionPlan = {
      backend: session.backend,
      runtimeSessionId: session.runtimeSessionId,
      commands: session.executedCommands,
    } satisfies RecorderDebugExportArtifacts['skillDraft']['executionPlan'];
    const usageNotes = [
      'AI 聊天窗口只负责识别参数并调用该 skill，不直接逐步重放浏览器操作。',
      'skill 内部通过固定 executionPlan 调用 browser worker，保证执行顺序稳定。',
      `默认 backend 为 ${session.backend}，默认 runtimeSessionId 为 ${session.runtimeSessionId}。`,
      '如果页面结构变化较大，应重新录制并重新生成脚本与 skill 说明。',
    ];
    const guidance = [
      `目标: ${userGoal}`,
      `模板名称: ${metadata.name}`,
      `模板描述: ${metadata.description}`,
      `脚本用途: 独立稳定执行录制得到的浏览器步骤`,
      `skill 用途: 给 AI 聊天窗口作为内置能力使用，只收集参数并触发固定脚本`,
      `默认 backend: ${session.backend}`,
      `默认 runtimeSessionId: ${session.runtimeSessionId}`,
      `输出位置: ${outputs.map((item) => `${item.name} -> ${item.location}`).join('；')}`,
    ].join('\n');

    return {
      script: this.buildStableExecutionScript(executionPlan, parameters),
      guidance,
      skillDraft: {
        name: metadata.name,
        description: metadata.description,
        invocation: '在 AI 聊天窗口中仅解析参数并调用该 skill，由 skill 内部执行稳定的浏览器步骤。',
        parameterOnly: true,
        parameters,
        outputs,
        usageNotes,
        usageMarkdown: this.buildSkillUsageMarkdown({
          userGoal,
          backend: session.backend,
          runtimeSessionId: session.runtimeSessionId,
          parameters,
          outputs,
        }),
        publishPayload,
        executionPlan,
        commands: session.executedCommands,
      },
    };
  }

  private buildStableExecutionScript(
    executionPlan: RecorderDebugExportArtifacts['skillDraft']['executionPlan'],
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>,
  ): string {
    const parameterConsts = parameters.map((param) => {
      const constName = this.toScriptConstName(param.name);
      const fallbackValue = this.coerceParameterExampleValue(param.name, param.exampleValue);
      if (typeof fallbackValue === 'number') {
        return `const ${constName} = Number(process.env.${constName} || ${fallbackValue});`;
      }
      return `const ${constName} = process.env.${constName} || ${this.toJavaScriptLiteral(fallbackValue)};`;
    });

    const lines = [
      '// Auto-generated Playwright script from Recorder Debug Chat',
      `// backend: ${executionPlan.backend}`,
      `// runtimeSessionId: ${executionPlan.runtimeSessionId}`,
      '',
      'const { chromium } = require("playwright");',
      '',
      'const DEFAULT_WAIT_MS = Number(process.env.DEFAULT_WAIT_MS || 2000);',
      ...parameterConsts,
      parameterConsts.length > 0 ? '' : '',
      'async function findSearchInput(page) {',
      '  const selectors = [',
      '    \'input[type="search"]\',',
      '    \'textarea[name="q"]\',',
      '    \'input[name="q"]\',',
      '    \'input[name="wd"]\',',
      '    \'textarea[name="wd"]\',',
      '    \'[role="searchbox"]\',',
      '    \'input[placeholder*="搜索"]\',',
      '    \'input[placeholder*="Search" i]\',',
      '    \'textarea[placeholder*="搜索"]\',',
      '    \'textarea[placeholder*="Search" i]\',',
      '  ];',
      '  for (const selector of selectors) {',
      '    const locator = page.locator(selector).first();',
      '    if (await locator.count()) {',
      '      return locator;',
      '    }',
      '  }',
      '  throw new Error("No search input found on current page");',
      '}',
      '',
      'async function clickSearchResult(page, context, index) {',
      '  const selectors = [',
      '    "#content_left a[href]",',
      '    "#b_results a[href]",',
      '    "main a[href]",',
      '    "a[href]"',
      '  ];',
      '  for (const selector of selectors) {',
      '    const links = page.locator(selector);',
      '    const count = await links.count();',
      '    if (count >= index) {',
      '      const popupPromise = page.waitForEvent("popup", { timeout: 3000 }).catch(() => null);',
      '      await links.nth(index - 1).click();',
      '      const popup = await popupPromise;',
      '      const nextPage = popup || context.pages().at(-1) || page;',
      '      await nextPage.waitForLoadState("domcontentloaded").catch(() => {});',
      '      return nextPage;',
      '    }',
      '  }',
      '  throw new Error(`Search result index out of range: ${index}`);',
      '}',
      '',
      'async function run() {',
      '  const browser = await chromium.launch({ headless: false });',
      '  const context = await browser.newContext();',
      '  let page = await context.newPage();',
      '',
    ];

    executionPlan.commands.forEach((command, index) => {
      lines.push(`  // Step ${index + 1}: ${command.description || command.tool}`);
      lines.push(...this.buildPlaywrightCommandLines(command, parameters, index + 1, index));
      if (command.tool !== 'wait') {
        lines.push('  await page.waitForTimeout(DEFAULT_WAIT_MS);');
      }
      lines.push('');
    });

    lines.push('  await page.waitForTimeout(5000);');
    lines.push('  await browser.close();');
    lines.push('}');
    lines.push('');
    lines.push('run().catch((error) => {');
    lines.push('  console.error(error);');
    lines.push('  process.exit(1);');
    lines.push('});');

    return lines.join('\n');
  }

  private buildPlaywrightCommandLines(
    command: BrowserCommand,
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>,
    stepNumber: number,
    commandIndex: number,
  ): string[] {
    switch (command.tool) {
      case 'navigate':
        return [
          `  await page.goto(${this.resolveScriptValue(commandIndex, 'url', command.params.url, parameters)});`,
        ];
      case 'search':
      case 'smart_search':
        return [
          '  {',
          '    const searchInput = await findSearchInput(page);',
          '    await searchInput.click();',
          `    await searchInput.fill(${this.resolveScriptValue(commandIndex, 'query', command.params.query, parameters)});`,
          '    await searchInput.press("Enter");',
          '    await page.waitForLoadState("domcontentloaded").catch(() => {});',
          '  }',
        ];
      case 'click_result':
        return [
          `  page = await clickSearchResult(page, context, ${this.resolveScriptValue(commandIndex, 'index', command.params.index, parameters)});`,
        ];
      case 'switch_latest_tab':
        return [
          '  page = context.pages().at(-1) || page;',
          '  await page.bringToFront().catch(() => {});',
        ];
      case 'click':
        if (command.locator) {
          return [`  await ${this.toPlaywrightLocatorExpression(command.locator)}.first().click();`];
        }
        if (typeof command.params.selector === 'string') {
          return [`  await page.locator(${this.toJavaScriptLiteral(command.params.selector)}).first().click();`];
        }
        if (typeof command.params.text === 'string') {
          return [`  await page.getByText(${this.toJavaScriptLiteral(command.params.text)}, { exact: false }).first().click();`];
        }
        return ['  // Unsupported click command payload'];
      case 'fill':
        if (command.locator) {
          return [
            `  await ${this.toPlaywrightLocatorExpression(command.locator)}.first().fill(${this.resolveScriptValue(commandIndex, 'value', command.params.value, parameters)});`,
          ];
        }
        if (typeof command.params.selector === 'string') {
          return [
            `  await page.locator(${this.toJavaScriptLiteral(command.params.selector)}).first().fill(${this.resolveScriptValue(commandIndex, 'value', command.params.value, parameters)});`,
          ];
        }
        return ['  // Unsupported fill command payload'];
      case 'type_text':
        return [
          `  await page.keyboard.type(${this.resolveScriptValue(commandIndex, 'text', command.params.text, parameters)});`,
          ...(typeof command.params.submit_key === 'string'
            ? [`  await page.keyboard.press(${this.toJavaScriptLiteral(command.params.submit_key)});`]
            : []),
        ];
      case 'press_key':
        return [
          `  await page.keyboard.press(${this.toJavaScriptLiteral(command.params.key)});`,
        ];
      case 'wait':
        return [
          `  await page.waitForTimeout(${this.toJavaScriptLiteral(command.params.duration ?? 2000)});`,
        ];
      case 'scroll': {
        const direction = typeof command.params.direction === 'string' ? command.params.direction : 'down';
        const amount = typeof command.params.amount === 'number' ? command.params.amount : 600;
        if (direction === 'top') {
          return ['  await page.evaluate(() => window.scrollTo(0, 0));'];
        }
        if (direction === 'bottom') {
          return ['  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));'];
        }
        if (direction === 'up') {
          return [`  await page.evaluate(() => window.scrollBy(0, -${amount}));`];
        }
        return [`  await page.evaluate(() => window.scrollBy(0, ${amount}));`];
      }
      case 'screenshot':
        return [
          `  await page.screenshot({ path: ${this.toJavaScriptLiteral(`artifacts/step-${stepNumber}.png`)}, fullPage: true });`,
        ];
      case 'read_page':
      case 'get_text':
        return [
          '  console.log(await page.locator("body").innerText());',
        ];
      default:
        return [`  // Unsupported command in exported script: ${command.tool}`];
    }
  }

  private resolveScriptValue(
    commandIndex: number,
    parameterKey: string,
    fallbackValue: unknown,
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>,
  ): string {
    const sourceKey = `command.${commandIndex}.${parameterKey}`;
    const matched = parameters.find((param) => param.source === sourceKey)
      || parameters.find((param) => param.source === this.buildLegacyParameterSource(parameterKey))
      || parameters.find((param) => param.name === this.buildLegacyParameterName(parameterKey));
    if (matched) {
      return this.toScriptConstName(matched.name);
    }
    return this.toJavaScriptLiteral(fallbackValue);
  }

  private buildLegacyParameterSource(parameterKey: string): string | undefined {
    switch (parameterKey) {
      case 'url':
        return 'navigate.url';
      case 'query':
        return 'search.query';
      case 'index':
        return 'click_result.index';
      case 'value':
        return 'fill.value';
      default:
        return undefined;
    }
  }

  private buildLegacyParameterName(parameterKey: string): string | undefined {
    switch (parameterKey) {
      case 'url':
        return 'url';
      case 'query':
        return 'query';
      case 'index':
        return 'resultIndex';
      case 'value':
        return 'value';
      default:
        return undefined;
    }
  }

  private toPlaywrightLocatorExpression(locator: NonNullable<BrowserCommand['locator']>): string {
    if (locator.expression) {
      return `page.${locator.expression}`;
    }

    switch (locator.strategy) {
      case 'role':
        return `page.getByRole(${this.toJavaScriptLiteral(locator.value || locator.role || 'button')}${locator.name ? `, { name: ${this.toJavaScriptLiteral(locator.name)} }` : ''})`;
      case 'label':
        return `page.getByLabel(${this.toJavaScriptLiteral(locator.value || locator.name || '')})`;
      case 'placeholder':
        return `page.getByPlaceholder(${this.toJavaScriptLiteral(locator.value || '')})`;
      case 'testid':
        return `page.getByTestId(${this.toJavaScriptLiteral(locator.value || '')})`;
      case 'text':
        return `page.getByText(${this.toJavaScriptLiteral(locator.value || '')}, { exact: ${locator.exact ? 'true' : 'false'} })`;
      default:
        return `page.locator(${this.toJavaScriptLiteral(locator.value || '')})`;
    }
  }

  private toScriptConstName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^(\d)/, '_$1').toUpperCase();
  }

  private coerceParameterExampleValue(name: string, value?: string): string | number {
    if (name === 'resultIndex') {
      const parsed = Number(value || '1');
      return Number.isFinite(parsed) ? parsed : 1;
    }
    return value || '';
  }

  private toJavaScriptLiteral(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(typeof value === 'string' ? value : '');
  }

  private inferSkillParameters(commands: BrowserCommand[]) {
    const params: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }> = [];
    const usedNames = new Set<string>();

    const registerParameter = (parameter: {
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }) => {
      const source = parameter.source?.trim();
      if (!source || params.some((item) => item.source === source)) {
        return;
      }

      const name = this.ensureUniqueParameterName(parameter.name, usedNames);
      usedNames.add(name);
      params.push({
        ...parameter,
        name,
        source,
      });
    };

    for (const [index, command] of commands.entries()) {
      if (command.tool === 'navigate' && typeof command.params.url === 'string') {
        registerParameter({
          name: 'startUrl',
          description: '起始页面地址，默认使用当前录制时的地址',
          required: false,
          exampleValue: command.params.url,
          source: `command.${index}.url`,
        });
      }

      if ((command.tool === 'search' || command.tool === 'smart_search') && typeof command.params.query === 'string') {
        registerParameter({
          name: 'searchQuery',
          description: '搜索关键词',
          required: true,
          exampleValue: command.params.query,
          source: `command.${index}.query`,
        });
      }

      if (command.tool === 'fill' && typeof command.params.value === 'string') {
        registerParameter(this.inferFillParameter(command, index));
      }

      if (command.tool === 'type_text' && typeof command.params.text === 'string') {
        registerParameter({
          name: `typedText${index + 1}`,
          description: '键盘输入文本',
          required: true,
          exampleValue: command.params.text,
          source: `command.${index}.text`,
        });
      }

      if (command.tool === 'click_result' && command.params.index !== undefined) {
        registerParameter({
          name: 'resultIndex',
          description: '搜索结果序号，从 1 开始',
          required: false,
          exampleValue: String(command.params.index),
          source: `command.${index}.index`,
        });
      }
    }

    return params;
  }

  private inferSkillOutputs(
    commands: BrowserCommand[],
    observation?: RecorderDebugObservation,
  ): Array<{ name: string; description: string; location: string }> {
    const outputs = new Map<string, { name: string; description: string; location: string }>();
    const currentPageLocation = observation?.currentPageUrl
      ? `浏览器当前页面（${observation.currentPageUrl}）`
      : '浏览器当前页面';

    if (commands.length > 0) {
      outputs.set('pageState', {
        name: 'pageState',
        description: '执行完成后的页面状态、页面标题和可见内容',
        location: currentPageLocation,
      });
      outputs.set('executionResult', {
        name: 'executionResult',
        description: '每一步浏览器命令的执行结果与错误信息',
        location: '脚本标准输出 JSON 和 OUTPUT_FILE 文件',
      });
    }

    if (commands.some((command) => command.tool === 'snapshot' || command.tool === 'screenshot')) {
      outputs.set('snapshotArtifact', {
        name: 'snapshotArtifact',
        description: '页面快照或截图产物',
        location: 'browser worker 返回结果中的 path/snapshot 字段',
      });
    }

    if (commands.some((command) => command.tool === 'get_text' || command.tool === 'read_page')) {
      outputs.set('pageText', {
        name: 'pageText',
        description: '页面文本读取结果',
        location: 'browser worker execute 返回的 results[*].data.text',
      });
    }

    return [...outputs.values()];
  }

  private buildSkillUsageMarkdown(input: {
    userGoal: string;
    backend: RecorderDebugBackend;
    runtimeSessionId: string;
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs: Array<{
      name: string;
      description: string;
      location: string;
    }>;
  }): string {
    const parameterLines = input.parameters.length > 0
      ? input.parameters.map((param) => {
        const detail = [
          `- ${param.name}: ${param.description}`,
          param.required ? '必填' : '可选',
          param.exampleValue ? `示例=${param.exampleValue}` : undefined,
          param.source ? `来源=${param.source}` : undefined,
        ].filter(Boolean).join(' | ');
        return detail;
      })
      : ['- 无显式参数，直接调用即可'];
    const outputLines = input.outputs.length > 0
      ? input.outputs.map((output) => `- ${output.name}: ${output.description} | 位置=${output.location}`)
      : ['- 执行结果以 browser worker 返回为准'];

    return [
      `# Recorder Built-in Skill`,
      '',
      `## 目标`,
      `${input.userGoal}`,
      '',
      `## 调用方式`,
      'AI 聊天窗口只解析参数并调用该 skill。',
      'skill 内部按固定 executionPlan 调用 browser worker。',
      '',
      `## 默认运行配置`,
      `- backend: ${input.backend}`,
      `- runtimeSessionId: ${input.runtimeSessionId}`,
      '',
      `## 参数`,
      ...parameterLines,
      '',
      `## 输出`,
      ...outputLines,
      '',
      `## 约束`,
      '- 不允许聊天窗口自行改写执行步骤。',
      '- 页面变化较大时需要重新录制并重新生成 skill。',
    ].join('\n');
  }

  private buildSkillPublishPayload(input: {
    userGoal: string;
    backend: RecorderDebugBackend;
    runtimeSessionId: string;
    commands: BrowserCommand[];
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>;
    outputs: Array<{
      name: string;
      description: string;
      location: string;
    }>;
    metadata: RecorderExportMetadata;
  }): RecorderDebugExportArtifacts['skillDraft']['publishPayload'] {
    const paramsSchema = {
      properties: Object.fromEntries(
        input.parameters.map((param) => [
          param.name,
          {
            type: this.inferSchemaTypeFromParameter(param.name),
            description: param.description,
            required: param.required,
            ...(param.exampleValue ? { default: param.exampleValue } : {}),
            ...(param.source ? { extractionPrompt: `优先从用户输入中提取 ${param.name}，来源提示: ${param.source}` } : {}),
          },
        ]),
      ),
      required: input.parameters.filter((param) => param.required).map((param) => param.name),
    } as RecorderDebugExportArtifacts['skillDraft']['publishPayload']['paramsSchema'];

    return {
      name: input.metadata.name,
      description: input.metadata.description,
      triggerKeywords: this.buildTriggerKeywords(input.userGoal, input.commands),
      paramsSchema,
      executionFlowTemplateIds: [],
      executionFlow: [
        {
          id: 'step_browser_recording_execute',
          name: '执行录制脚本',
          type: 'tool',
          tool: { name: 'browser_step' },
          config: {
            executionMode: 'recording_script',
            parameterMode: 'collected_only',
            executionPlan: {
              backend: input.backend,
              runtimeSessionId: input.runtimeSessionId,
              commands: input.commands,
            },
          },
        },
      ],
      tools: ['skill_match', 'browser_step'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'browser_recording',
          goal: input.userGoal,
          expectedResult: '按录制脚本完成浏览器任务，并返回页面状态与执行结果',
          outputParams: Object.fromEntries(
            input.outputs.map((output) => [
              output.name,
              {
                description: output.description,
                location: output.location,
              },
            ]),
          ),
          matchSummary: `该技能用于完成录制得到的浏览器任务: ${input.userGoal}`,
          paramCollectionGuidance: input.parameters.length > 0
            ? `调用前需要先收集参数: ${input.parameters.map((item) => item.name).join('、')}`
            : '该技能无需额外参数，可直接调用。',
          validationRules: '聊天窗口只允许解析参数，不允许改写 executionPlan 中的固定浏览器步骤。',
          executionPlan: {
            backend: input.backend,
            runtimeSessionId: input.runtimeSessionId,
            commands: input.commands,
          },
          usageMode: 'parameter_only_skill',
        },
      },
    };
  }

  private buildSkillName(userGoal: string): string {
    const base = userGoal
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    return base ? `browser_recording_${base}` : 'browser_recording_generated_skill';
  }

  private buildTriggerKeywords(userGoal: string, commands: BrowserCommand[]): string[] {
    const keywords = new Set<string>();
    const normalizedGoal = userGoal.trim();
    if (normalizedGoal) {
      keywords.add(normalizedGoal);
      normalizedGoal
        .split(/[\s,，。；;]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 5)
        .forEach((item) => keywords.add(item));
    }

    commands.forEach((command) => {
      if (command.tool === 'navigate' && typeof command.params.url === 'string') {
        keywords.add('打开页面');
      }
      if (command.tool === 'search' || command.tool === 'smart_search') {
        keywords.add('搜索');
      }
      if (command.tool === 'click_result') {
        keywords.add('点击结果');
      }
    });

    return [...keywords].slice(0, 8);
  }

  private inferSchemaTypeFromParameter(name: string): 'string' | 'number' | 'date' | 'boolean' {
    if (/index|count|size|amount|duration/i.test(name)) {
      return 'number';
    }
    if (/date|time/i.test(name)) {
      return 'date';
    }
    if (/enabled|checked|flag|bool/i.test(name)) {
      return 'boolean';
    }
    return 'string';
  }

  private inferFillParameter(command: BrowserCommand, index: number): {
    name: string;
    description: string;
    required: boolean;
    exampleValue?: string;
    source?: string;
  } {
    const fieldHint = this.extractCommandFieldHint(command);
    const normalizedHint = fieldHint.toLowerCase();

    if (/(用户名|账号|账户|user\s*name|username|account|email|邮箱|手机号|mobile)/i.test(fieldHint)) {
      return {
        name: 'username',
        description: '登录用户名',
        required: true,
        exampleValue: String(command.params.value || ''),
        source: `command.${index}.value`,
      };
    }

    if (/(密码|password|passwd|passcode|pin|secret)/i.test(fieldHint)) {
      return {
        name: 'loginCredential',
        description: '登录密码',
        required: true,
        exampleValue: String(command.params.value || ''),
        source: `command.${index}.value`,
      };
    }

    if (/(验证码|otp|verification|verify|code)/i.test(fieldHint)) {
      return {
        name: 'verificationCode',
        description: '验证码或校验码',
        required: true,
        exampleValue: String(command.params.value || ''),
        source: `command.${index}.value`,
      };
    }

    const genericName = normalizedHint
      ? `input${index + 1}${this.toPascalCase(this.sanitizeParameterName(normalizedHint))}`
      : `inputValue${index + 1}`;

    return {
      name: genericName,
      description: fieldHint ? `字段「${fieldHint}」的输入值` : `第 ${index + 1} 个输入框的值`,
      required: true,
      exampleValue: String(command.params.value || ''),
      source: `command.${index}.value`,
    };
  }

  private extractCommandFieldHint(command: BrowserCommand): string {
    const candidates = [
      typeof command.locator?.name === 'string' ? command.locator.name : undefined,
      typeof command.params.selector === 'string' ? command.params.selector : undefined,
      typeof command.params.text === 'string' ? command.params.text : undefined,
      typeof command.description === 'string' ? command.description : undefined,
    ];

    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value) {
        return value.replace(/\s+/g, ' ');
      }
    }

    return '';
  }

  private sanitizeParameterName(value: string): string {
    const normalized = value
      .replace(/enter\s+/gi, '')
      .replace(/输入|请输入/g, '')
      .replace(/[^\w\s\u4e00-\u9fa5]+/g, ' ')
      .trim();

    if (!normalized) {
      return 'value';
    }

    if (/用户名|账号|账户|user\s*name|username|account|email|邮箱|手机号|mobile/i.test(normalized)) {
      return 'username';
    }
    if (/密码|password|passwd|passcode|pin|secret/i.test(normalized)) {
      return 'loginCredential';
    }
    if (/验证码|otp|verification|verify|code/i.test(normalized)) {
      return 'verificationCode';
    }

    return normalized
      .split(/\s+/)
      .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(' ');
  }

  private toPascalCase(value: string): string {
    const ascii = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!ascii) {
      return '';
    }

    return ascii
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  private ensureUniqueParameterName(name: string, usedNames: Set<string>): string {
    const normalized = this.makeTemplateSafeParameterName(this.normalizeParameterName(name));
    if (!usedNames.has(normalized)) {
      return normalized;
    }

    let counter = 2;
    while (usedNames.has(`${normalized}${counter}`)) {
      counter += 1;
    }
    return `${normalized}${counter}`;
  }

  private normalizeParameterName(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!cleaned) {
      return 'inputValue';
    }

    const words = cleaned
      .split(/\s+/)
      .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean);
    if (words.length === 0) {
      return 'inputValue';
    }

    return words
      .map((part, index) => {
        if (index === 0) {
          return part.charAt(0).toLowerCase() + part.slice(1);
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('');
  }

  private makeTemplateSafeParameterName(name: string): string {
    let normalized = name;

    normalized = normalized.replace(/password|passwd|pwd|passcode|secret/gi, 'Credential');
    normalized = normalized.replace(/token|api_?key|apikey/gi, 'AuthKey');

    const lower = normalized.toLowerCase();
    if (FORBIDDEN_TEMPLATE_PARAM_TOKENS.some((token) => lower.includes(token))) {
      normalized = `input${this.toPascalCase(normalized) || 'Value'}`;
    }

    return normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }

  private async generateExportMetadata(
    session: RecorderDebugSession,
    userGoal: string,
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>,
    outputs: Array<{
      name: string;
      description: string;
      location: string;
    }>,
  ): Promise<RecorderExportMetadata> {
    const fallback = this.buildFallbackExportMetadata(userGoal, session.executedCommands, parameters);
    const preferredModel = this.modelService.getPreferredDefaultModel({
      mode: 'chat',
      userRoles: [],
    })?.id;

    if (!preferredModel) {
      return fallback;
    }

    const commandSummary = session.executedCommands.map((command, index) => ({
      step: index + 1,
      tool: command.tool,
      description: command.description,
      params: command.params,
      locator: command.locator,
    }));

    try {
      const response = await this.modelService.callModel(
        preferredModel,
        [
          '你是浏览器录制模板分析助手。',
          '请根据用户目标、录制步骤和参数，生成更像业务模板的名称与描述。',
          '要求：',
          '1. 只返回 JSON，不要输出解释。',
          '2. name 用中文，简洁明确，不要带 browser_recording、URL、IP、端口、test、test123、录制、模板、脚本 等技术噪音。',
          '3. description 用中文 1-2 句，说明它完成什么任务、依赖哪些关键参数。',
          '4. 如果存在登录类输入，描述中要体现用户名/密码等登录参数。',
          `用户目标: ${userGoal}`,
          `当前页面: ${session.currentPageUrl || 'unknown'}`,
          `参数: ${JSON.stringify(parameters)}`,
          `输出: ${JSON.stringify(outputs)}`,
          `录制步骤: ${JSON.stringify(commandSummary)}`,
          `兜底建议: ${JSON.stringify(fallback)}`,
          '返回格式: {"name":"...","description":"..."}',
        ].join('\n\n'),
      );

      const parsed = this.parseJsonResult(response.content);
      const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
      const description = typeof parsed?.description === 'string' ? parsed.description.trim() : '';

      if (!name || !description) {
        return fallback;
      }

      return {
        name: name.slice(0, 255),
        description: description.slice(0, 1000),
      };
    } catch (error) {
      this.logger.warn(`Failed to generate export metadata: ${error instanceof Error ? error.message : 'unknown error'}`);
      return fallback;
    }
  }

  private buildFallbackExportMetadata(
    userGoal: string,
    commands: BrowserCommand[],
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>,
  ): RecorderExportMetadata {
    const hasLogin = parameters.some((item) => /用户名|密码/.test(item.description))
      || commands.some((command) => command.tool === 'fill')
      || /登录|signin|log in/i.test(userGoal);
    const executionEntryText = commands
      .find((command) => command.tool === 'click' && typeof command.params.text === 'string')
      ?.params.text;
    const entryName = typeof executionEntryText === 'string' && executionEntryText.trim()
      ? executionEntryText.trim()
      : '目标页面';

    const name = hasLogin
      ? `登录并进入${entryName}`
      : this.buildSkillName(userGoal).replace(/^browser_recording_/, '') || '浏览器任务执行';
    const parameterSummary = parameters.length > 0
      ? `关键参数包括${parameters.map((item) => item.description).join('、')}。`
      : '当前流程无需额外参数。';

    return {
      name: name.slice(0, 255),
      description: `自动完成${userGoal}。${parameterSummary}`.slice(0, 1000),
    };
  }

  private inferSuggestedParameters(
    observation: Pick<RecorderDebugObservation, 'inputs' | 'buttons' | 'title' | 'text'>,
  ): Array<{ name: string; label: string; required: boolean; reason: string }> {
    const params = new Map<string, { name: string; label: string; required: boolean; reason: string }>();
    const pageSignals = [
      observation.title || '',
      observation.text || '',
      ...observation.buttons.map((button) => String(button.text || '')),
    ].join(' ').toLowerCase();

    const addParam = (name: string, label: string, reason: string, required = true) => {
      if (!params.has(name)) {
        params.set(name, { name, label, required, reason });
      }
    };

    for (const rawInput of observation.inputs) {
      const input = rawInput as Record<string, unknown>;
      const combined = [
        input.name,
        input.placeholder,
        input.label,
        input.labelText,
        input.id,
        input.type,
        input.autocomplete,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (/(search|query|keyword|搜|查询|检索)/i.test(combined) || /(百度一下|搜索)/.test(pageSignals)) {
        addParam('keyword', '搜索关键词', '页面存在明显搜索输入入口');
        continue;
      }
      if (/(username|user name|login|account|user|用户名|账号|账户)/i.test(combined)) {
        addParam('username', '用户名/账号', '检测到账号类输入框');
        continue;
      }
      if (/(email|邮箱|mail)/i.test(combined)) {
        addParam('email', '邮箱', '检测到邮箱输入框');
        continue;
      }
      if (/(phone|mobile|tel|手机号|电话)/i.test(combined)) {
        addParam('phone', '手机号', '检测到手机号输入框');
        continue;
      }
      if (/(password|pass|密码)/i.test(combined)) {
        addParam('password', '密码', '检测到密码输入框');
        continue;
      }
      if (/(date range|daterange|date_range|日期范围|时间范围|起止日期|开始日期|结束日期)/i.test(combined)) {
        addParam('dateRange', '日期范围', '检测到时间范围输入');
        continue;
      }
      if (/(date|日期|时间|start date|end date)/i.test(combined)) {
        addParam('date', '日期', '检测到日期输入');
        continue;
      }
      if (/(code|otp|captcha|verification|验证码|校验码)/i.test(combined)) {
        addParam('verificationCode', '验证码', '检测到验证码输入');
        continue;
      }
    }

    if (params.size === 0 && /(百度一下|搜索|search)/i.test(pageSignals)) {
      addParam('keyword', '搜索关键词', '页面包含搜索语义按钮或标题');
    }

    return [...params.values()];
  }

  private buildStructureProbeScript(): string {
    return `() => JSON.stringify((() => {
      const collectRoots = root => {
        const roots = [root];
        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        elements.forEach(element => {
          if (element.shadowRoot) {
            roots.push(...collectRoots(element.shadowRoot));
          }
        });
        return roots;
      };

      const roots = collectRoots(document);

      const isVisible = element => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const toText = value => (value || '').replace(/\\s+/g, ' ').trim();

      const queryAllAcrossRoots = selector => roots.flatMap(root => [...(root.querySelectorAll ? root.querySelectorAll(selector) : [])]);
      const uniqueElements = elements => [...new Set(elements)];

      const inputs = uniqueElements([
        ...queryAllAcrossRoots('input'),
        ...queryAllAcrossRoots('textarea'),
        ...queryAllAcrossRoots('select'),
        ...queryAllAcrossRoots('[contenteditable="true"]'),
        ...queryAllAcrossRoots('[role="textbox"]'),
        ...queryAllAcrossRoots('[role="searchbox"]'),
        ...queryAllAcrossRoots('[role="combobox"]'),
      ])
        .filter(isVisible)
        .slice(0, 8)
        .map((element, index) => ({
          index,
          tag: element.tagName.toLowerCase(),
          id: element.getAttribute('id') || undefined,
          type: element.getAttribute('type') || undefined,
          name: element.getAttribute('name') || undefined,
          placeholder: element.getAttribute('placeholder') || undefined,
          label: element.getAttribute('aria-label') || undefined,
          autocomplete: element.getAttribute('autocomplete') || undefined,
          labelText: element.labels && element.labels[0] ? toText(element.labels[0].textContent) : undefined,
          required: element.hasAttribute('required'),
          value: 'value' in element ? toText(element.value) : toText(element.textContent),
        }));

      const buttons = uniqueElements([
        ...queryAllAcrossRoots('button'),
        ...queryAllAcrossRoots('[role="button"]'),
        ...queryAllAcrossRoots('input[type="submit"]'),
        ...queryAllAcrossRoots('input[type="button"]'),
        ...queryAllAcrossRoots('a[href]'),
      ])
        .filter(isVisible)
        .slice(0, 8)
        .map((element, index) => ({
          index,
          text: toText(element.textContent) || element.getAttribute('value') || element.getAttribute('aria-label') || 'button',
          role: element.getAttribute('role') || undefined,
        }));

      const headings = uniqueElements([
        ...queryAllAcrossRoots('h1'),
        ...queryAllAcrossRoots('h2'),
        ...queryAllAcrossRoots('h3'),
        ...queryAllAcrossRoots('[role="heading"]'),
      ])
        .filter(isVisible)
        .slice(0, 6)
        .map((element) => toText(element.textContent))
        .filter(Boolean);

      const links = uniqueElements(queryAllAcrossRoots('a[href]'))
        .filter(isVisible)
        .slice(0, 6)
        .map((element) => toText(element.textContent) || element.getAttribute('href'))
        .filter(Boolean);

      return {
        url: window.location.href,
        title: document.title,
        inputs,
        buttons,
        headings,
        links,
      };
    })())`;
  }
}
