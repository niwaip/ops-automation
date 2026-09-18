import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MAX_REMINDER_CRON_LENGTH,
  MAX_REMINDER_MESSAGE_LENGTH,
  MAX_REMINDER_TIMEZONE_LENGTH,
  MAX_REMINDER_TITLE_LENGTH,
  SNOOZE_ALLOWED_MINUTES,
  type SnoozeMinutes,
} from './reminder.constants';

export class CreateReminderDto {
  @IsString() @IsOptional() @MaxLength(MAX_REMINDER_TITLE_LENGTH) title?: string;
  @IsString() @IsNotEmpty() @MaxLength(MAX_REMINDER_MESSAGE_LENGTH) message!: string;
  @IsString() @IsOptional() @MaxLength(MAX_REMINDER_CRON_LENGTH) cronExpression?: string;
  @IsString() @IsOptional() runAt?: string;
  @IsString() @IsOptional() @MaxLength(MAX_REMINDER_TIMEZONE_LENGTH) timezone?: string;
  @IsBoolean() @IsOptional() sendWechat?: boolean;
}

export class UpdateReminderDto {
  @IsString() @IsOptional() @MaxLength(MAX_REMINDER_TITLE_LENGTH) title?: string;
  @IsString() @IsNotEmpty() @MaxLength(MAX_REMINDER_MESSAGE_LENGTH) @IsOptional() message?: string;
  @IsString() @MaxLength(MAX_REMINDER_CRON_LENGTH) @IsOptional() cronExpression?: string;
  @IsString() @IsOptional() runAt?: string | null;
  @IsString() @MaxLength(MAX_REMINDER_TIMEZONE_LENGTH) @IsOptional() timezone?: string;
  @IsBoolean() @IsOptional() sendWechat?: boolean;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class SnoozeReminderDto {
  @IsIn(SNOOZE_ALLOWED_MINUTES) minutes!: SnoozeMinutes;
}

