import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsUUID,
  Matches,
  IsNotEmpty,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateStatus, TemplateStep, ParamsSchema } from '../../types/template.types';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^.+$/, { message: 'Name must be between 1 and 255 characters' })
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

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  guards?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  config?: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  created_by: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
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

  @IsOptional()
  @IsArray()
  @Type(() => Object)
  guards?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  @Type(() => Object)
  config?: Record<string, unknown>;
}

export class PublishTemplateDto {
  @IsUUID()
  reviewed_by: string;
}

export class CompileScriptDto {
  @IsString()
  script: string;

  @IsOptional()
  @IsString()
  intent?: string;
}

export class ValidateTemplateDto {
  name: string;
  version: string;
  status: TemplateStatus;
  params_schema: ParamsSchema;
  steps: TemplateStep[];
  guards?: Record<string, unknown>[];
  config?: Record<string, unknown>;
  created_by: string;
}
