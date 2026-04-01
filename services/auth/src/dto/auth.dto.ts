import { IsString, MinLength, MaxLength, IsOptional, IsEmail, IsEnum } from 'class-validator';

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