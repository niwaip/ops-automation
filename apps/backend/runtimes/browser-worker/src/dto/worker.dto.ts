import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsObject, IsEnum } from 'class-validator';

export class WorkerEndpointsDto {
  @ApiProperty({
    example: 'http://localhost:8080',
    description: 'noVNC endpoint URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  novnc?: string;

  @ApiProperty({
    example: 'http://localhost:9222',
    description: 'Chrome DevTools Protocol endpoint URL',
  })
  @IsString()
  cdp!: string;

  @ApiProperty({
    example: 'vnc://localhost:5900',
    description: 'VNC endpoint URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  vnc?: string;
}

export enum WorkerSessionModeDto {
  INTERACTIVE = 'interactive',
  AGENT = 'agent',
}

export class CreateWorkerRequestDto {
  @ApiProperty({ example: 'user-123', description: 'User ID for the worker' })
  @IsString()
  user_id!: string;

  @ApiProperty({
    example: '/profiles/user-123/chrome',
    description: 'Chrome profile path',
    required: false,
  })
  @IsOptional()
  @IsString()
  profile_path?: string;

  @ApiProperty({
    example: 'https://example.com',
    description: 'Initial URL to navigate to',
    required: false,
  })
  @IsOptional()
  @IsString()
  initial_url?: string;

  @ApiProperty({
    example: 'runtime-session-123',
    description: 'Runtime session ID to bind this worker to',
    required: false,
  })
  @IsOptional()
  @IsString()
  runtime_session_id?: string;

  @ApiProperty({
    example: 'interactive',
    enum: WorkerSessionModeDto,
    description: 'Session mode: interactive keeps GUI/noVNC, agent prefers lightweight automation',
    required: false,
    default: 'interactive',
  })
  @IsOptional()
  @IsEnum(WorkerSessionModeDto)
  mode?: 'interactive' | 'agent';

  @ApiProperty({
    example: true,
    description: 'Enable codegen HTTP API inside session container',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  enable_codegen?: boolean;

  @ApiProperty({
    example: false,
    description: 'Run Chrome in headless mode (no GUI/noVNC)',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  headless?: boolean;
}

export class CreateWorkerResponseDto {
  @ApiProperty({ example: 'worker-uuid-123', description: 'Created worker ID' })
  @IsString()
  worker_id!: string;

  @ApiProperty({ type: WorkerEndpointsDto, description: 'Worker endpoints' })
  @IsObject()
  endpoints!: WorkerEndpointsDto;
}

export class WorkerStatusDto {
  @ApiProperty({ example: 'worker-uuid-123', description: 'Worker ID' })
  @IsString()
  worker_id!: string;

  @ApiProperty({ example: 'user-123', description: 'User ID' })
  @IsString()
  user_id!: string;

  @ApiProperty({
    example: 'running',
    enum: ['starting', 'running', 'stopping', 'stopped', 'error'],
    description: 'Worker status',
  })
  @IsString()
  status!: string;

  @ApiProperty({ type: WorkerEndpointsDto, description: 'Worker endpoints' })
  @IsObject()
  endpoints!: WorkerEndpointsDto;

  @ApiProperty({ example: '/profiles/user-123/chrome', description: 'Chrome profile path' })
  @IsString()
  profile_path!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Creation timestamp' })
  created_at!: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Last update timestamp' })
  updated_at!: Date;
}

export class HealthCheckResponseDto {
  @ApiProperty({ example: true, description: 'Worker health status' })
  @IsBoolean()
  healthy!: boolean;

  @ApiProperty({ example: true, description: 'Chrome process running status' })
  @IsBoolean()
  chrome_running!: boolean;

  @ApiProperty({ example: 9222, description: 'CDP port number' })
  cdp_port!: number;

  @ApiProperty({ example: 8080, description: 'noVNC port number' })
  novnc_port!: number;
}

export class SystemHealthResponseDto {
  @ApiProperty({ example: 'ok', description: 'System health status' })
  @IsString()
  status!: string;

  @ApiProperty({ example: 5, description: 'Number of healthy workers' })
  workers!: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Check timestamp' })
  timestamp!: Date;
}

// ============================================
// Step Execution DTOs (NIW-139)
// ============================================

export enum StepAction {
  GOTO = 'goto',
  NAVIGATE = 'navigate',
  CLICK = 'click',
  FILL = 'fill',
  SCREENSHOT = 'screenshot',
  SNAPSHOT = 'snapshot',
  EVALUATE = 'evaluate',
  WAIT = 'wait',
  SCROLL = 'scroll',
  PRESS_KEY = 'press_key',
  HOVER = 'hover',
  SEARCH = 'search',
  SMART_SEARCH = 'smart_search',
  TYPE_TEXT = 'type_text',
  GET_TEXT = 'get_text',
  READ_PAGE = 'read_page',
  LIST_SEARCH_RESULTS = 'list_search_results',
  CLICK_RESULT = 'click_result',
  SWITCH_LATEST_TAB = 'switch_latest_tab',
  CLOSE_TAB = 'close_tab',
  FOCUS_LATEST_PAGE = 'focus_latest_page',
}

export enum BrowserExecutionBackendDto {
  CLI = 'cli',
  CHROME_DEVTOOLS = 'chrome-devtools',
  MCP = 'mcp',
}

export class BrowserPageStateDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({ description: 'Current page URL', required: false })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiProperty({ description: 'Current page title', required: false })
  @IsOptional()
  @IsString()
  pageTitle?: string;

  @ApiProperty({
    description: 'Lightweight page fingerprint for phase reconciliation',
    required: false,
  })
  @IsOptional()
  @IsString()
  pageFingerprint?: string;

  @ApiProperty({ description: 'Current document readyState', required: false })
  @IsOptional()
  @IsString()
  readyState?: string;

  @ApiProperty({ description: 'Timestamp when the page state was captured', required: false })
  @IsOptional()
  @IsString()
  observedAt?: string;
}

export class ArtifactRefDto {
  @ApiProperty({ description: 'Artifact type, e.g. snapshot or browser_artifact' })
  @IsString()
  type!: string;

  @ApiProperty({ description: 'Artifact ID', required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Artifact display name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Artifact URL', required: false })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({ description: 'Artifact mime type', required: false })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ description: 'Artifact size in bytes', required: false })
  @IsOptional()
  sizeBytes?: number;

  @ApiProperty({ description: 'Artifact metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SnapshotRefDto {
  @ApiProperty({ description: 'Snapshot ID' })
  @IsString()
  id!: string;

  @ApiProperty({ description: 'Snapshot type', required: false })
  @IsOptional()
  @IsString()
  type?: 'browser' | 'document' | 'workflow' | 'api' | 'custom';

  @ApiProperty({ description: 'Snapshot URL or page URL', required: false })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({ description: 'Snapshot creation timestamp', required: false })
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiProperty({ description: 'Snapshot metadata', required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ExecuteStepDto {
  @ApiProperty({ description: 'Execution ID this step belongs to' })
  @IsString()
  executionId!: string;

  @ApiProperty({ description: 'Runtime session ID' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({
    description: 'Browser execution backend',
    enum: BrowserExecutionBackendDto,
    required: false,
    default: BrowserExecutionBackendDto.CLI,
  })
  @IsOptional()
  @IsEnum(BrowserExecutionBackendDto)
  backend?: BrowserExecutionBackendDto;

  @ApiProperty({ description: 'Step ID' })
  @IsString()
  stepId!: string;

  @ApiProperty({
    description: 'Action to perform',
    enum: [
      'goto',
      'navigate',
      'click',
      'fill',
      'screenshot',
      'snapshot',
      'evaluate',
      'wait',
      'scroll',
      'press_key',
      'hover',
      'search',
      'smart_search',
      'type_text',
      'get_text',
      'read_page',
      'list_search_results',
      'click_result',
      'switch_latest_tab',
      'focus_latest_page',
    ],
  })
  @IsEnum(StepAction)
  action!: string;

  @ApiProperty({ description: 'Target selector or identifier', required: false })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiProperty({ description: 'Additional arguments for the action', required: false })
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;

  @ApiProperty({ description: 'Assertion to validate after action', required: false })
  @IsOptional()
  assertion?: {
    type: string;
    expected?: string;
  };
}

export class ExecuteStepResultDto {
  @ApiProperty({ description: 'Whether the step succeeded' })
  @IsBoolean()
  success!: boolean;

  @ApiProperty({ description: 'Snapshot ID for the step result', required: false })
  @IsOptional()
  @IsString()
  snapshotId?: string;

  @ApiProperty({ description: 'Output data from the step', required: false })
  @IsOptional()
  @IsObject()
  output?: Record<string, unknown>;

  @ApiProperty({
    description: 'Normalized artifact references aligned with the shared runtime contract',
    required: false,
    type: [ArtifactRefDto],
  })
  @IsOptional()
  artifacts?: ArtifactRefDto[];

  @ApiProperty({
    description: 'Normalized snapshot reference aligned with the shared runtime contract',
    required: false,
    type: SnapshotRefDto,
  })
  @IsOptional()
  @IsObject()
  snapshot?: SnapshotRefDto;

  @ApiProperty({
    description: 'Captured browser page state after step execution',
    required: false,
    type: BrowserPageStateDto,
  })
  @IsOptional()
  @IsObject()
  pageState?: BrowserPageStateDto;

  @ApiProperty({ description: 'Error code if step failed', required: false })
  @IsOptional()
  @IsString()
  errorCode?: string;

  @ApiProperty({ description: 'Error message if step failed', required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty({ description: 'Whether human takeover is required', default: false })
  @IsBoolean()
  shouldTakeover!: boolean;

  @ApiProperty({ description: 'Reason for takeover if required', required: false })
  @IsOptional()
  @IsString()
  takeoverReason?: string;
}

export class InspectBrowserStateDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({
    description: 'Browser execution backend',
    enum: BrowserExecutionBackendDto,
    required: false,
    default: BrowserExecutionBackendDto.CLI,
  })
  @IsOptional()
  @IsEnum(BrowserExecutionBackendDto)
  backend?: BrowserExecutionBackendDto;
}

export class AssertBrowserStateDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({
    description: 'Browser execution backend',
    enum: BrowserExecutionBackendDto,
    required: false,
    default: BrowserExecutionBackendDto.CLI,
  })
  @IsOptional()
  @IsEnum(BrowserExecutionBackendDto)
  backend?: BrowserExecutionBackendDto;

  @ApiProperty({ description: 'Expected exact page URL', required: false })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiProperty({ description: 'Expected page URL substring', required: false })
  @IsOptional()
  @IsString()
  pageUrlIncludes?: string;

  @ApiProperty({ description: 'Expected exact page title', required: false })
  @IsOptional()
  @IsString()
  pageTitle?: string;

  @ApiProperty({ description: 'Expected page title substring', required: false })
  @IsOptional()
  @IsString()
  pageTitleIncludes?: string;

  @ApiProperty({ description: 'Expected exact page fingerprint', required: false })
  @IsOptional()
  @IsString()
  pageFingerprint?: string;

  @ApiProperty({ description: 'Expected readyState', required: false })
  @IsOptional()
  @IsString()
  readyState?: string;

  @ApiProperty({ description: 'Selector that should exist on the page', required: false })
  @IsOptional()
  @IsString()
  selectorExists?: string;

  @ApiProperty({ description: 'Text that should exist within page content', required: false })
  @IsOptional()
  @IsString()
  textIncludes?: string;
}

export class BrowserPageAssertionResultDto {
  @ApiProperty({ description: 'Whether all provided browser assertions matched' })
  @IsBoolean()
  matched!: boolean;

  @ApiProperty({ description: 'Observed browser page state', type: BrowserPageStateDto })
  @IsObject()
  pageState!: BrowserPageStateDto;

  @ApiProperty({ description: 'Assertion details for debugging', required: false })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class FreezeBrowserSessionDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({
    description: 'Browser execution backend',
    enum: BrowserExecutionBackendDto,
    required: false,
    default: BrowserExecutionBackendDto.CLI,
  })
  @IsOptional()
  @IsEnum(BrowserExecutionBackendDto)
  backend?: BrowserExecutionBackendDto;

  @ApiProperty({ description: 'Reason for freezing execution', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResumeBrowserSessionDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({
    description: 'Browser execution backend',
    enum: BrowserExecutionBackendDto,
    required: false,
    default: BrowserExecutionBackendDto.CLI,
  })
  @IsOptional()
  @IsEnum(BrowserExecutionBackendDto)
  backend?: BrowserExecutionBackendDto;

  @ApiProperty({ description: 'Optional step ID to continue from', required: false })
  @IsOptional()
  @IsString()
  stepId?: string;
}

export class BrowserControlStateDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  runtimeSessionId!: string;

  @ApiProperty({ enum: ['AGENT_RUNNING', 'HUMAN_CONTROL'] })
  controlMode!: string;

  @ApiProperty({ description: 'Whether the browser session is currently frozen' })
  frozen!: boolean;

  @ApiProperty({ description: 'Reason for current frozen state', required: false })
  reason?: string;
}
