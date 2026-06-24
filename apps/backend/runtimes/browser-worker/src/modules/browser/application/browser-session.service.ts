import { Injectable, Logger } from '@nestjs/common';
import {
  BrowserControlStateDto,
  BrowserExecutionBackendDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../../dto/worker.dto';
import {
  BrowserExecutionAdapter,
  BrowserExecutionBackend,
} from '../adapters/browser-execution.adapter';
import { ChromeDevtoolsCliAdapter } from '../adapters/chrome-devtools-cli.adapter';
import { PlaywrightCliAdapter } from '../adapters/playwright-cli.adapter';
import { BrowserSessionRegistry } from '../infrastructure/browser-session.registry';
import { WorkerService } from '../../worker/worker.service';
import {
  BrowserEndpoints,
  BrowserRuntimeSessionState,
  BrowserSessionPreferences,
} from '../domain/browser.types';

@Injectable()
export class BrowserSessionService {
  private readonly logger = new Logger(BrowserSessionService.name);
  private readonly adapters: Map<BrowserExecutionBackend, BrowserExecutionAdapter>;

  constructor(
    private readonly workerService: WorkerService,
    private readonly sessionRegistry: BrowserSessionRegistry,
    private readonly playwrightCliAdapter: PlaywrightCliAdapter,
    private readonly chromeDevtoolsCliAdapter: ChromeDevtoolsCliAdapter
  ) {
    this.adapters = new Map<BrowserExecutionBackend, BrowserExecutionAdapter>([
      ['cli', this.playwrightCliAdapter],
      ['chrome-devtools', this.chromeDevtoolsCliAdapter],
    ]);
  }

  async initBrowser(options?: {
    backend?: BrowserExecutionBackend;
    runtimeSessionId?: string;
    initialUrl?: string;
    sessionPreferences?: BrowserSessionPreferences;
  }): Promise<{ success: boolean; message: string; endpoints?: BrowserEndpoints }> {
    const backend = options?.backend || 'cli';
    this.logger.log(`Initializing browser using backend: ${backend}`);

    const result = await this.getAdapter(backend).initBrowser({
      runtimeSessionId: options?.runtimeSessionId,
      initialUrl: options?.initialUrl,
      sessionPreferences: options?.sessionPreferences,
    });

    let endpoints = result.endpoints;
    if (options?.runtimeSessionId) {
      const worker = await this.workerService.getWorkerByRuntimeSessionId(options.runtimeSessionId);
      if (worker?.endpoints) {
        endpoints = worker.endpoints;
      }
      this.sessionRegistry.upsert(
        this.buildSessionState({
          runtimeSessionId: options.runtimeSessionId,
          backend,
          status: 'ready',
          endpoints,
        })
      );
    }

    return {
      ...result,
      endpoints,
    };
  }

  async resetBrowser(options?: {
    backend?: BrowserExecutionBackend;
    runtimeSessionId?: string;
  }): Promise<void> {
    const backend = options?.backend || 'cli';
    await this.getAdapter(backend).resetBrowser({
      runtimeSessionId: options?.runtimeSessionId,
    });

    if (options?.runtimeSessionId) {
      this.sessionRegistry.delete(options.runtimeSessionId);
    }
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    const result = await this.getAdapter(this.normalizeBackend(dto.backend)).freeze(dto);
    this.sessionRegistry.patch(dto.runtimeSessionId, {
      status: 'frozen',
      controlMode: 'HUMAN_CONTROL',
      reason: dto.reason,
    });
    return result;
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    const result = await this.getAdapter(this.normalizeBackend(dto.backend)).resume(dto);
    this.sessionRegistry.patch(dto.runtimeSessionId, {
      status: 'ready',
      controlMode: 'AGENT_RUNNING',
      reason: undefined,
    });
    return result;
  }

  getSession(runtimeSessionId: string): BrowserRuntimeSessionState | undefined {
    return this.sessionRegistry.get(runtimeSessionId);
  }

  private normalizeBackend(backend?: BrowserExecutionBackendDto): BrowserExecutionBackend {
    return (backend || BrowserExecutionBackendDto.CLI) as BrowserExecutionBackend;
  }

  private getAdapter(backend: BrowserExecutionBackend): BrowserExecutionAdapter {
    const adapter = this.adapters.get(backend);
    if (!adapter) {
      throw new Error(`Browser execution backend not registered: ${backend}`);
    }
    return adapter;
  }

  private buildSessionState(input: {
    runtimeSessionId: string;
    backend: BrowserExecutionBackend;
    status: BrowserRuntimeSessionState['status'];
    endpoints?: BrowserEndpoints;
  }): BrowserRuntimeSessionState {
    return {
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      status: input.status,
      endpoints: input.endpoints,
      controlMode: 'AGENT_RUNNING',
      updatedAt: new Date().toISOString(),
    };
  }
}
