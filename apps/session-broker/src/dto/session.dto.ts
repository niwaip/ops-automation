import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsUUID } from 'class-validator';

export class WorkerEndpointsDto {
  @ApiProperty({ example: 'http://10.0.0.5:8080/vnc.html', description: 'noVNC endpoint URL' })
  novnc!: string;

  @ApiProperty({ example: 'ws://10.0.0.5:9222', description: 'Chrome DevTools Protocol endpoint URL' })
  cdp!: string;

  @ApiPropertyOptional({ example: 'vnc://10.0.0.5:5900', description: 'VNC endpoint URL' })
  vnc?: string;
}

export class SessionDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Session ID' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'User ID' })
  user_id!: string;

  @ApiProperty({
    example: 'RUNNING',
    enum: ['IDLE', 'RUNNING', 'HUMAN_CONTROL', 'CLOSED', 'ERROR'],
    description: 'Session state'
  })
  state!: string;

  @ApiProperty({
    example: 'AGENT_RUNNING',
    enum: ['AGENT_RUNNING', 'HUMAN_CONTROL'],
    description: 'Control mode'
  })
  control_mode!: string;

  @ApiProperty({ example: false, description: 'Whether session is frozen (CDP input disabled)' })
  frozen!: boolean;

  @ApiPropertyOptional({ example: 'worker-pod-123', description: 'Worker reference' })
  worker_ref?: string;

  @ApiPropertyOptional({ type: WorkerEndpointsDto, description: 'Worker endpoints' })
  endpoints?: WorkerEndpointsDto;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002', description: 'Template ID' })
  template_id?: string;

  @ApiPropertyOptional({ example: { username: 'test' }, description: 'Session parameters' })
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'fill_username', description: 'Current step ID' })
  current_step?: string;

  @ApiPropertyOptional({ example: 2, description: 'Current step index' })
  step_index?: number;

  @ApiProperty({ example: 1712345678, description: 'Creation timestamp (Unix)' })
  created_at!: number;

  @ApiProperty({ example: 1712345999, description: 'Last activity timestamp (Unix)' })
  last_activity!: number;
}

export class CreateSessionRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'User ID' })
  @IsUUID()
  user_id!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002', description: 'Template ID' })
  @IsOptional()
  @IsUUID()
  template_id?: string;

  @ApiPropertyOptional({ example: { username: 'test' }, description: 'Session parameters' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class CreateSessionResponseDto {
  @ApiProperty({ type: SessionDto, description: 'Created session' })
  session!: SessionDto;

  @ApiProperty({ type: WorkerEndpointsDto, description: 'Worker endpoints' })
  endpoints!: WorkerEndpointsDto;
}

export class StartSessionRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002', description: 'Template ID' })
  @IsUUID()
  template_id!: string;

  @ApiProperty({ example: { username: 'test' }, description: 'Session parameters' })
  @IsObject()
  params!: Record<string, unknown>;
}

export class TakeoverSessionRequestDto {
  @ApiProperty({ example: 'User intervention required', description: 'Reason for takeover' })
  @IsString()
  reason!: string;
}

export class ContinueSessionRequestDto {
  @ApiProperty({ example: 'fill_username', description: 'Step ID to continue from' })
  @IsString()
  step_id!: string;
}

export class DeleteSessionResponseDto {
  @ApiProperty({ example: true, description: 'Success status' })
  success!: boolean;
}