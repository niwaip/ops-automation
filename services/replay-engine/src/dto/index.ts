import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsObject, IsString } from 'class-validator';

/**
 * Replay Engine DTOs
 */

export class StartReplayRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Session ID' })
  @IsUUID()
  session_id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'Template ID' })
  @IsUUID()
  template_id!: string;

  @ApiProperty({ example: { username: 'test', password: 'secret' }, description: 'Template parameters' })
  @IsObject()
  params!: Record<string, unknown>;
}

export class StartReplayResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002', description: 'Execution ID' })
  execution_id!: string;
}

export class StopReplayRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Session ID' })
  @IsUUID()
  session_id!: string;
}

export class StopReplayResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success!: boolean;
}

export class ExecutionStatusResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002', description: 'Execution ID' })
  execution_id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Session ID' })
  session_id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'Template ID' })
  template_id!: string;

  @ApiProperty({
    example: 'running',
    enum: ['pending', 'running', 'paused', 'completed', 'failed', 'takeover'],
    description: 'Execution status'
  })
  status!: string;

  @ApiProperty({ example: 3, description: 'Current step index' })
  current_step_index!: number;

  @ApiProperty({ example: 10, description: 'Total steps in template' })
  total_steps!: number;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Started at timestamp' })
  started_at!: Date;

  @ApiPropertyOptional({ example: '2024-01-01T00:05:00Z', description: 'Completed at timestamp' })
  completed_at?: Date;

  @ApiPropertyOptional({ example: 'Element not found', description: 'Error message if failed' })
  error?: string;
}

export class StepLogDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440003', description: 'Log entry ID' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Session ID' })
  session_id!: string;

  @ApiProperty({ example: 'step_001', description: 'Step ID' })
  step_id!: string;

  @ApiProperty({ example: 0, description: 'Step index' })
  step_index!: number;

  @ApiProperty({ example: 'click', description: 'Action type' })
  action!: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', description: 'Started at timestamp' })
  started_at!: Date;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:05Z', description: 'Completed at timestamp' })
  completed_at?: Date;

  @ApiPropertyOptional({ example: 500, description: 'Duration in milliseconds' })
  duration_ms?: number;

  @ApiProperty({ example: 'success', enum: ['success', 'failed', 'retry', 'takeover'], description: 'Step result' })
  result!: string;

  @ApiPropertyOptional({ example: 'ElementNotFoundError', description: 'Error class if failed' })
  error_class?: string;

  @ApiPropertyOptional({ example: 'Button not found', description: 'Error message if failed' })
  error_message?: string;

  @ApiProperty({ example: 0, description: 'Retry count' })
  retry_count!: number;

  @ApiProperty({ example: false, description: 'Whether takeover was triggered' })
  takeover_triggered!: boolean;
}

export class CDPConnectionStatusDto {
  @ApiProperty({ example: true, description: 'Connected status' })
  connected!: boolean;

  @ApiProperty({ example: 'ws://10.0.0.5:9222', description: 'CDP URL' })
  cdp_url!: string;

  @ApiPropertyOptional({ example: 'page-123', description: 'Page ID' })
  page_id?: string;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00Z', description: 'Connected at timestamp' })
  connected_at?: Date;
}

export class TakeoverRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Session ID' })
  @IsUUID()
  session_id!: string;

  @ApiProperty({ example: 'step_001', description: 'Step ID' })
  @IsString()
  step_id!: string;

  @ApiProperty({ example: 'Captcha detected', description: 'Reason for takeover' })
  @IsString()
  reason!: string;
}