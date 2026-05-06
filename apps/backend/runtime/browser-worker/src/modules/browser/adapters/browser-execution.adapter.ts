import {
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../../dto/worker.dto';

export type BrowserExecutionBackend = 'legacy' | 'cli' | 'chrome-devtools' | 'mcp';

export interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
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
    options?: BrowserExecutionOptions,
  ): Promise<{ success: boolean; results: any[]; message?: string }>;
  resetBrowser(options?: BrowserExecutionOptions): Promise<void>;
  executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto>;
  freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto>;
  resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto>;
  onModuleDestroy?(): Promise<void>;
}
