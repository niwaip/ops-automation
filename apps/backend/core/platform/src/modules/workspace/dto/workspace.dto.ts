import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({ description: '文件夹名称', example: '产品文档' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ description: '父级文件夹 ID（为空则在根目录创建）' })
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class SearchFilesQueryDto {
  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class ContentSearchQueryDto {
  @ApiProperty({ description: '搜索关键词' })
  @IsString()
  @IsNotEmpty()
  q!: string;

  @ApiPropertyOptional({ description: '指定工作空间 ID' })
  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export class RegenerateDigestDto {
  @ApiPropertyOptional({ description: '是否使用大模型深度清洗与分析' })
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;

  @ApiPropertyOptional({ description: '指定模型 ID，不填则使用系统默认模型' })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({ description: '清洗与特定数据提取的自定义指令' })
  @IsOptional()
  @IsString()
  promptInstructions?: string;

  @ApiPropertyOptional({
    description: '清洗提取模式',
    enum: ['clean_summary', 'extract_data', 'custom'],
  })
  @IsOptional()
  @IsString()
  extractMode?: 'clean_summary' | 'extract_data' | 'custom';
}

export class BatchRegenerateDigestDto {
  @ApiProperty({ description: '需要清洗的文件节点 ID 列表' })
  @IsArray()
  nodeIds!: string[];

  @ApiPropertyOptional({ description: '是否使用大模型深度清洗与分析' })
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;

  @ApiPropertyOptional({ description: '指定模型 ID' })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({ description: '自定义清洗/特定数据提取指令' })
  @IsOptional()
  @IsString()
  promptInstructions?: string;

  @ApiPropertyOptional({
    description: '清洗提取模式',
    enum: ['clean_summary', 'extract_data', 'custom'],
  })
  @IsOptional()
  @IsString()
  extractMode?: 'clean_summary' | 'extract_data' | 'custom';
}

export class SaveTextNoteDto {
  @ApiProperty({ description: '文档标题', example: '2026-09-04 上海实时天气与出行建议' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty({ description: '文档正文（Markdown 格式）' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ description: '分类标签', example: ['天气', '上海', '生活出行'] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({
    description: '笔记类型',
    example: 'task_result',
    enum: ['task_result', 'qa_note', 'trouble_shooting', 'general_note'],
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: '用户提问背景/原始指令' })
  @IsOptional()
  @IsString()
  userQuery?: string;

  @ApiPropertyOptional({ description: '关联的会话 ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '关联的消息 ID' })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({ description: '关联的执行单 ID' })
  @IsOptional()
  @IsString()
  executionId?: string;

  @ApiPropertyOptional({ description: '执行技能标识' })
  @IsOptional()
  @IsString()
  skillUsed?: string;

  @ApiPropertyOptional({ description: '使用的大模型标识' })
  @IsOptional()
  @IsString()
  aiModel?: string;

  @ApiPropertyOptional({ description: '原始执行数据或结构化结果（JSON 或字符串）' })
  @IsOptional()
  rawResultData?: any;

  @ApiPropertyOptional({ description: '自定义保存文件夹路径，默认为 AI知识候选/YYYY-MM' })
  @IsOptional()
  @IsString()
  folderPath?: string;

  @ApiPropertyOptional({ description: '指定目标工作空间 ID，不传默认使用当前用户的 personal 工作空间' })
  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export interface ContentMatchSnippet {
  line: number;
  snippet: string;
}

export interface ContentSearchResultDto extends WorkspaceNodeDto {
  matches: ContentMatchSnippet[];
}

export interface WorkspaceSummaryDto {
  id: string;
  name: string;
  type: 'personal' | 'department' | 'company';
  ownerUserId?: string | null;
  departmentId?: string | null;
  quotaBytes: string;
  usedBytes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFileDigest {
  summary: string;
  keyTopics: string[];
  headings: string[];
  charCount: number;
  wordCount: number;
  readingTimeMinutes: number;
  extractedAt: string;
  hasExtractedText: boolean;
  cleanedContent?: string;
  extractedData?: Record<string, any> | Array<any> | null;
  cleanedByAi?: boolean;
  aiModel?: string;
  cleanPrompt?: string;
}

export interface WorkspaceNodeDto {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  type: 'file' | 'folder';
  fileSize: string;
  mimeType: string | null;
  storagePath?: string | null;
  digest?: WorkspaceFileDigest | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  workspaceType?: 'personal' | 'department' | 'company';
  workspaceName?: string;
}
