import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export enum CoordinationTaskType {
  approval = 'approval',
  assignment = 'assignment',
  review = 'review',
}

export enum CoordinationTaskStatus {
  pending = 'pending',
  in_progress = 'in_progress',
  approved = 'approved',
  rejected = 'rejected',
  completed = 'completed',
  canceled = 'canceled',
}

export enum CoordinationTaskPriority {
  low = 'low',
  medium = 'medium',
  high = 'high',
  urgent = 'urgent',
}

export interface CoordinationAttachment {
  name: string;
  url?: string;
  size?: number;
  mimeType?: string;
  storagePath?: string;
}

export interface CoordinationActionRecord {
  id: string;
  operatorId: string;
  operatorName?: string;
  action: 'approve' | 'reject' | 'complete';
  comment?: string;
  attachments?: CoordinationAttachment[];
  timestamp: string;
}

export class CreateCoordinationTaskDto {
  @IsString()
  @IsNotEmpty()
  assigneeId!: string;

  @IsString()
  @IsOptional()
  assigneeName?: string;

  @IsEnum(CoordinationTaskType)
  @IsOptional()
  taskType?: CoordinationTaskType = CoordinationTaskType.approval;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsEnum(CoordinationTaskPriority)
  @IsOptional()
  priority?: CoordinationTaskPriority = CoordinationTaskPriority.medium;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsArray()
  @IsOptional()
  attachments?: CoordinationAttachment[];

  @IsOptional()
  isCardTemplate?: boolean;

  @IsString()
  @IsOptional()
  workflowId?: string;

  @IsOptional()
  parameters?: Record<string, any>;

  @IsOptional()
  metadata?: Record<string, any>;
}

export interface WorkflowTemplateDto {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  category: 'hr' | 'oa' | 'devops' | 'general';
  icon?: string;
  taskType: CoordinationTaskType;
  paramsSchema: {
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'date' | 'boolean';
        description: string;
        required?: boolean;
        default?: any;
        enum?: Array<string | number>;
      }
    >;
    required: string[];
  };
}

export class SubmitCoordinationActionDto {
  @IsEnum(['approve', 'reject', 'complete'])
  @IsNotEmpty()
  action!: 'approve' | 'reject' | 'complete';

  @IsString()
  @IsOptional()
  comment?: string;

  @IsArray()
  @IsOptional()
  attachments?: CoordinationAttachment[];
}

export class QueryCollaboratorsDto {
  @IsString()
  @IsOptional()
  keyword?: string;

  @IsOptional()
  limit?: number;
}
