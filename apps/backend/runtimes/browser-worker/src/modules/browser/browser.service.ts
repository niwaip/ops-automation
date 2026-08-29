import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  AssertBrowserStateDto,
  BrowserPageAssertionResultDto,
  BrowserControlStateDto,
  BrowserPageStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  InspectBrowserStateDto,
  ResumeBrowserSessionDto,
} from '../../dto/worker.dto';
import { BrowserExecutionBackend, MCPCommand } from './adapters/browser-execution.adapter';
import { BrowserCommandService } from './application/browser-command.service';
import { BrowserSessionService } from './application/browser-session.service';
import {
  BrowserScriptExportService,
  ExportOptions,
} from './application/browser-script-export.service';
import { BrowserSchemaService } from './application/browser-schema.service';
import { BrowserStepResultEnricherService } from './application/browser-step-result-enricher.service';
import { BrowserActionStep } from './domain/browser-step.types';
import { BrowserSessionPreferences } from './domain/browser.types';
import { BrowserStepRecoveryService } from './application/browser-step-recovery.service';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly browserCommandService: BrowserCommandService,
    private readonly browserScriptExportService: BrowserScriptExportService,
    private readonly browserSchemaService: BrowserSchemaService,
    private readonly browserStepResultEnricherService: BrowserStepResultEnricherService,
    private readonly browserStepRecoveryService: BrowserStepRecoveryService
  ) {}

  async onModuleDestroy() {
    for (const adapter of this.browserCommandService.getAdapters()) {
      await adapter.onModuleDestroy?.();
    }
  }

  exportScript(steps: BrowserActionStep[], options?: ExportOptions): string {
    return this.browserScriptExportService.exportToPlaywright(steps, options);
  }

  generateParamsSchema(steps: BrowserActionStep[]): Record<string, any> {
    return this.browserSchemaService.generateParamsSchema(steps);
  }

  async initBrowser(options?: {
    backend?: BrowserExecutionBackend;
    runtimeSessionId?: string;
    initialUrl?: string;
    sessionPreferences?: BrowserSessionPreferences;
  }): Promise<{ success: boolean; message: string; endpoints?: any }> {
    return this.browserSessionService.initBrowser(options);
  }

  async executeCommands(
    commands: MCPCommand[],
    options?: {
      backend?: BrowserExecutionBackend;
      runtimeSessionId?: string;
      includeArtifacts?: boolean;
      includeSteps?: boolean;
    }
  ): Promise<{ success: boolean; results: any[]; message?: string; steps?: BrowserActionStep[] }> {
    return this.browserCommandService.executeCommands(commands, options);
  }

  async resetBrowser(options?: {
    backend?: BrowserExecutionBackend;
    runtimeSessionId?: string;
  }): Promise<void> {
    await this.browserSessionService.resetBrowser(options);
  }

  async executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    const maxAttempts = this.browserStepRecoveryService.resolveMaxAttempts(dto);
    let attempt = 0;
    let currentResult!: ExecuteStepResultDto;

    while (attempt < maxAttempts) {
      attempt += 1;
      const attemptDto = { ...dto, attempt: (dto.attempt || 1) + attempt - 1 };
      const rawResult = await this.browserCommandService.executeStep(attemptDto);
      // Content extraction is intentionally independent from P0 artifact
      // normalization. A recorder may opt into a capture profile without
      // changing the legacy artifact presentation during the rollout.
      currentResult =
        process.env.BROWSER_NORMALIZED_ARTIFACTS_ENABLED === 'false' &&
        process.env.BROWSER_CONTENT_EXTRACTION_ENABLED === 'false'
          ? rawResult
          : await this.browserStepResultEnricherService.enrich({
              dto: attemptDto,
              result: rawResult,
              inspect: () =>
                this.browserCommandService.inspectState({
                  runtimeSessionId: dto.runtimeSessionId,
                  backend: dto.backend,
                }),
            });

      if (!this.browserStepRecoveryService.shouldRetry(dto, currentResult, attempt)) break;
      await this.browserStepRecoveryService.waitBeforeRetry(dto);
    }

    return this.browserStepRecoveryService.withRecoveryEvidence(currentResult, attempt);
  }

  async inspectState(dto: InspectBrowserStateDto): Promise<BrowserPageStateDto> {
    return this.browserCommandService.inspectState(dto);
  }

  async assertState(dto: AssertBrowserStateDto): Promise<BrowserPageAssertionResultDto> {
    return this.browserCommandService.assertState(dto);
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.browserSessionService.freeze(dto);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.browserSessionService.resume(dto);
  }

  // v4.1 P0: recorder state capture/restore/cleanup — delegates to session service.
  // Worker owns file lifecycle under PLAYWRIGHT_CLI_ARTIFACT_DIR/recorder-state/.

  async captureState(options: {
    runtimeSessionId: string;
    executionIndex: number;
  }): Promise<{ stateHandle: string; url?: string; capturedAt: string }> {
    return this.browserSessionService.captureState(options);
  }

  async restoreState(options: { runtimeSessionId: string; stateHandle: string }): Promise<{
    restored: boolean;
    partial?: boolean;
    reason?: string;
    url?: string;
  }> {
    return this.browserSessionService.restoreState(options);
  }

  async cleanupStateFilesAfter(options: {
    runtimeSessionId: string;
    executionIndex: number;
  }): Promise<{ cleanedCount: number }> {
    return this.browserSessionService.cleanupStateFilesAfter(options);
  }

  async cleanupAllStateFiles(options: {
    runtimeSessionId: string;
  }): Promise<{ cleanedCount: number }> {
    return this.browserSessionService.cleanupAllStateFiles(options);
  }
}
