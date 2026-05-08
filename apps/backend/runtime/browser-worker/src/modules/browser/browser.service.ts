import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../dto/worker.dto';
import { BrowserExecutionBackend, MCPCommand } from './adapters/browser-execution.adapter';
import { BrowserCommandService } from './application/browser-command.service';
import { BrowserSessionService } from './application/browser-session.service';
import { BrowserScriptExportService, ExportOptions } from './application/browser-script-export.service';
import { BrowserSchemaService } from './application/browser-schema.service';
import { BrowserActionStep } from './domain/browser-step.types';
import { BrowserSessionPreferences } from './domain/browser.types';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  constructor(
    private readonly browserSessionService: BrowserSessionService,
    private readonly browserCommandService: BrowserCommandService,
    private readonly browserScriptExportService: BrowserScriptExportService,
    private readonly browserSchemaService: BrowserSchemaService,
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
    options?: { backend?: BrowserExecutionBackend; runtimeSessionId?: string },
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
    return this.browserCommandService.executeStep(dto);
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.browserSessionService.freeze(dto);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.browserSessionService.resume(dto);
  }
}
