import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const NOTIFICATION_SOURCE_VALUES = ['execution', 'report'] as const;
export type NotificationSource = typeof NOTIFICATION_SOURCE_VALUES[number];

export const NOTIFICATION_SEVERITY_VALUES = ['success', 'error', 'warning', 'info'] as const;
export type NotificationSeverity = typeof NOTIFICATION_SEVERITY_VALUES[number];

export const NOTIFICATION_CATEGORY_VALUES = [
  'completed',
  'failed',
  'cancelled',
  'waiting_input',
  'pending_approval',
  'human_control',
  'status_update',
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORY_VALUES[number];

export class NotificationListQueryDto {
  @ApiProperty({ required: false, enum: NOTIFICATION_SOURCE_VALUES, description: 'Optional notification source filter' })
  @IsOptional()
  @IsIn(NOTIFICATION_SOURCE_VALUES)
  source?: NotificationSource;

  @ApiProperty({ required: false, default: 20, description: 'Maximum number of notifications to return' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false, default: false, description: 'Only return notifications requiring action' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  requiresActionOnly?: boolean;
}

export class AppNotificationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dedupeKey: string;

  @ApiProperty({ enum: NOTIFICATION_SOURCE_VALUES })
  source: NotificationSource;

  @ApiProperty()
  sourceId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceName?: string;

  @ApiProperty({ enum: NOTIFICATION_SEVERITY_VALUES })
  severity: NotificationSeverity;

  @ApiProperty({ enum: NOTIFICATION_CATEGORY_VALUES })
  category: NotificationCategory;

  @ApiProperty({ required: false, description: 'Source-specific status, such as execution status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'State key used by frontend to detect unread changes' })
  stateKey: string;

  @ApiProperty()
  timestamp: string;

  @ApiProperty()
  unread: boolean;

  @ApiProperty()
  requiresAction: boolean;

  @ApiProperty()
  actionUrl: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [AppNotificationDto] })
  items: AppNotificationDto[];

  @ApiProperty()
  total: number;
}
