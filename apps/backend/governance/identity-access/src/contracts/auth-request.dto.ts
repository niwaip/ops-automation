import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsEnum(['employee', 'admin', 'agent'])
  role: 'employee' | 'admin' | 'agent';
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class SwitchOrgDto {
  @IsUUID()
  orgId: string;
}

export class SsoStartQueryDto {
  @IsUUID()
  orgId: string;

  @IsOptional()
  @IsString()
  redirectUri?: string;
}

export class SsoCallbackDto {
  @IsUUID()
  orgId: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  idToken?: string;

  @IsOptional()
  @IsString()
  state?: string;
}
