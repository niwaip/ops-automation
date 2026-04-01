import { IsString, IsOptional, IsArray, ValidateNested, IsUUID, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateStatus, TemplateStep, ParamsSchema } from '../../types/template.types';

export class CreateTemplateDto {
  @IsString()
  @Matches(/^[\w\s-]{3,255}$/)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/)
  version?: string;

  @IsOptional()
  @IsString()
  @Matches(/^.{0,1000}$/)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  params_schema?: ParamsSchema;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  steps?: TemplateStep[];

  @IsUUID()
  created_by: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @Matches(/^[\w\s-]{3,255}$/)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/)
  version?: string;

  @IsOptional()
  @IsString()
  @Matches(/^.{0,1000}$/)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  params_schema?: ParamsSchema;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  steps?: TemplateStep[];
}

export class PublishTemplateDto {
  @IsUUID()
  reviewed_by: string;
}

export class CompileScriptDto {
  @IsString()
  script: string;
}

export class ValidateTemplateDto {
  name: string;
  version: string;
  status: TemplateStatus;
  params_schema: ParamsSchema;
  steps: TemplateStep[];
  created_by: string;
}