import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateNested,
} from 'class-validator';
import type {
  SemanticRuleCategory,
  SemanticRuleSetStatus,
  SemanticRuleType,
} from '../../types/semantic-rule.types';
import { SemanticRuleOutputsConstraint } from './semantic-rule-output.validation';

export class CreateSemanticRuleDto {
  @IsIn(['INTENT_ALIAS', 'FIELD_ALIAS', 'REGION_ALIAS', 'ENTITY_ALIAS', 'ROW_REFERENCE', 'READ_INTENT', 'LOGIN_PHRASE'])
  type!: SemanticRuleType;

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
  category?: SemanticRuleCategory;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsInt()
  @Min(0)
  priority!: number;

  @IsOptional()
  @IsBoolean()
  stop_on_match?: boolean;

  @IsOptional()
  @IsString()
  flags?: string;

  @IsArray()
  @IsString({ each: true })
  patterns!: string[];

  @IsObject()
  @Validate(SemanticRuleOutputsConstraint)
  outputs!: Record<string, unknown>;
}

export class CreateSemanticRuleTargetingDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  environments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hosts?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tenant_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  user_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skill_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  page_types?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sample_rate?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateSemanticRuleSetDto {
  @IsString()
  @IsNotEmpty()
  domain_code!: string;

  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  based_on_rule_set_id?: string;

  @IsOptional()
  @IsString()
  change_summary?: string;

  @IsString()
  @IsNotEmpty()
  created_by!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSemanticRuleDto)
  rules!: CreateSemanticRuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSemanticRuleTargetingDto)
  targetings?: CreateSemanticRuleTargetingDto[];
}

export class ReplaceSemanticRuleCategoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSemanticRuleDto)
  rules!: CreateSemanticRuleDto[];
}

export class UpdateSemanticRuleSetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSemanticRuleDto)
  rules?: CreateSemanticRuleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSemanticRuleTargetingDto)
  targetings?: CreateSemanticRuleTargetingDto[];
}

export class ReplaceSemanticRuleCategoryParamsDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

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
  category!: SemanticRuleCategory;
}

export class ListSemanticRuleSetsQueryDto {
  @IsOptional()
  @IsString()
  domain_code?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'VALIDATING', 'CANARY', 'ACTIVE', 'ARCHIVED', 'ROLLED_BACK'])
  status?: SemanticRuleSetStatus;

  @IsOptional()
  @IsString()
  key?: string;
}
