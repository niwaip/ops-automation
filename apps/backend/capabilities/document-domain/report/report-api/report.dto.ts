import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { CreateReportDTO } from '../contracts';

export class CreateReportDTOClass implements CreateReportDTO {
  @IsString()
  @IsNotEmpty()
  template_id!: string;

  @IsString()
  @IsNotEmpty()
  session_id!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, any>;
}
