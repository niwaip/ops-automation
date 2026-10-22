import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type {
  PersonalSkillCatalogRecord,
  PersonalSkillSourceRef,
  SkillCaptureStatus,
} from './personal-skill.types';

export class PersonalSkillSourceRefDto implements PersonalSkillSourceRef {
  @ApiProperty({ enum: ['sandbox_turn', 'execution'], example: 'sandbox_turn' })
  @IsEnum(['sandbox_turn', 'execution'])
  kind!: 'sandbox_turn' | 'execution';

  @ApiPropertyOptional({ description: '会话标识' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '关联的消息标识' })
  @IsOptional()
  @IsString()
  messageId?: string;

  @ApiPropertyOptional({ description: '关联的执行标识' })
  @IsOptional()
  @IsString()
  executionId?: string;
}

export class CreateSkillCaptureDto {
  @ApiPropertyOptional({ description: '显式更新当前用户已有技能；重新提炼并验证后创建新版本' })
  @IsOptional()
  @IsString()
  existingSkillId?: string;
  @ApiPropertyOptional({ description: '用于技能提炼的当前对话模型' })
  @IsOptional()
  @IsString()
  modelId?: string;
  @ApiProperty({ description: '来源任务或执行引用' })
  @ValidateNested()
  @Type(() => PersonalSkillSourceRefDto)
  sourceRef!: PersonalSkillSourceRefDto;

  @ApiProperty({ description: '技能展示名称', example: '按部门无偿统计' })
  @IsNotEmpty()
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({ description: '技能简短用途说明' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '技能标识目录名（英文中划线）', example: 'dept-amount-summary' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: '客户端幂等键' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SkillCaptureStatusDto {
  @ApiPropertyOptional({ description: '保存技能前需要确认的问题', type: [String] })
  questions?: string[];
  @ApiPropertyOptional({ description: '可验证核算流程已完成来源重放验收', enum: ['verified_workflow'] })
  executionMode?: 'verified_workflow';

  @ApiProperty({ description: '捕获任务标识' })
  captureId!: string;

  @ApiProperty({ description: '生成状态', enum: ['queued', 'generating', 'validating', 'installing', 'ready', 'needs_input', 'failed'] })
  status!: SkillCaptureStatus;

  @ApiPropertyOptional({ description: '生成完成后的技能标识' })
  skillId?: string;

  @ApiPropertyOptional({ description: '技能目录 slug' })
  slug?: string;

  @ApiPropertyOptional({ description: '版本号' })
  version?: number;

  @ApiPropertyOptional({ description: '错误信息' })
  error?: string;

  @ApiProperty({ description: '进度百分比' })
  progress!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}

export class PersonalSkillSummaryDto {
  @ApiProperty({ description: '技能标识' })
  id!: string;

  @ApiProperty({ description: '技能英文 slug' })
  slug!: string;

  @ApiProperty({ description: '展示名称' })
  displayName!: string;

  @ApiProperty({ description: '用途说明' })
  description!: string;

  @ApiProperty({ description: '当前版本号' })
  version!: number;

  @ApiProperty({ description: '触发词列表' })
  triggers!: string[];

  @ApiProperty({ description: '别名列表' })
  aliases!: string[];

  @ApiProperty({ description: '交付物扩展名' })
  deliverables!: string[];

  @ApiProperty({ description: '是否包含脚本执行' })
  hasScript!: boolean;

  @ApiProperty({ description: '完整包校验哈希' })
  packageHash!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}

export class PersonalSkillDetailDto extends PersonalSkillSummaryDto {
  @ApiProperty({ description: 'SKILL.md 完整内容' })
  skillMdContent!: string;

  @ApiProperty({ description: '包含的脚本列表' })
  scriptFiles!: Array<{ name: string; content?: string }>;

  @ApiProperty({ description: '包含的规则与约定文件列表' })
  referenceFiles!: Array<{ name: string; content?: string }>;

  @ApiProperty({ description: '包含的模版与资产文件列表' })
  assetFiles!: Array<{ name: string; size: number }>;

  @ApiPropertyOptional({ description: '来源引用' })
  sourceRef?: PersonalSkillSourceRef;

  @ApiProperty({ description: '历史版本快照' })
  versions!: Array<{ version: number; createdAt: string; packageHash: string; description?: string }>;
}

export class CreateSkillVersionDto {
  @ApiPropertyOptional({ description: '新的来源任务引用' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonalSkillSourceRefDto)
  sourceRef?: PersonalSkillSourceRefDto;

  @ApiPropertyOptional({ description: '修改指令或变更描述', example: '增加过滤未分配人员的规则' })
  @IsOptional()
  @IsString()
  modificationInstruction?: string;

  @ApiPropertyOptional({ description: '直接覆写 SKILL.md 内容' })
  @IsOptional()
  @IsString()
  skillMdContent?: string;

  @ApiPropertyOptional({ description: '覆写或新增的脚本' })
  @IsOptional()
  @IsArray()
  scriptFiles?: Array<{ name: string; content: string }>;
}

export class CopyPersonalSkillDto {
  @ApiProperty({ description: '新技能展示名称', example: '按项目无偿统计' })
  @IsNotEmpty()
  @IsString()
  targetDisplayName!: string;

  @ApiPropertyOptional({ description: '新技能 slug' })
  @IsOptional()
  @IsString()
  targetSlug?: string;
}
