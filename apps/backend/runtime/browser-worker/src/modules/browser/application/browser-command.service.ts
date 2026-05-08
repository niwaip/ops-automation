import { Injectable } from '@nestjs/common';
import {
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../../dto/worker.dto';
import {
  BrowserExecutionAdapter,
  BrowserExecutionBackend,
  MCPCommand,
} from '../adapters/browser-execution.adapter';
import { ChromeDevtoolsCliAdapter } from '../adapters/chrome-devtools-cli.adapter';
import { PlaywrightCliAdapter } from '../adapters/playwright-cli.adapter';
import { BrowserActionStep } from '../domain/browser-step.types';
import { BrowserStepService } from './browser-step.service';

@Injectable()
export class BrowserCommandService {
  private readonly adapters: Map<BrowserExecutionBackend, BrowserExecutionAdapter>;

  constructor(
    private readonly playwrightCliAdapter: PlaywrightCliAdapter,
    private readonly chromeDevtoolsCliAdapter: ChromeDevtoolsCliAdapter,
    private readonly browserStepService: BrowserStepService,
  ) {
    this.adapters = new Map<BrowserExecutionBackend, BrowserExecutionAdapter>([
      ['cli', this.playwrightCliAdapter],
      ['chrome-devtools', this.chromeDevtoolsCliAdapter],
    ]);
  }

  async executeCommands(
    commands: MCPCommand[],
    options?: { backend?: BrowserExecutionBackend; runtimeSessionId?: string },
  ): Promise<{ success: boolean; results: any[]; message?: string; steps?: BrowserActionStep[] }> {
    const backend = options?.backend || 'cli';
    const adapter = this.getAdapter(backend);
    const adapterOptions = {
      runtimeSessionId: options?.runtimeSessionId,
    };
    const execution = await adapter.executeCommands(commands, adapterOptions);
    const steps = await this.browserStepService.buildSteps(
      commands,
      execution.results as Array<Record<string, unknown>>,
      backend,
      adapter,
      adapterOptions,
    );
    return {
      ...execution,
      steps,
    };
  }

  async executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    return this.getAdapter((dto.backend || 'cli') as BrowserExecutionBackend).executeStep(dto);
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.getAdapter((dto.backend || 'cli') as BrowserExecutionBackend).freeze(dto);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.getAdapter((dto.backend || 'cli') as BrowserExecutionBackend).resume(dto);
  }

  getAdapters(): BrowserExecutionAdapter[] {
    return [...this.adapters.values()];
  }

  private getAdapter(backend: BrowserExecutionBackend): BrowserExecutionAdapter {
    const adapter = this.adapters.get(backend);
    if (!adapter) {
      throw new Error(`Browser execution backend not registered: ${backend}`);
    }
    return adapter;
  }
}
