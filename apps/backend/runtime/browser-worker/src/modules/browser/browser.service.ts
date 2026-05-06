import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../dto/worker.dto';
import {
  BrowserExecutionAdapter,
  BrowserExecutionBackend,
  MCPCommand,
} from './adapters/browser-execution.adapter';
import { ChromeDevtoolsCliAdapter } from './adapters/chrome-devtools-cli.adapter';
import { LegacyCodegenAdapter } from './adapters/legacy-codegen.adapter';
import { PlaywrightCliAdapter } from './adapters/playwright-cli.adapter';
import { WorkerService } from '../worker/worker.service';

@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserService.name);
  private readonly adapters: Map<BrowserExecutionBackend, BrowserExecutionAdapter>;

  constructor(
    private readonly workerService: WorkerService,
    private readonly legacyCodegenAdapter: LegacyCodegenAdapter,
    private readonly playwrightCliAdapter: PlaywrightCliAdapter,
    private readonly chromeDevtoolsCliAdapter: ChromeDevtoolsCliAdapter,
  ) {
    this.adapters = new Map<BrowserExecutionBackend, BrowserExecutionAdapter>([
      ['legacy', this.legacyCodegenAdapter],
      ['cli', this.playwrightCliAdapter],
      ['chrome-devtools', this.chromeDevtoolsCliAdapter],
    ]);
  }

  async onModuleDestroy() {
    for (const adapter of this.adapters.values()) {
      await adapter.onModuleDestroy?.();
    }
  }

  async initBrowser(options?: {
    backend?: BrowserExecutionBackend;
    runtimeSessionId?: string;
    initialUrl?: string;
  }): Promise<{ success: boolean; message: string; endpoints?: any }> {
    const backend = options?.backend || 'legacy';
    this.logger.log(`Initializing browser using backend: ${backend}`);
    const result = await this.getAdapter(backend).initBrowser({
      runtimeSessionId: options?.runtimeSessionId,
      initialUrl: options?.initialUrl,
    });

    // If we have a runtimeSessionId, try to get the worker endpoints
    let endpoints;
    if (options?.runtimeSessionId) {
      const worker = await this.workerService.getWorkerByRuntimeSessionId(options.runtimeSessionId);
      if (worker) {
        endpoints = worker.endpoints;
      }
    }

    return {
      ...result,
      endpoints,
    };
  }

  async executeCommands(
    commands: MCPCommand[],
    options?: { backend?: BrowserExecutionBackend; runtimeSessionId?: string },
  ): Promise<{ success: boolean; results: any[]; message?: string }> {
    const backend = options?.backend || 'legacy';
    return this.getAdapter(backend).executeCommands(commands, {
      runtimeSessionId: options?.runtimeSessionId,
    });
  }

  async resetBrowser(options?: {
    backend?: BrowserExecutionBackend;
    runtimeSessionId?: string;
  }): Promise<void> {
    const backend = options?.backend || 'legacy';
    await this.getAdapter(backend).resetBrowser({
      runtimeSessionId: options?.runtimeSessionId,
    });
  }

  async executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    return this.getAdapter(dto.backend || 'legacy').executeStep(dto);
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.getAdapter(dto.backend || 'legacy').freeze(dto);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.getAdapter(dto.backend || 'legacy').resume(dto);
  }

  private getAdapter(backend: BrowserExecutionBackend): BrowserExecutionAdapter {
    const adapter = this.adapters.get(backend);
    if (!adapter) {
      throw new Error(`Browser execution backend not registered: ${backend}`);
    }
    return adapter;
  }
}
