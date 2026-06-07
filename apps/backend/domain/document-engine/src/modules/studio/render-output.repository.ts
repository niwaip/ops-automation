import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TemplateFormat } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type OutputMetaDocument = {
  id: string;
  templateId?: string;
  markedTemplateId?: string;
  skillId?: string;
  fileName: string;
  format: string;
  size?: number;
  params?: unknown;
  sampleData?: unknown;
  simulatedData?: unknown;
  debugLogs?: unknown;
  renderedAt?: string;
  createdAt?: string;
};

@Injectable()
export class RenderOutputRepository {
  private readonly logger = new Logger(RenderOutputRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async createFromMeta(meta: OutputMetaDocument, filePath: string): Promise<void> {
    await this.prisma.renderOutput.upsert({
      where: { id: meta.id },
      create: this.buildCreateInput(meta, filePath),
      update: this.buildUpdateInput(meta, filePath),
    });
  }

  async findById(id: string): Promise<OutputMetaDocument | null> {
    try {
      const output = await this.prisma.renderOutput.findUnique({
        where: { id },
      });
      if (!output) {
        return null;
      }

      return {
        id: output.id,
        templateId: output.templateId ?? undefined,
        markedTemplateId: output.markedTemplateId ?? undefined,
        skillId: output.skillId ?? undefined,
        fileName: output.fileName,
        format: output.format,
        size: output.size ?? undefined,
        params: output.params ?? undefined,
        sampleData: output.sampleData ?? undefined,
        simulatedData: output.simulatedData ?? undefined,
        debugLogs: output.debugLogs ?? undefined,
        renderedAt: output.renderedAt.toISOString(),
      };
    } catch (error) {
      this.logger.warn(`Failed to read render output ${id} from database`);
      this.logger.debug(String(error));
      return null;
    }
  }

  private buildCreateInput(meta: OutputMetaDocument, filePath: string): Prisma.RenderOutputUncheckedCreateInput {
    return {
      id: meta.id,
      templateId: meta.templateId ?? null,
      markedTemplateId: meta.markedTemplateId ?? null,
      skillId: meta.skillId ?? null,
      fileName: meta.fileName,
      filePath,
      format: this.normalizeFormat(meta.format),
      size: typeof meta.size === 'number' ? meta.size : null,
      params: (meta.params ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      sampleData: (meta.sampleData ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      simulatedData: (meta.simulatedData ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      debugLogs: (meta.debugLogs ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      renderedAt: this.parseDate(meta.renderedAt ?? meta.createdAt) ?? new Date(),
    };
  }

  private buildUpdateInput(meta: OutputMetaDocument, filePath: string): Prisma.RenderOutputUncheckedUpdateInput {
    return {
      templateId: meta.templateId ?? null,
      markedTemplateId: meta.markedTemplateId ?? null,
      skillId: meta.skillId ?? null,
      fileName: meta.fileName,
      filePath,
      format: this.normalizeFormat(meta.format),
      size: typeof meta.size === 'number' ? meta.size : null,
      params: (meta.params ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      sampleData: (meta.sampleData ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      simulatedData: (meta.simulatedData ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      debugLogs: (meta.debugLogs ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      renderedAt: this.parseDate(meta.renderedAt ?? meta.createdAt) ?? new Date(),
    };
  }

  private normalizeFormat(format: string): TemplateFormat {
    switch (format) {
      case 'xlsx':
      case 'pptx':
      case 'html':
        return format;
      case 'docx':
      default:
        return 'docx';
    }
  }

  private parseDate(value?: string): Date | undefined {
    return typeof value === 'string' ? new Date(value) : undefined;
  }
}
