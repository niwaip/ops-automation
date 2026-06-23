import { IsOptional, IsString } from 'class-validator';

export class PromoteSemanticRuleSetToCanaryDto {
  @IsOptional()
  @IsString()
  release_note?: string;
}

export class PromoteSemanticRuleSetToActiveDto {
  @IsOptional()
  @IsString()
  release_note?: string;
}

export class RollbackSemanticRuleSetDto {
  @IsString()
  target_rule_set_id!: string;

  @IsString()
  reason!: string;
}

export class ListSemanticRuleReleasesQueryDto {
  @IsOptional()
  @IsString()
  rule_set_id?: string;

  @IsOptional()
  @IsString()
  domain_code?: string;

  @IsOptional()
  @IsString()
  key?: string;
}
