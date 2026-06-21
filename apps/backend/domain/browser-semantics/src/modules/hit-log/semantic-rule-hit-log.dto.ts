import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSemanticRuleHitLogDto {
  @IsString()
  domain_code!: string;

  @IsOptional()
  @IsString()
  rule_set_id?: string;

  @IsArray()
  @IsString({ each: true })
  matched_rule_ids!: string[];

  @IsString()
  input_text!: string;

  @IsOptional()
  @IsString()
  normalized_input?: string;

  @IsOptional()
  @IsString()
  page_type?: string;

  @IsOptional()
  @IsString()
  trace_id?: string;

  @IsBoolean()
  used_ai_fallback!: boolean;

  @IsOptional()
  @IsBoolean()
  final_execution_success?: boolean;

  @IsOptional()
  @IsObject()
  normalized_semantic?: Record<string, unknown>;
}

export class ListSemanticRuleHitLogsQueryDto {
  @IsOptional()
  @IsString()
  domain_code?: string;

  @IsOptional()
  @IsString()
  rule_set_id?: string;

  @IsOptional()
  @IsString()
  trace_id?: string;
}
