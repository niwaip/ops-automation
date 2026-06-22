import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateSemanticRuleErrorLogDto {
  @IsString()
  domain_code!: string;

  @IsOptional()
  @IsString()
  rule_set_id?: string;

  @IsString()
  source!: string;

  @IsString()
  error_type!: string;

  @IsOptional()
  @IsString()
  error_code?: string;

  @IsString()
  error_message!: string;

  @IsOptional()
  @IsString()
  input_text?: string;

  @IsOptional()
  @IsString()
  normalized_input?: string;

  @IsOptional()
  @IsString()
  trace_id?: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsString()
  task_id?: string;

  @IsOptional()
  @IsString()
  step_id?: string;

  @IsOptional()
  @IsString()
  page_url?: string;

  @IsOptional()
  @IsString()
  page_title?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  page_type?: string;

  @IsOptional()
  @IsString()
  observation_summary?: string;

  @IsOptional()
  @IsObject()
  candidate_summary?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  matched_rule_ids?: string[];

  @IsOptional()
  @IsObject()
  normalized_semantic?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  parser_output?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ai_fallback_input?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  ai_fallback_output?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  screenshot_url?: string;

  @IsOptional()
  @IsString()
  dom_snippet?: string;

  @IsOptional()
  @IsObject()
  locator_info?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  console_errors?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListSemanticRuleErrorLogsQueryDto {
  @IsOptional()
  @IsString()
  domain_code?: string;

  @IsOptional()
  @IsString()
  rule_set_id?: string;

  @IsOptional()
  @IsString()
  trace_id?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  error_type?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  page_type?: string;

  @IsOptional()
  @IsString()
  login_status?: string;

  @IsOptional()
  @IsString()
  login_reason?: string;

  @IsOptional()
  @IsString()
  navigation_status?: string;

  @IsOptional()
  @IsString()
  navigation_reason?: string;

  @IsOptional()
  @IsString()
  field_fill_status?: string;

  @IsOptional()
  @IsString()
  field_fill_reason?: string;

  @IsOptional()
  @IsString()
  action_status?: string;

  @IsOptional()
  @IsString()
  action_reason?: string;

  @IsOptional()
  @IsString()
  read_status?: string;

  @IsOptional()
  @IsString()
  read_reason?: string;
}
