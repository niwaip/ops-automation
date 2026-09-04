import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TodoPriority,
  TodoStatus,
  TodoSourceType,
} from '../../../generated/prisma';

export { TodoPriority, TodoStatus, TodoSourceType };

export enum DueFilter {
  ALL = 'all',
  TODAY = 'today',
  UPCOMING = 'upcoming',
  OVERDUE = 'overdue',
}

export class Todo5W1HContextDto {
  @ApiPropertyOptional({ description: 'Who: 责任人或提及人员', type: [String] })
  @IsOptional()
  who?: string[];

  @ApiPropertyOptional({ description: 'When: 时间/截止日期文本描述' })
  @IsOptional()
  @IsString()
  when?: string;

  @ApiPropertyOptional({ description: 'Where: 地点、环境或渠道' })
  @IsOptional()
  @IsString()
  where?: string;

  @ApiPropertyOptional({ description: 'What: 核心任务动作描述' })
  @IsOptional()
  @IsString()
  what?: string;

  @ApiPropertyOptional({ description: 'Why: 背景、原因或目标' })
  @IsOptional()
  @IsString()
  why?: string;

  @ApiPropertyOptional({ description: 'How: 方式、手段或建议执行的工作流' })
  @IsOptional()
  @IsString()
  how?: string;

  @ApiPropertyOptional({ description: '原始抽取文本' })
  @IsOptional()
  @IsString()
  rawText?: string;

  @ApiPropertyOptional({ description: '推荐的工作流ID' })
  @IsOptional()
  @IsString()
  suggestedWorkflowId?: string;

  @ApiPropertyOptional({ description: '推荐的工作流名称' })
  @IsOptional()
  @IsString()
  suggestedWorkflowName?: string;

  @ApiPropertyOptional({ description: '置信度打分 0.0 ~ 1.0' })
  @IsOptional()
  confidence?: number;
}

export class CreateWorkbenchTodoDto {
  @ApiProperty({ description: '待办标题', example: '周五下班前生成运维汇总报表' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: '待办详情描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TodoPriority, default: TodoPriority.medium })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ description: '截止时间 (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: TodoSourceType, default: TodoSourceType.manual })
  @IsOptional()
  @IsEnum(TodoSourceType)
  sourceType?: TodoSourceType;

  @ApiPropertyOptional({ description: '来源外部引用ID (如消息ID、邮件ID)' })
  @IsOptional()
  @IsString()
  sourceRefId?: string;

  @ApiPropertyOptional({ description: '来源标题 (如邮件主题、对话会话名)' })
  @IsOptional()
  @IsString()
  sourceTitle?: string;

  @ApiPropertyOptional({ description: '上下文数据与5W1H元数据' })
  @IsOptional()
  @IsObject()
  contextData?: Record<string, any>;

  @ApiPropertyOptional({ description: '绑定的自动化工作流/技能ID' })
  @IsOptional()
  @IsString()
  boundWorkflowId?: string;
}

export class UpdateWorkbenchTodoDto {
  @ApiPropertyOptional({ description: '待办标题' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '待办详情描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TodoPriority })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ enum: TodoStatus })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({ description: '截止时间 (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ description: '绑定的自动化工作流/技能ID' })
  @IsOptional()
  @IsString()
  boundWorkflowId?: string | null;

  @ApiPropertyOptional({ description: '上下文数据与5W1H元数据' })
  @IsOptional()
  @IsObject()
  contextData?: Record<string, any>;
}

export class QueryWorkbenchTodoDto {
  @ApiPropertyOptional({ enum: TodoStatus })
  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @ApiPropertyOptional({ enum: TodoPriority })
  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @ApiPropertyOptional({ enum: TodoSourceType })
  @IsOptional()
  @IsEnum(TodoSourceType)
  sourceType?: TodoSourceType;

  @ApiPropertyOptional({ description: '标题或描述模糊搜索关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ enum: DueFilter, default: DueFilter.ALL })
  @IsOptional()
  @IsEnum(DueFilter)
  dueFilter?: DueFilter;

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;
}

export class ExtractTodoPreviewDto {
  @ApiProperty({ description: '待提取的原始对话或消息文本' })
  @IsString()
  text!: string;

  @ApiPropertyOptional({ enum: TodoSourceType, default: TodoSourceType.chat })
  @IsOptional()
  @IsEnum(TodoSourceType)
  sourceType?: TodoSourceType;

  @ApiPropertyOptional({ description: '来源引用ID' })
  @IsOptional()
  @IsString()
  sourceRefId?: string;

  @ApiPropertyOptional({ description: '来源标题' })
  @IsOptional()
  @IsString()
  sourceTitle?: string;
}

export class ExecuteTodoTaskDto {
  @ApiPropertyOptional({ description: '覆盖或补充的任务执行参数' })
  @IsOptional()
  @IsObject()
  overrideInput?: Record<string, any>;
}
