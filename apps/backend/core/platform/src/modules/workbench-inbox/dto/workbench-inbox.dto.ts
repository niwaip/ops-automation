import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  InboxItemStatus,
  TodoPriority,
  TodoStatus,
  TodoSourceType,
} from '../../../generated/prisma';

export { InboxItemStatus, TodoPriority, TodoStatus, TodoSourceType };

export interface UnifiedInboxSource {
  type: TodoSourceType;
  refId?: string;
  title?: string;
  sender?: string;
  senderType?: 'user' | 'assistant' | 'system' | 'external';
  url?: string;
  timestamp?: string;
}

export interface UnifiedInboxArtifact {
  type: string;
  name: string;
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
}

export interface UnifiedInboxContent {
  title: string;
  rawContent: string;
  summary?: string;
  source: UnifiedInboxSource;
  artifacts?: UnifiedInboxArtifact[];
  extra?: Record<string, unknown>;
}

export interface InboxActionItemRecommendation {
  title: string;
  description?: string;
  priority: TodoPriority;
  dueDate?: string;
  who?: string[];
  where?: string;
  why?: string;
  how?: string;
  suggestedWorkflowId?: string;
  suggestedWorkflowName?: string;
}

export interface InboxAiClarification {
  isActionable: boolean;
  confidence: number;
  needsRefinement: boolean;
  refinementNotes?: string;
  actionItem?: InboxActionItemRecommendation;
  suggestedCategory?: 'task' | 'reference' | 'archive';
}

export class IngestInboxItemDto {
  @ApiPropertyOptional({ description: '简要标题（可选，不传由系统或AI自动生成）' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: '原始消息/邮件/工作流产物文本内容' })
  @IsString()
  rawContent!: string;

  @ApiPropertyOptional({ enum: TodoSourceType, default: TodoSourceType.manual })
  @IsOptional()
  @IsEnum(TodoSourceType)
  sourceType?: TodoSourceType;

  @ApiPropertyOptional({ description: '外部来源关联ID' })
  @IsOptional()
  @IsString()
  sourceRefId?: string;

  @ApiPropertyOptional({ description: '外部来源标题' })
  @IsOptional()
  @IsString()
  sourceTitle?: string;

  @ApiPropertyOptional({ description: '来源发送人' })
  @IsOptional()
  @IsString()
  sourceSender?: string;

  @ApiPropertyOptional({ description: '扩展自定义属性' })
  @IsOptional()
  @IsObject()
  extra?: Record<string, unknown>;
}

export class QueryInboxDto {
  @ApiPropertyOptional({ enum: InboxItemStatus })
  @IsOptional()
  @IsEnum(InboxItemStatus)
  status?: InboxItemStatus;

  @ApiPropertyOptional({ enum: TodoSourceType })
  @IsOptional()
  @IsEnum(TodoSourceType)
  sourceType?: TodoSourceType;

  @ApiPropertyOptional({ description: '置信度下限 0.0 ~ 1.0' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;

  @ApiPropertyOptional({ description: '置信度上限 0.0 ~ 1.0' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxConfidence?: number;

  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;
}

export class ConvertInboxToTodoDto {
  @ApiPropertyOptional({ description: '覆盖待办任务标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '覆盖详细描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TodoPriority })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ description: '截止时间 (ISO 8601)' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '绑定的自动化工作流ID' })
  @IsOptional()
  @IsString()
  boundWorkflowId?: string;

  @ApiPropertyOptional({ description: '自定义覆盖上下文' })
  @IsOptional()
  @IsObject()
  overrideContext?: Record<string, unknown>;
}

export class UpdateInboxStatusDto {
  @ApiProperty({ enum: InboxItemStatus })
  @IsEnum(InboxItemStatus)
  status!: InboxItemStatus;
}
