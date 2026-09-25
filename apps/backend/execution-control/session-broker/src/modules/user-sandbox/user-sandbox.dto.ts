import {
  IsOptional,
  IsString,
  IsNumber,
  IsObject,
  IsDefined,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const USER_ID_MSG = 'userId 仅支持 1-64 位英文字母、数字、下划线及中划线，禁止空格与特殊字符';

export class LaunchUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: USER_ID_MSG })
  userId!: string;

  @ApiPropertyOptional({ description: '可选传入的个人模型 API Key（仅注入该容器）' })
  @IsOptional()
  @IsString()
  modelApiKey?: string;

  @ApiPropertyOptional({ description: 'CPU 核心限制配额 (0.1 - 16)', default: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(16)
  cpuLimit?: number;

  @ApiPropertyOptional({ description: '内存限制配额 (128 - 32768 MB)', default: 2048 })
  @IsOptional()
  @IsNumber()
  @Min(128)
  @Max(32768)
  memoryLimitMb?: number;

  @ApiPropertyOptional({ description: '自定义个人环境变量（禁注工作流相关凭据）' })
  @IsOptional()
  @IsObject()
  customEnv?: Record<string, string>;
}

export class UpdateUserSandboxQuotaDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: USER_ID_MSG })
  userId!: string;

  @ApiPropertyOptional({ description: 'CPU 核心限制配额 (0.1 - 16)', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(16)
  cpuLimit?: number;

  @ApiPropertyOptional({ description: '内存限制配额 (128 - 32768 MB)', default: 2048 })
  @IsOptional()
  @IsNumber()
  @Min(128)
  @Max(32768)
  memoryLimitMb?: number;
}

export class FreezeUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: USER_ID_MSG })
  userId!: string;
}

export class StopUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: USER_ID_MSG })
  userId!: string;
}

export class ExecUserSandboxDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: USER_ID_MSG })
  userId!: string;

  @ApiProperty({ description: '要在沙箱中执行的命令数组或单条命令', example: ['dsh', 'version'] })
  @IsDefined()
  command!: string | string[];

  @ApiPropertyOptional({ description: '超时时间 (毫秒，1000 - 600000)', default: 60000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(600000)
  timeoutMs?: number;

  @ApiPropertyOptional({ description: '工作目录', default: '/workspace' })
  @IsOptional()
  @IsString()
  workDir?: string;
}

export class UserSandboxHistoryMessageDto {
  @ApiProperty({ description: '角色 (user / assistant / system)', example: 'user' })
  @IsString()
  role!: string;

  @ApiProperty({ description: '消息内容', example: '上海的天气' })
  @IsString()
  content!: string;
}

export class RunHarnessDto {
  @ApiProperty({ description: '用户唯一标识', example: 'user_12345' })
  @IsString()
  @Matches(USER_ID_PATTERN, { message: USER_ID_MSG })
  userId!: string;

  @ApiProperty({ description: '发给 DeepSeek Harness 的提示词或指令' })
  @IsString()
  prompt!: string;

  @ApiPropertyOptional({ description: '是否启用联网搜索检索', default: false })
  @IsOptional()
  @IsBoolean()
  webSearch?: boolean;

  @ApiPropertyOptional({ description: '是否显式启用深度调研(Research)机能', default: false })
  @IsOptional()
  @IsBoolean()
  research?: boolean;

  @ApiPropertyOptional({ description: '使用的模型名称', default: 'deepseek-chat' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: '模型真实显示名称（如 qwen36-35b-a3b）' })
  @IsOptional()
  @IsString()
  modelDisplayName?: string;

  @ApiPropertyOptional({ description: '当前会话标识，用于多轮对话上下文关联' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description: '历史对话记录，用于保持会话上下文',
    type: [UserSandboxHistoryMessageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserSandboxHistoryMessageDto)
  history?: UserSandboxHistoryMessageDto[];

  @ApiPropertyOptional({ description: '执行超时时间(毫秒，1000 - 600000)', default: 300000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(600000)
  timeoutMs?: number;

  @ApiPropertyOptional({
    description: '当前会话绑定的附件文件名列表',
    type: [String],
    example: ['1.pdf'],
  })
  @IsOptional()
  @IsArray()
  files?: string[];
}
