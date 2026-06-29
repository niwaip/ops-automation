import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TemplateFormat, TemplateType } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateResponse } from '../studio/studio.types';

type TemplateMetaDocument = {
  id?: string;
  fileName?: string;
  format?: string;
  size?: number;
  variables?: string[];
  loops?: Array<{ arrayPath: string }>;
  markings?: Array<{ path: string; text: string; formatters?: string[] }>;
  ignoredElements?: number[];
  elementGroups?: Record<string, number[]>;
  ignoredGroups?: string[];
  savedAt?: string;
  templateConfig?: unknown;
  configSavedAt?: string;
  skillId?: string;
  config?: unknown;
  suggestions?: unknown;
  rawSuggestions?: unknown;
  verifyResult?: unknown;
  hasValidFile?: boolean;
  type?: string;
  originalTemplateId?: string;
  createdAt?: string;
  updatedAt?: string;
};

@Injectable()
export class TemplateRepository {
  private readonly logger = new Logger(TemplateRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TemplateResponse | null> {
    try {
      const template = await this.prisma.template.findUnique({
        where: { id },
        include: {
          skill: {
            select: { id: true, parameters: true },
          },
        },
      });
      return template ? this.mapTemplate(template) : null;
    } catch (error) {
      this.logger.warn(`Failed to read template ${id} from database`);
      this.logger.debug(String(error));
      return null;
    }
  }

  async list(): Promise<TemplateResponse[]> {
    try {
      const templates = await this.prisma.template.findMany({
        where: { type: TemplateType.template },
        include: {
          skill: {
            select: { id: true, parameters: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return templates.map((template) => this.mapTemplate(template));
    } catch (error) {
      this.logger.warn('Failed to list templates from database');
      this.logger.debug(String(error));
      return [];
    }
  }

  async upsertFromMeta(id: string, filePath: string, meta: TemplateMetaDocument): Promise<void> {
    const data = this.buildUpsertData(filePath, meta);

    await this.prisma.template.upsert({
      where: { id },
      create: {
        id,
        ...data,
      },
      update: data,
    });
  }

  async updateMarkings(
    id: string,
    payload: {
      markings: unknown;
      ignoredElements: unknown;
      elementGroups: unknown;
      ignoredGroups: unknown;
      savedAt: Date;
    }
  ): Promise<void> {
    await this.prisma.template.update({
      where: { id },
      data: {
        markings: payload.markings as Prisma.InputJsonValue,
        ignoredElements: (payload.ignoredElements ?? []) as Prisma.InputJsonValue,
        elementGroups: (payload.elementGroups ?? {}) as Prisma.InputJsonValue,
        ignoredGroups: (payload.ignoredGroups ?? []) as Prisma.InputJsonValue,
        markingsSavedAt: payload.savedAt,
      },
    });
  }

  async updateConfig(id: string, templateConfig: unknown, savedAt: Date): Promise<void> {
    await this.prisma.template.update({
      where: { id },
      data: {
        templateConfig: (templateConfig ?? {}) as Prisma.InputJsonValue,
        configSavedAt: savedAt,
      },
    });
  }

  async rename(id: string, fileName: string): Promise<void> {
    await this.prisma.template.update({
      where: { id },
      data: { fileName },
    });
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.renderOutput.deleteMany({
        where: {
          OR: [{ templateId: id }, { markedTemplateId: id }],
        },
      });

      await this.prisma.skill.deleteMany({
        where: { templateId: id },
      });

      const markedCopies = await this.prisma.template.findMany({
        where: { originalId: id },
        select: { id: true },
      });

      for (const copy of markedCopies) {
        await this.delete(copy.id);
      }

      await this.prisma.template.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Failed to delete template ${id}: ${String(error)}`);
      throw error;
    }
  }

  private buildUpsertData(
    filePath: string,
    meta: TemplateMetaDocument
  ): Prisma.TemplateUncheckedCreateInput {
    const format = this.normalizeFormat(meta.format ?? 'docx');
    const suggestions = Array.isArray(meta.suggestions) ? meta.suggestions : [];
    const variables =
      Array.isArray(meta.variables) && meta.variables.length > 0
        ? meta.variables
        : this.extractVariablesFromSuggestions(suggestions);
    const loops =
      Array.isArray(meta.loops) && meta.loops.length > 0
        ? meta.loops
        : this.extractLoops(meta.templateConfig ?? meta.config, suggestions);
    const templateConfig = meta.templateConfig ?? meta.config ?? null;
    const createdAt = meta.createdAt ? new Date(meta.createdAt) : new Date();
    const type =
      meta.type === 'marked_template' ? TemplateType.marked_template : TemplateType.template;

    return {
      type,
      originalId: meta.originalTemplateId ?? null,
      fileName: meta.fileName || `${meta.id}.${format}`,
      filePath,
      format,
      size: typeof meta.size === 'number' ? meta.size : null,
      variables,
      loops: loops as Prisma.InputJsonValue,
      markings: (meta.markings ?? Prisma.DbNull) as Prisma.InputJsonValue | Prisma.NullTypes.DbNull,
      ignoredElements: (meta.ignoredElements ?? Prisma.DbNull) as
        | Prisma.InputJsonValue
        | Prisma.NullTypes.DbNull,
      elementGroups: (meta.elementGroups ?? Prisma.DbNull) as
        | Prisma.InputJsonValue
        | Prisma.NullTypes.DbNull,
      ignoredGroups: (meta.ignoredGroups ?? Prisma.DbNull) as
        | Prisma.InputJsonValue
        | Prisma.NullTypes.DbNull,
      markingsSavedAt: meta.savedAt ? new Date(meta.savedAt) : null,
      templateConfig: (templateConfig ?? Prisma.DbNull) as
        | Prisma.InputJsonValue
        | Prisma.NullTypes.DbNull,
      configSavedAt: meta.configSavedAt ? new Date(meta.configSavedAt) : null,
      suggestions: (suggestions.length > 0 ? suggestions : Prisma.DbNull) as
        | Prisma.InputJsonValue
        | Prisma.NullTypes.DbNull,
      verifyResult: (meta.verifyResult ?? Prisma.DbNull) as
        | Prisma.InputJsonValue
        | Prisma.NullTypes.DbNull,
      hasValidFile: typeof meta.hasValidFile === 'boolean' ? meta.hasValidFile : null,
      createdAt,
    };
  }

  private mapTemplate(template: {
    id: string;
    fileName: string;
    format: TemplateFormat;
    size: number | null;
    variables: string[];
    loops: unknown;
    markings: unknown;
    ignoredElements: unknown;
    elementGroups: unknown;
    ignoredGroups: unknown;
    markingsSavedAt: Date | null;
    templateConfig: unknown;
    configSavedAt: Date | null;
    verifyResult: unknown;
    skill?: { id: string; parameters: unknown } | null;
    suggestions?: unknown;
    rawSuggestions?: unknown;
  }): TemplateResponse {
    const resolvedLoops =
      Array.isArray(template.loops) && template.loops.length > 0
        ? template.loops
        : this.extractLoops(
            template.templateConfig,
            Array.isArray(template.suggestions) ? template.suggestions : []
          );
    const parameterCount = Array.isArray(template.skill?.parameters)
      ? template.skill.parameters.length
      : undefined;
    return {
      id: template.id,
      fileName: template.fileName,
      format: template.format,
      size: template.size ?? 0,
      variables: template.variables ?? [],
      parameterCount,
      suggestions: Array.isArray(template.suggestions)
        ? (template.suggestions as any[])
        : undefined,
      rawSuggestions: Array.isArray(template.rawSuggestions)
        ? (template.rawSuggestions as any[])
        : undefined,
      loops: resolvedLoops as Array<{ arrayPath: string }>,
      markings: (Array.isArray(template.markings)
        ? template.markings
        : undefined) as TemplateResponse['markings'],
      ignoredElements: (Array.isArray(template.ignoredElements)
        ? template.ignoredElements
        : undefined) as number[] | undefined,
      elementGroups: this.isRecord(template.elementGroups)
        ? (template.elementGroups as Record<string, number[]>)
        : undefined,
      ignoredGroups: (Array.isArray(template.ignoredGroups)
        ? template.ignoredGroups
        : undefined) as string[] | undefined,
      savedAt: template.markingsSavedAt?.toISOString(),
      templateConfig: template.templateConfig ?? undefined,
      configSavedAt: template.configSavedAt?.toISOString(),
      verifyResult: this.isRecord(template.verifyResult)
        ? (template.verifyResult as TemplateResponse['verifyResult'])
        : undefined,
      skillId: template.skill?.id,
    };
  }

  private extractVariablesFromSuggestions(suggestions: unknown[]): string[] {
    const seen = new Set<string>();
    return suggestions
      .filter((item): item is { applied?: boolean; suggestedName?: string } => this.isRecord(item))
      .filter((item) => item.applied && typeof item.suggestedName === 'string')
      .map((item) => item.suggestedName as string)
      .filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  }

  private extractLoops(config: unknown, suggestions: unknown[]): Array<{ arrayPath: string }> {
    const seen = new Set<string>();
    const loops: Array<{ arrayPath: string }> = [];

    for (const loop of this.extractLoopsFromConfig(config)) {
      if (!seen.has(loop.arrayPath)) {
        seen.add(loop.arrayPath);
        loops.push(loop);
      }
    }

    for (const loop of this.extractLoopsFromSuggestions(suggestions)) {
      if (!seen.has(loop.arrayPath)) {
        seen.add(loop.arrayPath);
        loops.push(loop);
      }
    }

    return loops;
  }

  private extractLoopsFromConfig(config: unknown): Array<{ arrayPath: string }> {
    if (!this.isRecord(config)) {
      return [];
    }

    if (Array.isArray(config.tableLoops)) {
      return config.tableLoops
        .filter((item): item is { arrayPath?: string } => this.isRecord(item))
        .filter((item) => typeof item.arrayPath === 'string')
        .map((item) => ({ arrayPath: item.arrayPath as string }));
    }

    if (Array.isArray(config.loops)) {
      return config.loops
        .map((item) => {
          if (typeof item === 'string') {
            return { arrayPath: item };
          }
          if (this.isRecord(item) && typeof item.arrayPath === 'string') {
            return { arrayPath: item.arrayPath as string };
          }
          return null;
        })
        .filter((item): item is { arrayPath: string } => Boolean(item));
    }

    return [];
  }

  private extractLoopsFromSuggestions(suggestions: unknown[]): Array<{ arrayPath: string }> {
    return suggestions
      .filter((item): item is { type?: string; details?: unknown } => this.isRecord(item))
      .map((item) => {
        const details = this.isRecord(item.details) ? item.details : null;
        const arrayPath =
          details && typeof details.arrayPath === 'string' && details.arrayPath.trim().length > 0
            ? details.arrayPath.trim()
            : null;
        return item.type === 'loop' && arrayPath ? { arrayPath } : null;
      })
      .filter((item): item is { arrayPath: string } => Boolean(item));
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
