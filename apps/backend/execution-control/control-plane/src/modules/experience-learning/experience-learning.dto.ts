import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { PlanningDecisionV1 } from '@ops/backend-planning-decision';

export const ROUTE_SOURCES = [
  'saved_workflow',
  'recipe',
  'top_k',
  'full_planner',
  'no_match',
] as const;

export class ResolveScopedMemoryQueryDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  kind!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{0,127}$/)
  memoryKey!: string;
}

export class UpsertOwnScopedMemoryDto extends ResolveScopedMemoryQueryDto {
  @IsObject()
  value!: Record<string, unknown>;
}

const RECIPE_SCOPE_TYPES = ['organization', 'team', 'user'] as const;
const RECIPE_RISK_LEVELS = ['L0', 'L1', 'L2', 'L3'] as const;
const RECIPE_PROMOTION_TARGETS = ['approved', 'canary', 'active'] as const;

export class CreateCandidateRecipeDto {
  @IsString()
  @IsIn(RECIPE_SCOPE_TYPES)
  scopeType!: (typeof RECIPE_SCOPE_TYPES)[number];

  @IsUUID()
  scopeId!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  intentFingerprint!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  topologyDigest!: string;

  @IsObject()
  recipe!: Record<string, unknown>;

  @IsString()
  @IsIn(RECIPE_RISK_LEVELS)
  riskLevel!: (typeof RECIPE_RISK_LEVELS)[number];
}

export class RecordCandidateRecipeEvaluationDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.:-]{1,255}$/)
  fixtureId!: string;

  @IsBoolean()
  passed!: boolean;

  @IsObject()
  comparison!: Record<string, unknown>;
}

export class PromoteCandidateRecipeDto {
  @IsString()
  @IsIn(RECIPE_PROMOTION_TARGETS)
  target!: (typeof RECIPE_PROMOTION_TARGETS)[number];
}

export class RecordRoutingObservationDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  requestFingerprint!: string;

  @IsString()
  @IsIn(ROUTE_SOURCES)
  routeSource!: (typeof ROUTE_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  matchMethod?: string;

  @IsOptional()
  @IsUUID()
  selectedSourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  selectedVersion?: string;

  @IsInt()
  @Min(0)
  @Max(1000)
  candidateCount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  matchScore?: number;

  @IsBoolean()
  plannerInvoked!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  plannerInputTokens?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contractStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  businessStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  routingPolicyVersion?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  routingPolicyDigest?: string;
}

export class RecordPlanningDecisionDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  requestFingerprint!: string;

  @IsOptional()
  @IsUUID()
  executionId?: string;

  @IsBoolean()
  shadow!: boolean;

  @IsObject()
  decision!: PlanningDecisionV1;
}

export const LLM_USAGE_PURPOSES = [
  'route',
  'topology',
  'parameter_binding',
  'llm_operation',
  'result_presentation',
  'compaction',
] as const;

export class RecordModelInvocationDto {
  @IsOptional()
  @IsUUID()
  executionId?: string;

  @IsOptional()
  @IsUUID()
  planningDecisionId?: string;

  @IsOptional()
  @IsUUID()
  stepId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  traceId?: string;

  @IsString()
  @IsIn(LLM_USAGE_PURPOSES)
  purpose!: (typeof LLM_USAGE_PURPOSES)[number];

  @IsString()
  @MaxLength(64)
  provider!: string;

  @IsString()
  @MaxLength(255)
  modelId!: string;

  @IsString()
  @MaxLength(100)
  promptTemplateVersion!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  promptTemplateDigest!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  systemPromptDigest!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  catalogSnapshotDigest?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  modelPolicyDigest?: string;

  @IsObject()
  generationParameters!: Record<string, unknown>;

  @IsArray()
  inputRefs!: unknown[];

  @IsInt()
  @Min(0)
  inputTokens!: number;

  @IsInt()
  @Min(0)
  outputTokens!: number;

  @IsInt()
  @Min(0)
  cachedTokens!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class AttachModelInvocationsDto {
  @IsString()
  @MaxLength(128)
  traceId!: string;

  @IsUUID()
  executionId!: string;
}

export class HabitGovernanceActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdatePersonalizationDto {
  @IsBoolean()
  recommendationEnabled!: boolean;
}

export class UpdateUserHabitStatusDto {
  @IsString()
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled';
}
