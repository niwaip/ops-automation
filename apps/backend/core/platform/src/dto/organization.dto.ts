import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class AddOrganizationMemberDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleNames?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  teamIds?: string[];
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
