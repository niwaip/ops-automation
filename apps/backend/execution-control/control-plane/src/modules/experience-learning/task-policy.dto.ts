import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const POLICY_SCOPE_TYPES = ['platform', 'organization', 'department', 'user'] as const;
const POLICY_PROPOSAL_TYPES = [
  'command_alias',
  'recipe_trigger',
  'capability_binding',
  'parameter_default',
] as const;

export class TaskCommandAliasInputDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,63}$/)
  canonicalCommand!: string;

  @IsString()
  @MaxLength(120)
  alias!: string;

  @IsOptional()
  @IsString()
  @IsIn(['exact', 'phrase', 'regex', 'semantic'])
  matchType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weight?: number;
}

export class TaskRecipeInputDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,99}$/)
  recipeKey!: string;

  @IsString()
  @MaxLength(64)
  version!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  requiredCommands!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  optionalCommands?: string[];

  @IsObject()
  trigger!: Record<string, unknown>;

  @IsArray()
  steps!: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  bindings?: Record<string, unknown>[];

  @IsArray()
  @IsString({ each: true })
  completionClaims!: string[];

  @IsOptional()
  @IsString()
  @IsIn(['L0', 'L1', 'L2', 'L3'])
  riskLevel?: string;
}

export class TaskCapabilityBindingInputDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,63}$/)
  capabilityRole!: string;

  @IsString()
  @MaxLength(255)
  capabilityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  capabilityVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsObject()
  inputMapping?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputMapping?: Record<string, unknown>;
}

export class CreateTaskPolicyDraftDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsString()
  @IsIn(POLICY_SCOPE_TYPES)
  scopeType!: (typeof POLICY_SCOPE_TYPES)[number];

  @IsString()
  @MaxLength(128)
  scopeId!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{1,64}$/)
  version!: string;

  @IsObject()
  policy!: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskCommandAliasInputDto)
  aliases!: TaskCommandAliasInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskRecipeInputDto)
  recipes!: TaskRecipeInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskCapabilityBindingInputDto)
  bindings!: TaskCapabilityBindingInputDto[];
}

export class CreateTaskPolicyProposalDto {
  @IsString()
  @IsIn(POLICY_PROPOSAL_TYPES)
  proposalType!: (typeof POLICY_PROPOSAL_TYPES)[number];

  @IsString()
  @IsIn(POLICY_SCOPE_TYPES)
  scopeType!: (typeof POLICY_SCOPE_TYPES)[number];

  @IsString()
  @MaxLength(128)
  scopeId!: string;

  @IsObject()
  patch!: Record<string, unknown>;

  @IsArray()
  evidence!: unknown[];

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;
}

export class ReviewTaskPolicyProposalDto {
  @IsString()
  @IsIn(['shadow', 'rejected'])
  status!: 'shadow' | 'rejected';
}
