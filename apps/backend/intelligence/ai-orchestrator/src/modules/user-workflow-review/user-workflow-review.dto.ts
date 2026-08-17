import { IsObject, IsOptional, IsString } from 'class-validator';

export class ReviewUserWorkflowDto {
  @IsObject()
  planSnapshot!: Record<string, unknown>;

  @IsObject()
  fixedInput!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  businessResult?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sourceExecutionId?: string;
}

export interface UserWorkflowReviewIssue {
  code: string;
  severity: 'warning' | 'error';
  path?: string;
  message: string;
}

export interface UserWorkflowReviewResult {
  decision: 'pass' | 'warning' | 'block';
  summary: string;
  planChanged: false;
  reviewedAt: string;
  model?: string;
  issues: UserWorkflowReviewIssue[];
}
