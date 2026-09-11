import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AssertBrowserStateDto,
  BrowserControlStateDto,
  BrowserPageAssertionResultDto,
  BrowserPageStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  InspectBrowserStateDto,
  ResumeBrowserSessionDto,
} from '../../../dto/worker.dto';
import {
  BrowserExecutionAdapter,
  BrowserExecutionOptions,
  BrowserInitOptions,
  MCPCommand,
} from './browser-execution.adapter';
import { WorkerService } from '../../worker/worker.service';
import {
  BrowserPageReadinessResult,
  BrowserPageReadinessService,
} from '../application/browser-page-readiness.service';
import {
  CliActionResult,
  CliExecResult,
  CliSessionState,
  PLAYWRIGHT_ARIA_ROLES,
  PlaywrightCliContext,
} from './playwright/playwright.types';
import { PlaywrightCliRunner } from './playwright/playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright/playwright-session.manager';
import { PlaywrightStateManager } from './playwright/playwright-state.manager';
import { PlaywrightNavigationHandler } from './playwright/playwright-navigation.handler';
import { PlaywrightPageReader } from './playwright/playwright-page-reader.handler';
import { PlaywrightInteractionHandler } from './playwright/playwright-interaction.handler';
import { PlaywrightInspectionHandler } from './playwright/playwright-inspection.handler';
import { PlaywrightSearchHandler } from './playwright/playwright-search.handler';

@Injectable()
export class PlaywrightCliAdapter implements BrowserExecutionAdapter, PlaywrightCliContext {
  readonly backend = 'cli' as const;
  static readonly PLAYWRIGHT_ARIA_ROLES = PLAYWRIGHT_ARIA_ROLES;

  private readonly logger = new Logger(PlaywrightCliAdapter.name);

  // Sub-modules
  private readonly cliRunner: PlaywrightCliRunner;
  private readonly sessionManager: PlaywrightSessionManager;
  private readonly stateManager: PlaywrightStateManager;
  private readonly navigationHandler: PlaywrightNavigationHandler;
  private readonly pageReader: PlaywrightPageReader;
  private readonly interactionHandler: PlaywrightInteractionHandler;
  private readonly inspectionHandler: PlaywrightInspectionHandler;
  private readonly searchHandler: PlaywrightSearchHandler;

  constructor(
    @Optional() private readonly workerService?: WorkerService,
    @Optional()
    private readonly pageReadiness: BrowserPageReadinessService = new BrowserPageReadinessService(),
    @Optional() cliRunner?: PlaywrightCliRunner,
    @Optional() sessionManager?: PlaywrightSessionManager,
    @Optional() stateManager?: PlaywrightStateManager,
    @Optional() navigationHandler?: PlaywrightNavigationHandler,
    @Optional() pageReader?: PlaywrightPageReader,
    @Optional() interactionHandler?: PlaywrightInteractionHandler,
    @Optional() inspectionHandler?: PlaywrightInspectionHandler,
    @Optional() searchHandler?: PlaywrightSearchHandler
  ) {
    this.cliRunner = cliRunner ?? new PlaywrightCliRunner(this.workerService);
    this.sessionManager =
      sessionManager ?? new PlaywrightSessionManager(this.cliRunner, this.workerService);
    this.stateManager =
      stateManager ?? new PlaywrightStateManager(this.cliRunner, this.sessionManager);
    this.navigationHandler =
      navigationHandler ??
      new PlaywrightNavigationHandler(this.cliRunner, this.sessionManager, this.pageReadiness);
    this.pageReader = pageReader ?? new PlaywrightPageReader(this.cliRunner, this.sessionManager);
    this.interactionHandler =
      interactionHandler ??
      new PlaywrightInteractionHandler(
        this.cliRunner,
        this.sessionManager,
        this.navigationHandler
      );
    this.inspectionHandler =
      inspectionHandler ??
      new PlaywrightInspectionHandler(this.cliRunner, this.sessionManager, this.pageReader);
    this.searchHandler =
      searchHandler ?? new PlaywrightSearchHandler(this.cliRunner, this.sessionManager);

    this.interactionHandler.setContext(this);
    this.stateManager.setContext(this);
  }

  async onModuleDestroy(): Promise<void> {
    await this.sessionManager.onModuleDestroy();
  }

  async initBrowser(options?: BrowserInitOptions): Promise<{ success: boolean; message: string }> {
    return this.sessionManager.initBrowser(options);
  }

  async resetBrowser(options?: BrowserExecutionOptions): Promise<void> {
    return this.sessionManager.resetBrowser(options);
  }

  async executeCommands(
    commands: MCPCommand[],
    options?: BrowserExecutionOptions
  ): Promise<{ success: boolean; results: any[]; message?: string }> {
    const sessionId = options?.runtimeSessionId || 'default';
    const includeArtifacts = options?.includeArtifacts !== false;
    const results: any[] = [];

    const totalCommands = commands.length;
    for (const [index, command] of commands.entries()) {
      try {
        const rawResult = await this.runCliAction(command.tool, command.params || {}, sessionId);
        const shouldEnrich =
          includeArtifacts &&
          this.inspectionHandler.shouldEnrichCommandResult(command.tool, index, totalCommands);
        const enrichedResult = shouldEnrich
          ? await this.enrichResultArtifacts(sessionId, rawResult)
          : rawResult;
        const result = includeArtifacts
          ? enrichedResult
          : this.inspectionHandler.stripResultArtifacts(enrichedResult);
        results.push(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          status: 'error',
          command: command.tool,
          message: errorMessage,
        });
      }
    }

    const success = results.every((result) => result.status !== 'error');
    const firstFailure = results.find((result) => result?.status === 'error');
    const failureSummary = firstFailure
      ? [
          String(firstFailure.command || 'unknown'),
          String(firstFailure.message || 'unknown error'),
        ].join(': ')
      : '';
    return {
      success,
      results,
      message: success
        ? undefined
        : failureSummary
          ? `One or more CLI commands failed. First failure: ${failureSummary}`
          : 'One or more CLI commands failed',
    };
  }

  async executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    const sessionId = dto.runtimeSessionId || 'default';

    try {
      const rawResult = await this.runCliAction(
        dto.action,
        {
          target: dto.target,
          ...dto.args,
        },
        sessionId
      );
      const readiness = await this.waitForStandardPageReadiness(dto, sessionId);
      const pageState = await this.inspectPageState(sessionId).catch(
        () =>
          ({
            runtimeSessionId: sessionId,
            pageUrl: this.getOrCreateSession(sessionId).lastUrl,
            observedAt: new Date().toISOString(),
          }) as BrowserPageStateDto
      );

      const requiredReadinessFailed = !readiness.ready && readiness.required;
      const isStepSuccess = !requiredReadinessFailed;

      const decision = this.inspectionHandler.shouldCaptureScreenshot({
        action: dto.action,
        success: isStepSuccess,
        pageState,
        sessionId,
        captureProfile: dto.captureProfile as Record<string, unknown> | undefined,
      });

      const result =
        this.normalizedArtifactsEnabled() ||
        (process.env.BROWSER_CONTENT_EXTRACTION_ENABLED !== 'false' && Boolean(dto.captureProfile))
          ? await this.enrichResultArtifacts(sessionId, rawResult, {
              captureScreenshot: decision.capture,
            }).catch(() => rawResult)
          : rawResult;

      if (decision.capture && (result.screenshot || result.snapshot?.path)) {
        this.inspectionHandler.updateLastSnapshotState(sessionId, {
          url: pageState.pageUrl,
          title: pageState.pageTitle,
          scrollX: pageState.scrollX,
          scrollY: pageState.scrollY,
          bodyLength: pageState.bodyLength,
          hasModal: pageState.hasModal,
        });
      }
      return {
        success: !requiredReadinessFailed,
        snapshotId: result.snapshot?.id,
        output: {
          ...(result as unknown as Record<string, unknown>),
          readiness,
          pageUrl: pageState.pageUrl,
          pageTitle: pageState.pageTitle,
          pageFingerprint: pageState.pageFingerprint,
        },
        artifacts: result.snapshot?.id
          ? [
              {
                type: 'snapshot',
                id: result.snapshot.id,
                metadata: {
                  ...(result.snapshot.path ? { path: result.snapshot.path } : {}),
                },
              },
            ]
          : undefined,
        snapshot: result.snapshot?.id
          ? {
              id: result.snapshot.id,
              type: 'browser',
              url: pageState.pageUrl,
              createdAt: pageState.observedAt,
              metadata: {
                ...(result.snapshot.path ? { path: result.snapshot.path } : {}),
                ...(pageState.pageTitle ? { pageTitle: pageState.pageTitle } : {}),
                ...(pageState.pageFingerprint
                  ? { pageFingerprint: pageState.pageFingerprint }
                  : {}),
              },
            }
          : undefined,
        pageState,
        shouldTakeover: false,
        ...(!readiness.ready && readiness.required
          ? {
              executionState: 'failed' as const,
              errorCode: 'PAGE_NOT_READY',
              errorMessage: '页面未达到模板声明的就绪条件',
              warningCodes: ['PAGE_READINESS_TIMEOUT'],
            }
          : !readiness.ready
            ? { warningCodes: ['PAGE_READINESS_TIMEOUT'] }
            : {}),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`CLI step execution failed: ${errorMessage}`);
      const failedResult = this.normalizedArtifactsEnabled()
        ? await this.enrichResultArtifacts(sessionId, {
            status: 'success',
            command: dto.action,
            stderr: errorMessage,
          }).catch(() => undefined)
        : undefined;
      const pageState = await this.inspectPageState(sessionId).catch(
        () =>
          ({
            runtimeSessionId: sessionId,
            pageUrl: this.getOrCreateSession(sessionId).lastUrl,
            observedAt: new Date().toISOString(),
          }) as BrowserPageStateDto
      );

      return {
        success: false,
        ...(failedResult
          ? {
              output: {
                ...(failedResult as unknown as Record<string, unknown>),
                pageUrl: pageState.pageUrl,
                pageTitle: pageState.pageTitle,
                pageFingerprint: pageState.pageFingerprint,
              },
              snapshotId: failedResult.snapshot?.id,
              snapshot: failedResult.snapshot?.id
                ? {
                    id: failedResult.snapshot.id,
                    type: 'browser',
                    url: pageState.pageUrl,
                    createdAt: pageState.observedAt,
                    metadata: failedResult.snapshot.path
                      ? { path: failedResult.snapshot.path }
                      : undefined,
                  }
                : undefined,
            }
          : {}),
        pageState,
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage,
        shouldTakeover: false,
      };
    }
  }

  async inspectState(dto: InspectBrowserStateDto): Promise<BrowserPageStateDto> {
    return this.inspectionHandler.inspectState(dto);
  }

  async assertState(dto: AssertBrowserStateDto): Promise<BrowserPageAssertionResultDto> {
    return this.inspectionHandler.assertState(dto);
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.sessionManager.freeze(dto);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.sessionManager.resume(dto);
  }

  async generateLocator(
    targetRef: string,
    options?: BrowserExecutionOptions & { timeoutMs?: number }
  ): Promise<string | undefined> {
    const sessionId = options?.runtimeSessionId || 'default';
    await this.ensureSessionReady(sessionId);
    // Use a fast probe timeout (default 2500ms) to avoid hanging 60s on obsolete target refs
    const probeTimeoutMs = options?.timeoutMs ?? 2500;
    try {
      const result = await this.execCli(
        sessionId,
        ['--raw', 'generate-locator', targetRef],
        probeTimeoutMs
      );
      this.cliRunner.assertNoCliError(result, 'Generate locator failed');
      const locator = result.stdout.trim();
      return locator || undefined;
    } catch {
      return undefined;
    }
  }

  // ── State Persistence (Checkpointing) ──
  async captureState(
    runtimeSessionId: string,
    executionIndex: number
  ): Promise<{ stateHandle: string; url?: string; capturedAt: string }> {
    return this.stateManager.captureState(runtimeSessionId, executionIndex);
  }

  async restoreState(
    runtimeSessionId: string,
    stateHandle: string
  ): Promise<{ restored: boolean; partial?: boolean; reason?: string; url?: string }> {
    return this.stateManager.restoreState(runtimeSessionId, stateHandle);
  }

  async cleanupStateFilesAfter(
    runtimeSessionId: string,
    executionIndex: number
  ): Promise<{ cleanedCount: number }> {
    return this.stateManager.cleanupStateFilesAfter(runtimeSessionId, executionIndex);
  }

  async cleanupAllStateFiles(runtimeSessionId: string): Promise<{ cleanedCount: number }> {
    return this.stateManager.cleanupAllStateFiles(runtimeSessionId);
  }

  // ── Core Action Dispatcher ──
  async runCliAction(
    action: string,
    params: Record<string, unknown>,
    sessionId: string
  ): Promise<CliActionResult> {
    await this.ensureDirectories();
    const normalizedParams = await this.interactionHandler.resolveRuntimeTargetRefs(
      action,
      params,
      sessionId,
      (ref, opts) => this.generateLocator(ref, opts)
    );

    this.reportDebugEvent(
      'B',
      'playwright-cli.adapter.ts:runCliAction:start',
      '[DEBUG] runCliAction start',
      {
        sessionId,
        action,
        params: this.cliRunner.summarizeParams(normalizedParams),
      }
    );

    try {
      let result: CliActionResult;
      switch (action) {
        case 'goto':
        case 'navigate':
          result = await this.navigationHandler.handleNavigate(
            sessionId,
            this.cliRunner.requireStringParam(normalizedParams, ['target', 'url'])
          );
          break;
        case 'click':
          result = await this.interactionHandler.handleClick(sessionId, normalizedParams);
          break;
        case 'fill':
          result = await this.interactionHandler.handleFill(sessionId, normalizedParams);
          break;
        case 'type':
        case 'type_text':
          result = await this.interactionHandler.handleTypeText(sessionId, normalizedParams);
          break;
        case 'press':
        case 'press_key':
          result = await this.handleSimpleCommand(sessionId, 'press', [
            this.cliRunner.requireStringParam(normalizedParams, ['key', 'target']),
          ]);
          break;
        case 'hover':
          result = await this.handleSimpleCommand(sessionId, 'hover', [
            this.cliRunner.requireStringParam(normalizedParams, ['target', 'selector']),
          ]);
          break;
        case 'drag':
          result = await this.handleSimpleCommand(sessionId, 'drag', [
            this.cliRunner.requireStringParam(normalizedParams, ['src']),
            this.cliRunner.requireStringParam(normalizedParams, ['dst']),
          ]);
          break;
        case 'screenshot':
          result = await this.inspectionHandler.handleScreenshot(sessionId, normalizedParams);
          break;
        case 'snapshot':
          result = await this.inspectionHandler.handleSnapshot(sessionId, normalizedParams);
          break;
        case 'evaluate':
          result = await this.inspectionHandler.handleEvaluate(
            sessionId,
            this.cliRunner.requireStringParam(normalizedParams, ['script'])
          );
          break;
        case 'wait':
          result = await this.interactionHandler.handleWait(sessionId, normalizedParams);
          break;
        case 'scroll':
          result = await this.interactionHandler.handleScroll(sessionId, normalizedParams);
          break;
        case 'read_page':
        case 'get_text':
          result = await this.pageReader.handleReadPage(sessionId, normalizedParams);
          break;
        case 'search':
          result = await this.searchHandler.handleSearch(
            sessionId,
            this.cliRunner.requireStringParam(normalizedParams, ['query', 'text'])
          );
          break;
        case 'smart_search':
          result = await this.searchHandler.handleSmartSearch(
            sessionId,
            this.cliRunner.requireStringParam(normalizedParams, ['query', 'text'])
          );
          break;
        case 'list_search_results':
        case 'inspect_search_results':
          result = await this.searchHandler.handleListSearchResults(sessionId, normalizedParams);
          break;
        case 'click_result':
          result = await this.searchHandler.handleClickResult(
            sessionId,
            this.cliRunner.requireNumberParam(normalizedParams, ['index'])
          );
          break;
        case 'click_table_row':
          result = await this.searchHandler.handleClickTableRow(
            sessionId,
            this.cliRunner.requireNumberParam(normalizedParams, ['index']),
            this.cliRunner.readOptionalStringParam(normalizedParams, ['scope']),
            this.cliRunner.readOptionalStringParam(normalizedParams, ['regionIdHint'])
          );
          break;
        case 'switch_latest_tab':
        case 'focus_latest_page':
          result = await this.navigationHandler.handleSwitchLatestTab(sessionId);
          break;
        case 'close_tab':
          result = await this.navigationHandler.handleCloseTab(sessionId);
          break;
        default:
          throw new Error(`Unsupported Playwright CLI action: ${action}`);
      }

      this.reportDebugEvent(
        'B',
        'playwright-cli.adapter.ts:runCliAction:success',
        '[DEBUG] runCliAction success',
        {
          sessionId,
          action,
          command: result.command,
        }
      );
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.reportDebugEvent(
        'B',
        'playwright-cli.adapter.ts:runCliAction:error',
        '[DEBUG] runCliAction failed',
        {
          sessionId,
          action,
          params: this.cliRunner.summarizeParams(normalizedParams),
          errorMessage,
        }
      );
      throw error;
    }
  }

  // ── Delegated / Backward-Compatible Methods (for tests & consumers) ──

  async ensureDirectories(): Promise<void> {
    return this.sessionManager.ensureDirectories();
  }

  async ensureSessionReady(sessionId: string): Promise<void> {
    return this.sessionManager.ensureSessionReady(sessionId);
  }

  async execCli(sessionId: string, args: string[], timeoutMs?: number): Promise<CliExecResult> {
    return this.cliRunner.execCli(sessionId, args, timeoutMs);
  }

  async handleSimpleCommand(
    sessionId: string,
    command: string,
    args: string[]
  ): Promise<CliActionResult> {
    return this.interactionHandler.handleSimpleCommand(sessionId, command, args);
  }

  normalizeSemanticRoleSelector(target: string): string {
    return this.interactionHandler.normalizeSemanticRoleSelector(target);
  }

  normalizeEvalStringOutput(output: string): string {
    return this.pageReader.normalizeEvalStringOutput(output);
  }

  async enrichResultArtifacts(
    sessionId: string,
    result: CliActionResult,
    options?: { captureScreenshot?: boolean }
  ): Promise<CliActionResult> {
    return this.inspectionHandler.enrichResultArtifacts(sessionId, result, options);
  }

  async settlePageAfterAction(sessionId: string): Promise<void> {
    return this.navigationHandler.settlePageAfterAction(sessionId);
  }

  async inspectPageState(sessionId: string): Promise<BrowserPageStateDto> {
    return this.inspectionHandler.inspectPageState(sessionId);
  }

  async waitForStandardPageReadiness(
    dto: ExecuteStepDto,
    sessionId: string
  ): Promise<BrowserPageReadinessResult> {
    return this.navigationHandler.waitForStandardPageReadiness(dto, sessionId, (out) =>
      this.normalizeEvalStringOutput(out)
    );
  }

  getOrCreateSession(sessionId: string): CliSessionState {
    return this.sessionManager.getOrCreateSession(sessionId);
  }

  async resolveStateFilePath(
    sessionId: string,
    executionIndex: number
  ): Promise<string> {
    return (this.stateManager as any).resolveStateFilePath(sessionId, executionIndex);
  }

  reportDebugEvent(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    location: string,
    msg: string,
    data: Record<string, unknown>
  ): void {
    this.cliRunner.reportDebugEvent(hypothesisId, location, msg, data);
  }

  normalizedArtifactsEnabled(): boolean {
    return process.env.BROWSER_NORMALIZED_ARTIFACTS_ENABLED !== 'false';
  }
}
