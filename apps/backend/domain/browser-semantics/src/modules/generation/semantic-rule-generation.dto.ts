import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CreateSemanticRuleSetDto,
  type CreateSemanticRuleDto,
  type CreateSemanticRuleTargetingDto,
} from '../rule-set/semantic-rule-set.dto';

export class GenerateSemanticRuleSetDraftDto {
  @IsString()
  domain_code!: string;

  @IsOptional()
  @IsIn([
    'LOGIN',
    'NAVIGATION',
    'FIELD_FILL',
    'MENU_SELECTION',
    'DETAIL_OPEN',
    'READ_VALUE',
    'ROW_ACTION',
    'SEARCH',
    'GENERIC_ALIAS',
  ])
  category?: import('../../types/semantic-rule.types').SemanticRuleCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  error_log_ids?: string[];

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  max_logs?: number;

  @IsOptional()
  @IsString()
  created_by?: string;
}

export interface SemanticRuleGenerationSourceErrorLog {
  id: string;
  created_at: string;
  source: string;
  error_type: string;
  error_message: string;
  input_text?: string | null;
  normalized_input?: string | null;
  trace_id?: string | null;
  host?: string | null;
  page_type?: string | null;
}

export interface SemanticRuleGenerationDraftSummary {
  domain_code: string;
  sample_count: number;
  rule_count: number;
  source_count: number;
  error_type_count: number;
  host_count: number;
  page_type_count: number;
  source_error_log_ids: string[];
}

export interface SemanticRuleGenerationDraftRuleSet
  extends Pick<CreateSemanticRuleSetDto, 'domain_code' | 'key' | 'name' | 'version' | 'description' | 'created_by'> {
  rules: CreateSemanticRuleDto[];
  targetings: CreateSemanticRuleTargetingDto[];
}

export interface GenerateSemanticRuleSetDraftResponse {
  generated: boolean;
  reason?: string;
  generation_trace_id: string;
  summary: SemanticRuleGenerationDraftSummary;
  draft_rule_set: SemanticRuleGenerationDraftRuleSet;
  explanations: string[];
  risks: string[];
  source_error_logs: SemanticRuleGenerationSourceErrorLog[];
  generation_metadata: Record<string, unknown>;
}

export class CommitSemanticRuleSetDraftDto {
  @IsString()
  @IsNotEmpty()
  generation_trace_id!: string;

  @ValidateNested()
  @Type(() => CreateSemanticRuleSetDto)
  draft_rule_set!: CreateSemanticRuleSetDto;

  @IsOptional()
  @IsString()
  based_on_rule_set_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  source_error_log_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  review_notes?: string[];
}
