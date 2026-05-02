import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from './template.entity';
import {
  CreateReportTemplateDTO,
  UpdateReportTemplateDTO,
} from './template.dto';
import { ReportTemplateDTO } from '../../interfaces';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly templateRepository: Repository<ReportTemplateEntity>,
  ) {}

  async create(dto: CreateReportTemplateDTO): Promise<ReportTemplateDTO> {
    this.logger.log(`Creating report template: ${dto.name}`);

    const entity = this.templateRepository.create({
      name: dto.name,
      format: dto.format,
      template_file: dto.template_file,
      sections: dto.sections,
      global_config: dto.global_config,
      ai_config: dto.ai_config,
      notification_config: dto.notification_config,
      created_by: dto.created_by,
    });

    const saved = await this.templateRepository.save(entity);
    return this.toDTO(saved);
  }

  async findAll(): Promise<ReportTemplateDTO[]> {
    const entities = await this.templateRepository.find({
      order: { created_at: 'DESC' },
    });
    return entities.map(this.toDTO);
  }

  async findOne(id: string): Promise<ReportTemplateDTO> {
    const entity = await this.templateRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Report template ${id} not found`);
    }
    return this.toDTO(entity);
  }

  async update(id: string, dto: UpdateReportTemplateDTO): Promise<ReportTemplateDTO> {
    const entity = await this.templateRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Report template ${id} not found`);
    }

    Object.assign(entity, {
      ...dto,
      updated_at: new Date(),
    });

    const saved = await this.templateRepository.save(entity);
    return this.toDTO(saved);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.templateRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Report template ${id} not found`);
    }
    await this.templateRepository.remove(entity);
    this.logger.log(`Removed report template: ${id}`);
  }

  private toDTO(entity: ReportTemplateEntity): ReportTemplateDTO {
    return {
      id: entity.id,
      name: entity.name,
      format: entity.format,
      template_file: entity.template_file || undefined,
      sections: entity.sections,
      global_config: entity.global_config || undefined,
      ai_config: entity.ai_config || undefined,
      notification_config: entity.notification_config || undefined,
      created_by: entity.created_by || undefined,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }
}