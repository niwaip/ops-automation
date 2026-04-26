import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsObject, IsEnum } from 'class-validator';

export class WorkerEndpointsDto {
  @ApiProperty({ example: 'http://localhost:8080', description: 'noVNC endpoint URL' })
  @IsString()
  novnc!: string;

  @ApiProperty({ example: 'http://localhost:9222', description: 'Chrome DevTools Protocol endpoint URL' })
  @IsString()
  cdp!: string;

  @ApiProperty({ example: 'vnc://localhost:5900', description: 'VNC endpoint URL', required: false })
  @IsOptional()
  @IsString()
  vnc?: string;
}

export class CreateWorkerRequestDto {
  @ApiProperty({ example: 'user-123', description: 'User ID for the worker' })
  @IsString()
  user_id!: string;

  @ApiProperty({ example: '/profiles/user-123/chrome', description: 'Chrome profile path', required: false })
  @IsOptional()
  @IsString()
  profile_path?: string;

  @ApiProperty({ example: 'https://example.com', description: 'Initial URL to navigate to', required: false })
  @IsOptional()
  @IsString()
  initial_url?: string;
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

  @ApiProperty({ example: 'running', enum: ['starting', 'running', 'stopping', 'stopped', 'error'], description: 'Worker status' })
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
  CLICK = 'click',
  FILL = 'fill',
  SCREENSHOT = 'screenshot',
  SNAPSHOT = 'snapshot',
  EVALUATE = 'evaluate',
  WAIT = 'wait',
  SCROLL = 'scroll',
  PRESS_KEY = 'press_key',
  HOVER = 'hover',
}

export class ExecuteStepDto {
  @ApiProperty({ description: 'Execution ID this step belongs to' })
  @IsString()
  executionId!: string;

  @ApiProperty({ description: 'Runtime session ID' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({ description: 'Step ID' })
  @IsString()
  stepId!: string;

  @ApiProperty({ description: 'Action to perform', enum: ['goto', 'click', 'fill', 'screenshot', 'snapshot', 'evaluate', 'wait', 'scroll', 'press_key', 'hover'] })
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

export class FreezeBrowserSessionDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({ description: 'Reason for freezing execution', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResumeBrowserSessionDto {
  @ApiProperty({ description: 'Runtime session ID associated with the browser session' })
  @IsString()
  runtimeSessionId!: string;

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
