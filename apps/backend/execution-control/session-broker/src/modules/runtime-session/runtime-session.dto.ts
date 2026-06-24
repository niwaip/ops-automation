import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsNumber, IsEnum } from 'class-validator';

export class CreateRuntimeSessionDto {
  @IsOptional()
  @IsUUID()
  @ApiProperty({ description: 'Execution ID to associate', required: false })
  executionId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Runtime type', example: 'browser', default: 'browser' })
  runtimeType?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Worker ID', required: false })
  workerId?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Profile ID', required: false })
  profileId?: string;

  @IsOptional()
  @ApiProperty({ description: 'Connection info endpoints', required: false })
  connectionInfo?: Record<string, unknown>;

  @IsString()
  @ApiProperty({ description: 'User ID for allocation' })
  userId!: string;
}

export class RuntimeSessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ required: false })
  executionId?: string;

  @ApiProperty({ default: 'browser' })
  runtimeType!: string;

  @ApiProperty({ required: false })
  workerId?: string;

  @ApiProperty({ required: false })
  profileId?: string;

  @ApiProperty({ enum: ['allocating', 'ready', 'busy', 'frozen', 'closed', 'error'] })
  state!: string;

  @ApiProperty({ default: 'AGENT_RUNNING' })
  controlMode!: string;

  @ApiProperty({ required: false })
  connectionInfo?: Record<string, unknown>;

  @ApiProperty({ required: false })
  healthStatus?: string;

  @ApiProperty({ required: false })
  freezeReason?: string;

  @ApiProperty({ required: false })
  lastActivityAt?: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ required: false })
  closedAt?: Date;
}

export class FreezeRuntimeSessionDto {
  @IsString()
  @ApiProperty({ description: 'Reason for freeze', example: 'Human takeover requested' })
  reason!: string;
}

export class ResumeRuntimeSessionDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Step ID to resume from', required: false })
  stepId?: string;
}

export class CloseRuntimeSessionDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Reason for closing', required: false })
  reason?: string;
}

export class ListRuntimeSessionsDto {
  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Page number', default: 1 })
  page?: number;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ description: 'Page size', default: 10 })
  pageSize?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Filter by state', required: false })
  state?: string;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ description: 'Filter by execution ID', required: false })
  executionId?: string;
}
