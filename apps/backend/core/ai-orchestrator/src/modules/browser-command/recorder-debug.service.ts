import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { BrowserCommand, BrowserCommandService } from './browser-command.service';
import { ModelService } from '../model/model.service';
import { RedisService } from '../redis/redis.service';

type RecorderDebugBackend = 'legacy' | 'cli' | 'chrome-devtools' | 'mcp';
type RecorderDebugTurnRole = 'user' | 'assistant' | 'system';

interface BrowserExecuteResponse {
  success: boolean;
  results: Array<Record<string, any>>;
  message?: string;
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
      const exportArtifacts = this.buildExportArtifacts(session, message);
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
        session.executedCommands.push(...parsed.commands);
        if (execution.success) {
          void this.refreshObservationAfterExecution(session.sessionId);
        }

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
    return response;
  }

  async exportArtifacts(request: Omit<RecorderDebugChatRequest, 'message'> & { userGoal?: string }) {
    const sessionId = request.sessionId || `recorder-debug-${Date.now()}`;
    const session = await this.loadOrCreateSession(sessionId, request);
    const exportArtifacts = this.buildExportArtifacts(session, request.userGoal || '浏览器调试任务');
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
    const commandsToRun = options?.appendDefaultWait
      ? this.appendDefaultWait(commands)
      : commands;

    const response = await axios.post<BrowserExecuteResponse>(
      `${this.browserWorkerUrl}/browser/execute`,
      {
        backend: session.backend,
        runtimeSessionId: session.runtimeSessionId,
        commands: commandsToRun,
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

  private async refreshObservationAfterExecution(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return;
    }

    const refreshedObservation = await this.observePageSafely(
      session,
      session.lastObservation,
    );
    session.lastObservation = refreshedObservation;
    session.currentPageUrl = refreshedObservation.currentPageUrl || session.currentPageUrl;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  private appendDefaultWait(commands: BrowserCommand[]): BrowserCommand[] {
    if (this.defaultPostCommandWaitMs <= 0) {
      return commands;
    }

    if (this.postCommandWaitStrategy === 'none') {
      return commands;
    }

    if (this.postCommandWaitStrategy === 'per_command') {
      return commands.flatMap((command) => {
        if (command.tool === 'wait') {
          return [command];
        }

        return [
          command,
          {
            tool: 'wait',
            params: { duration: this.defaultPostCommandWaitMs },
            description: `等待 ${this.defaultPostCommandWaitMs}ms`,
          },
        ];
      });
    }

    const lastCommand = commands[commands.length - 1];
    if (!lastCommand || lastCommand.tool === 'wait') {
      return commands;
    }

    return [
      ...commands,
      {
        tool: 'wait',
        params: { duration: this.defaultPostCommandWaitMs },
        description: `等待 ${this.defaultPostCommandWaitMs}ms`,
      },
    ];
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

  private buildExportArtifacts(
    session: RecorderDebugSession,
    userGoal: string,
  ): RecorderDebugExportArtifacts {
    const parameters = this.inferSkillParameters(session.executedCommands);
    const outputs = this.inferSkillOutputs(session.executedCommands, session.lastObservation);
    const publishPayload = this.buildSkillPublishPayload({
      userGoal,
      backend: session.backend,
      runtimeSessionId: session.runtimeSessionId,
      commands: session.executedCommands,
      parameters,
      outputs,
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
        name: 'recorder-debug-generated-skill',
        description: `由 Recorder Debug Chat 生成，目标为：${userGoal}`,
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
      lines.push(...this.buildPlaywrightCommandLines(command, parameters, index + 1));
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
  ): string[] {
    switch (command.tool) {
      case 'navigate':
        return [
          `  await page.goto(${this.resolveScriptValue('url', command.params.url, parameters)});`,
        ];
      case 'search':
      case 'smart_search':
        return [
          '  {',
          '    const searchInput = await findSearchInput(page);',
          '    await searchInput.click();',
          `    await searchInput.fill(${this.resolveScriptValue('query', command.params.query, parameters)});`,
          '    await searchInput.press("Enter");',
          '    await page.waitForLoadState("domcontentloaded").catch(() => {});',
          '  }',
        ];
      case 'click_result':
        return [
          `  page = await clickSearchResult(page, context, ${this.resolveScriptValue('resultIndex', command.params.index, parameters)});`,
        ];
      case 'switch_latest_tab':
        return [
          '  page = context.pages().at(-1) || page;',
          '  await page.bringToFront().catch(() => {});',
        ];
      case 'click':
        if (typeof command.params.selector === 'string') {
          return [`  await page.locator(${this.toJavaScriptLiteral(command.params.selector)}).first().click();`];
        }
        if (typeof command.params.text === 'string') {
          return [`  await page.getByText(${this.toJavaScriptLiteral(command.params.text)}, { exact: false }).first().click();`];
        }
        return ['  // Unsupported click command payload'];
      case 'fill':
        if (typeof command.params.selector === 'string') {
          return [
            `  await page.locator(${this.toJavaScriptLiteral(command.params.selector)}).first().fill(${this.resolveScriptValue('value', command.params.value, parameters)});`,
          ];
        }
        return ['  // Unsupported fill command payload'];
      case 'type_text':
        return [
          `  await page.keyboard.type(${this.resolveScriptValue('value', command.params.text, parameters)});`,
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
    parameterName: string,
    fallbackValue: unknown,
    parameters: Array<{
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>,
  ): string {
    const matched = parameters.find((param) => param.name === parameterName);
    if (matched) {
      return this.toScriptConstName(matched.name);
    }
    return this.toJavaScriptLiteral(fallbackValue);
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
    const params = new Map<string, {
      name: string;
      description: string;
      required: boolean;
      exampleValue?: string;
      source?: string;
    }>();

    for (const command of commands) {
      if (command.tool === 'navigate' && typeof command.params.url === 'string') {
        params.set('url', {
          name: 'url',
          description: '目标页面地址',
          required: true,
          exampleValue: command.params.url,
          source: 'navigate.url',
        });
      }
      if ((command.tool === 'search' || command.tool === 'smart_search') && typeof command.params.query === 'string') {
        params.set('query', {
          name: 'query',
          description: '搜索关键词',
          required: true,
          exampleValue: command.params.query,
          source: `${command.tool}.query`,
        });
      }
      if (command.tool === 'fill' && typeof command.params.value === 'string') {
        params.set('value', {
          name: 'value',
          description: '输入框内容',
          required: true,
          exampleValue: command.params.value,
          source: 'fill.value',
        });
      }
      if (command.tool === 'click_result' && command.params.index !== undefined) {
        params.set('resultIndex', {
          name: 'resultIndex',
          description: '搜索结果序号，从 1 开始',
          required: false,
          exampleValue: String(command.params.index),
          source: 'click_result.index',
        });
      }
    }

    return [...params.values()];
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
      name: this.buildSkillName(input.userGoal),
      description: `浏览器录制生成技能：${input.userGoal}`,
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
