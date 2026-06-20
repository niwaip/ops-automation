import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ReportFormat,
  ReportSection,
  ReportTemplateConfig,
  AIConfig,
  NotificationConfig,
  NotificationType,
  SectionType,
  SectionSource,
  ValidationFailAction,
} from '../../interfaces';

// Nested DTOs for validation
class StepFilterDTO {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];

  @IsOptional()
  @IsBoolean()
  success_only?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  step_ids?: string[];
}

class SectionValidationDTO {
  @IsString()
  @IsNotEmpty()
  condition!: string;

  @IsEnum(['skip', 'notify', 'stop'])
  on_fail!: ValidationFailAction;

  @IsOptional()
  @IsEnum(['email', 'webhook'])
  type?: NotificationType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsString()
  webhook_url?: string;

  @IsOptional()
  @IsString()
  message_template?: string;
}

class SectionFormatDTO {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columns?: string[];

  @IsOptional()
  @IsObject()
  style?: Record<string, any>;

  @IsOptional()
  width?: number;

  @IsOptional()
  height?: number;
}

class ReportSectionDTO {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(['text', 'table', 'image', 'chart'])
  type!: SectionType;

  @IsEnum(['step_result', 'ai_analysis', 'static'])
  source!: SectionSource;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StepFilterDTO)
  step_filter?: StepFilterDTO;

  @IsOptional()
  @IsString()
  ai_prompt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SectionValidationDTO)
  validation?: SectionValidationDTO;

  @IsOptional()
  @ValidateNested()
  @Type(() => SectionFormatDTO)
  format?: SectionFormatDTO;
}

class ReportTemplateConfigDTO {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  header?: string;

  @IsOptional()
  @IsString()
  footer?: string;

  @IsOptional()
  @IsEnum(['A4', 'A3', 'Letter'])
  page_size?: 'A4' | 'A3' | 'Letter';

  @IsOptional()
  @IsEnum(['portrait', 'landscape'])
  orientation?: 'portrait' | 'landscape';
}

class AIConfigDTO {
  @IsOptional()
  @IsString()
  model_id?: string;

  @IsOptional()
  temperature?: number;

  @IsOptional()
  max_tokens?: number;
}

class NotificationConfigDTO {
  @IsBoolean()
  enabled!: boolean;

  @IsEnum(['email', 'webhook'])
  type!: NotificationType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsString()
  webhook_url?: string;

  @IsOptional()
  @IsString()
  template?: string;
}

export class CreateReportTemplateDTO {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(['word', 'excel', 'pdf'])
  format!: ReportFormat;

  @IsOptional()
  @IsString()
  template_file?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportSectionDTO)
  sections!: ReportSection[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportTemplateConfigDTO)
  global_config?: ReportTemplateConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIConfigDTO)
  ai_config?: AIConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationConfigDTO)
  notification_config?: NotificationConfig;

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class UpdateReportTemplateDTO {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(['word', 'excel', 'pdf'])
  format?: ReportFormat;

  @IsOptional()
  @IsString()
  template_file?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportSectionDTO)
  sections?: ReportSection[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportTemplateConfigDTO)
  global_config?: ReportTemplateConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIConfigDTO)
  ai_config?: AIConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationConfigDTO)
  notification_config?: NotificationConfig;
}
