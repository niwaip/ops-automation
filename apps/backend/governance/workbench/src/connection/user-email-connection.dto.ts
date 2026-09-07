import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SaveUserEmailDto {
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  emailAddress!: string;

  @IsOptional()
  @IsString()
  authPassword?: string;

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number;

  @IsOptional()
  @IsBoolean()
  imapSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  senderName?: string;

  @IsOptional()
  @IsString()
  providerType?: string;
}

export class TestUserEmailDto {
  @IsOptional()
  @IsString()
  emailAddress?: string;

  @IsOptional()
  @IsString()
  authPassword?: string;

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @IsInt()
  imapPort?: number;

  @IsOptional()
  @IsBoolean()
  imapSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsInt()
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;
}
