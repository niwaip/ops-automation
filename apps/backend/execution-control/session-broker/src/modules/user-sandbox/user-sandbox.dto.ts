import { IsOptional, IsString, IsNumber, IsObject, IsDefined, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LaunchUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: '可选传入的个人模型 API Key（仅注入该容器）' })
  @IsOptional()
  @IsString()
  modelApiKey?: string;

  @ApiPropertyOptional({ description: 'CPU 核心限制配额', default: 2 })
  @IsOptional()
  @IsNumber()
  cpuLimit?: number;

  @ApiPropertyOptional({ description: '内存限制配额 (MB)', default: 2048 })
  @IsOptional()
  @IsNumber()
  memoryLimitMb?: number;

  @ApiPropertyOptional({ description: '自定义个人环境变量（禁注工作流相关凭据）' })
  @IsOptional()
  @IsObject()
  customEnv?: Record<string, string>;
}

export class UpdateUserSandboxQuotaDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'CPU 核心限制配额', default: 1 })
  @IsOptional()
  @IsNumber()
  cpuLimit?: number;

  @ApiPropertyOptional({ description: '内存限制配额 (MB)', default: 2048 })
  @IsOptional()
  @IsNumber()
  memoryLimitMb?: number;
}

export class FreezeUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  userId!: string;
}

export class StopUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  userId!: string;
}

export class ExecUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: '要在沙箱中执行的命令数组或单条命令', example: ['dsh', 'version'] })
  @IsDefined()
  command!: string | string[];

  @ApiPropertyOptional({ description: '超时时间 (毫秒)', default: 60000 })
  @IsOptional()
  @IsNumber()
  timeoutMs?: number;

  @ApiPropertyOptional({ description: '工作目录', default: '/workspace' })
  @IsOptional()
  @IsString()
  workDir?: string;
}

export class RunHarnessDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: '发给 DeepSeek Harness 的提示词或指令' })
  @IsString()
  prompt!: string;

  @ApiPropertyOptional({ description: '是否启用联网搜索检索', default: false })
  @IsOptional()
  @IsBoolean()
  webSearch?: boolean;

  @ApiPropertyOptional({ description: '使用的模型名称', default: 'deepseek-chat' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: '当前会话标识，用于多轮对话上下文关联' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '历史对话记录，用于保持会话上下文' })
  @IsOptional()
  history?: Array<{ role: string; content: string }>;

  @ApiPropertyOptional({ description: '执行超时时间(毫秒)', default: 300000 })
  @IsOptional()
  timeoutMs?: number;
}
