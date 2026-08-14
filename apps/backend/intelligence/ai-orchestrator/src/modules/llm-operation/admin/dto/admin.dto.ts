import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import type { ActivationLabel, Environment } from '../../registry/types';

export enum EnvironmentDto {
  dev = 'dev',
  staging = 'staging',
  production = 'production',
  canary = 'canary',
}

export enum ActivationLabelDto {
  staging = 'staging',
  production = 'production',
  canary = 'canary',
}

export enum LlmOperationVersionStateDto {
  draft = 'draft',
  validating = 'validating',
  candidate = 'candidate',
  approved = 'approved',
  deprecated = 'deprecated',
  retired = 'retired',
  rejected = 'rejected',
}

export class CreateOperationDto {
  @IsString()
  operationKey!: string;

  @IsString()
  displayName!: string;

  @IsString()
  description!: string;

  @IsString()
  owner!: string;
}

export class CreateVersionDraftDto {
  @IsString()
  version!: string;

  @IsObject()
  manifestJson!: Record<string, unknown>;

  @IsString()
  changeSummary!: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class UpdateDraftDto {
  @IsObject()
  manifestJson!: Record<string, unknown>;

  @IsString()
  changeSummary!: string;

  @IsUUID()
  expectedVersionId!: string;
}

export class ApproveVersionDto {
  @IsUUID()
  expectedVersionId!: string;

  @IsString()
  approvedBy!: string;
}

export class ActivateVersionDto {
  @IsString()
  version!: string;

  @IsEnum(EnvironmentDto)
  environment!: Environment;

  @IsOptional()
  @IsEnum(ActivationLabelDto)
  label?: ActivationLabel;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;

  @IsString()
  actor!: string;

  @IsString()
  reason!: string;
}

export class RollbackDto {
  @IsEnum(EnvironmentDto)
  environment!: Environment;

  @IsString()
  actor!: string;

  @IsString()
  reason!: string;
}

export class AdjustCanaryDto {
  @IsEnum(EnvironmentDto)
  environment!: Environment;

  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent!: number;

  @IsString()
  actor!: string;

  @IsString()
  reason!: string;
}

export class ListOperationsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class DiffVersionsQueryDto {
  @IsString()
  fromVersion!: string;

  @IsString()
  toVersion!: string;
}

export interface VersionDiffResult {
  operationKey: string;
  from: {
    version: string;
    operationDigest: string;
    manifestJson: Record<string, unknown>;
  };
  to: {
    version: string;
    operationDigest: string;
    manifestJson: Record<string, unknown>;
  };
  changes: Array<{
    path: string;
    kind: 'added' | 'removed' | 'modified';
    fromValue?: unknown;
    toValue?: unknown;
  }>;
}
