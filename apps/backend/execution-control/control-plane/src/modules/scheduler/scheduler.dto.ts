import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateScheduleDto {
  @ApiProperty({ description: 'Schedule Name', example: 'Daily Report Generator' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Description', example: 'Generates report daily at 9am', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Target Skill ID', example: 'skill-uuid-here' })
  @IsString()
  @IsNotEmpty()
  skillId: string;

  @ApiProperty({ description: 'Target Skill Version', example: 'v1', required: false })
  @IsString()
  @IsOptional()
  skillVersion?: string;

  @ApiProperty({ description: 'Parameters input for execution', example: { date: '2026-06-25' } })
  @IsObject()
  input: Record<string, unknown>;

  @ApiProperty({ description: 'Cron Expression (5 fields)', example: '0 9 * * *' })
  @IsString()
  @IsNotEmpty()
  cronExpression: string;

  @ApiProperty({ description: 'Timezone', example: 'Asia/Shanghai', default: 'UTC', required: false })
  @IsString()
  @IsOptional()
  timezone?: string;
}

export class UpdateScheduleDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  input?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  cronExpression?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ScheduleDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  skillId: string;

  @ApiProperty({ required: false })
  skillVersion?: string;

  @ApiProperty()
  input: Record<string, unknown>;

  @ApiProperty()
  cronExpression: string;

  @ApiProperty()
  timezone: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  lastRunAt?: Date;

  @ApiProperty()
  nextRunAt: Date;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
