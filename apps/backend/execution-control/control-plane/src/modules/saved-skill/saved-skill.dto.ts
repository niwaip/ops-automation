import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SaveExecutionAsSkillDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateSavedSkillAliasesDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  aliases!: string[];
}

export interface SavedSkillReviewIssueDto {
  code: string;
  severity: 'warning' | 'error';
  path?: string;
  message: string;
}

export interface SavedSkillReviewDto {
  decision: 'pass' | 'warning' | 'block';
  summary: string;
  planChanged: false;
  reviewedAt: string;
  model?: string;
  issues: SavedSkillReviewIssueDto[];
}

export interface SavedSkillDto {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string;
  visibility: 'private';
  status: 'active' | 'blocked' | 'disabled' | 'pending_review';
  version: string;
  sourceExecutionId: string;
  stepCount: number;
  aliases: string[];
  /** Normalized active-habit keys, only returned when personalization is enabled. */
  habitIntentKeys: string[];
  fixedInput: Record<string, unknown>;
  paramsSchema: Record<string, unknown>;
  planHash: string;
  inputHash: string;
  review: SavedSkillReviewDto;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSaveEligibilityDto {
  eligible: boolean;
  executionId: string;
  executionMode?: string;
  stepCount: number;
  suggestedName?: string;
  fixedInput?: Record<string, unknown>;
  frozenStepInputs?: Array<{
    nodeId: string;
    sequence: number;
    title: string;
    parameters: Record<string, unknown>;
  }>;
  reasonCode?: string;
  message?: string;
  savedSkillId?: string;
  savedSkillVersion?: string;
}
