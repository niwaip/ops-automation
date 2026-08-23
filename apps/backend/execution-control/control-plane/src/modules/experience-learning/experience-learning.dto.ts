import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ROUTE_SOURCES = [
  'saved_workflow',
  'recipe',
  'top_k',
  'full_planner',
  'no_match',
] as const;

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
