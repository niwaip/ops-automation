import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roles: string[];
}

export class UserQueryDto {
  page?: number = 1;
  role?: string;
}