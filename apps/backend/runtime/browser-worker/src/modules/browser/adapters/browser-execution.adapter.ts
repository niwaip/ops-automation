import {
  AssertBrowserStateDto,
  BrowserPageAssertionResultDto,
  BrowserPageStateDto,
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  InspectBrowserStateDto,
  ResumeBrowserSessionDto,
} from '../../../dto/worker.dto';
import { BrowserRuntimeLocator } from '../domain/browser-step.types';

export type BrowserExecutionBackend = 'cli' | 'chrome-devtools' | 'mcp';

export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: BrowserRuntimeLocator;
  assertion?: {
    type: string;
    expected?: unknown;
  };
}

export interface BrowserInitOptions {
  runtimeSessionId?: string;
  initialUrl?: string;
  sessionPreferences?: {
    mode?: 'interactive' | 'agent';
    enableCodegen?: boolean;
    headless?: boolean;
  };
}

export interface BrowserExecutionOptions {
  runtimeSessionId?: string;
  includeArtifacts?: boolean;
  includeSteps?: boolean;
}

export interface BrowserExecutionAdapter {
  readonly backend: BrowserExecutionBackend;

  initBrowser(options?: BrowserInitOptions): Promise<{
    success: boolean;
    message: string;
    endpoints?: {
      novnc?: string;
      cdp?: string;
      vnc?: string;
    };
  }>;
  executeCommands(
    commands: MCPCommand[],
    options?: BrowserExecutionOptions
  ): Promise<{ success: boolean; results: any[]; message?: string }>;
  resetBrowser(options?: BrowserExecutionOptions): Promise<void>;
  executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto>;
  inspectState(dto: InspectBrowserStateDto): Promise<BrowserPageStateDto>;
  assertState(dto: AssertBrowserStateDto): Promise<BrowserPageAssertionResultDto>;
  freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto>;
  resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto>;
  generateLocator?(
    targetRef: string,
    options?: BrowserExecutionOptions
  ): Promise<string | undefined>;
  onModuleDestroy?(): Promise<void>;
}
