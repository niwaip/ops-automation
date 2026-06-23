import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateReportTemplateDTO, UpdateReportTemplateDTO } from './template.dto';
import {
  AIConfig,
  NotificationConfig,
  ReportSection,
  ReportTemplateConfig,
  ReportTemplateDTO,
} from '../../interfaces';
import { PrismaService } from '../../prisma/prisma.service';

type ReportTemplateRecord = {
  id: string;
  name: string;
  format: string;
  templateFile: string | null;
  sections: unknown;
  globalConfig: unknown;
  aiConfig: unknown;
  notificationConfig: unknown;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReportTemplateDTO): Promise<ReportTemplateDTO> {
    this.logger.log(`Creating report template: ${dto.name}`);

    const saved = await this.prisma.reportTemplate.create({
      data: this.buildCreateData(dto),
    });
    return this.toDTO(saved);
  }

  async findAll(): Promise<ReportTemplateDTO[]> {
    const templates = await this.prisma.reportTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return templates.map((template) => this.toDTO(template));
  }

  async findOne(id: string): Promise<ReportTemplateDTO> {
    const template = await this.prisma.reportTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Report template ${id} not found`);
    }
    return this.toDTO(template);
  }

  async update(id: string, dto: UpdateReportTemplateDTO): Promise<ReportTemplateDTO> {
    const existing = await this.prisma.reportTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Report template ${id} not found`);
    }

    const saved = await this.prisma.reportTemplate.update({
      where: { id },
      data: this.buildUpdateData(dto),
    });
    return this.toDTO(saved);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.reportTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Report template ${id} not found`);
    }
    await this.prisma.reportTemplate.delete({ where: { id } });
    this.logger.log(`Removed report template: ${id}`);
  }

  private buildCreateData(dto: CreateReportTemplateDTO): Prisma.ReportTemplateCreateInput {
    const data: Prisma.ReportTemplateCreateInput = {
      name: dto.name,
      format: dto.format,
      templateFile: dto.template_file ?? null,
      sections: dto.sections as unknown as Prisma.InputJsonValue,
      createdBy: dto.created_by ?? null,
    };

    if (dto.global_config !== undefined) {
      data.globalConfig = dto.global_config as unknown as Prisma.InputJsonValue;
    }
    if (dto.ai_config !== undefined) {
      data.aiConfig = dto.ai_config as unknown as Prisma.InputJsonValue;
    }
    if (dto.notification_config !== undefined) {
      data.notificationConfig = dto.notification_config as unknown as Prisma.InputJsonValue;
    }

    return data;
  }

  private buildUpdateData(dto: UpdateReportTemplateDTO): Prisma.ReportTemplateUpdateInput {
    const data: Prisma.ReportTemplateUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.format !== undefined) {
      data.format = dto.format;
    }
    if (dto.template_file !== undefined) {
      data.templateFile = dto.template_file;
    }
    if (dto.sections !== undefined) {
      data.sections = dto.sections as unknown as Prisma.InputJsonValue;
    }
    if (dto.global_config !== undefined) {
      data.globalConfig = dto.global_config as unknown as Prisma.InputJsonValue;
    }
    if (dto.ai_config !== undefined) {
      data.aiConfig = dto.ai_config as unknown as Prisma.InputJsonValue;
    }
    if (dto.notification_config !== undefined) {
      data.notificationConfig = dto.notification_config as unknown as Prisma.InputJsonValue;
    }

    return data;
  }

  private toDTO(entity: ReportTemplateRecord): ReportTemplateDTO {
    return {
      id: entity.id,
      name: entity.name,
      format: entity.format as ReportTemplateDTO['format'],
      template_file: entity.templateFile || undefined,
      sections: entity.sections as ReportSection[],
      global_config: entity.globalConfig as ReportTemplateConfig | undefined,
      ai_config: entity.aiConfig as AIConfig | undefined,
      notification_config: entity.notificationConfig as NotificationConfig | undefined,
      created_by: entity.createdBy || undefined,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }
}
