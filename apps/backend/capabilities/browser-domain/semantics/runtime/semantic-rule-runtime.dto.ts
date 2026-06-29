import { IsOptional, IsString } from 'class-validator';

export class ResolveRuntimeSemanticRuleSetQueryDto {
  @IsString()
  domain_code!: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsString()
  tenant_id?: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @IsString()
  skill_id?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsString()
  page_type?: string;
}
