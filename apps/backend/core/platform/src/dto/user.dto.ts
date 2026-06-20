import { Type } from 'class-transformer';
import { IsArray, ArrayNotEmpty, IsString, IsOptional, IsInt, Min, IsIn } from 'class-validator';

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles: string[];
}

export class UserQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsString()
  @IsIn(['employee', 'admin', 'agent'])
  role?: string;
}
