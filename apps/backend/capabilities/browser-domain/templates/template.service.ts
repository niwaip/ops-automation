import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateTemplateDto, UpdateTemplateDto, PublishTemplateDto } from './template.dto';
import { TemplateJSON, ListTemplatesQuery, ListTemplatesResponse } from './types/template.types';
import { TemplateValidator } from './validators/template.validator';
import { PrismaService } from './prisma/prisma.service';

type DbTemplateStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'REVOKED';

type TemplateRecord = {
  id: string;
  name: string;
  version: string;
  status: DbTemplateStatus;
  description: string | null;
  paramsSchema: unknown;
  steps: unknown;
  guards: unknown;
  config: unknown;
  createdBy: string;
  reviewedBy: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deprecatedAt: Date | null;
};

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateValidator: TemplateValidator
  ) {}

  async create(dto: CreateTemplateDto): Promise<TemplateJSON> {
    let version = dto.version || '1.0.0';
    const baseName = dto.name;

    const existing = await this.prisma.template.findFirst({
      where: { name: baseName, version },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const versionParts = version.split('.');
      const patchVersion = parseInt(versionParts[2] || '0', 10) + 1;
      version = `${versionParts[0]}.${versionParts[1]}.${patchVersion}`;

      const existingWithNewVersion = await this.prisma.template.findFirst({
        where: { name: baseName, version },
      });

      if (existingWithNewVersion) {
        const minorVersion = parseInt(versionParts[1] || '0', 10) + 1;
        version = `${versionParts[0]}.${minorVersion}.0`;
      }
    }

    const entityToValidate: TemplateRecord = {
      id: 'validation-check',
      name: baseName,
      version,
      description: dto.description ?? null,
      paramsSchema: dto.params_schema || this.getDefaultParamsSchema(),
      steps: dto.steps || [],
      guards: dto.guards || [],
      config: dto.config || {},
      createdBy: dto.created_by,
      reviewedBy: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deprecatedAt: null,
      status: 'DRAFT',
    };
    const templateJSON = this.toJSON(entityToValidate);
    const validation = this.templateValidator.validate(templateJSON);
    if (!validation.valid) {
      throw new BadRequestException(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    const saved = await this.prisma.template.create({
      data: this.buildCreateData(dto, version),
    });
    return this.toJSON(saved);
  }

  async list(query: ListTemplatesQuery): Promise<ListTemplatesResponse> {
    const page = this.parsePositiveInt(query.page, 1);
    const limit = this.parsePositiveInt(query.limit ?? query.pageSize, 20);
    const skip = (page - 1) * limit;
    const excludeDraft = query.excludeDraft === true || query.excludeDraft === 'true';

    const statusFilter = query.status
      ? { status: query.status }
      : excludeDraft
        ? { status: { not: 'DRAFT' as const } }
        : undefined;

    const searchTerm = query.search?.trim();
    const searchFilter =
      searchTerm
        ? {
            OR: [
              { name: { contains: searchTerm, mode: 'insensitive' as const } },
              { description: { contains: searchTerm, mode: 'insensitive' as const } },
            ],
          }
        : undefined;

    const where =
      statusFilter && searchFilter
        ? { AND: [statusFilter, searchFilter] }
        : statusFilter ?? searchFilter ?? undefined;

    const [templates, total] = await this.prisma.$transaction([
      this.prisma.template.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.template.count({ where }),
    ]);

    return {
      templates: templates.map((template: TemplateRecord) => this.toJSON(template)),
      total,
      page,
      limit,
    };
  }

  async get(id: string): Promise<TemplateJSON> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }
    return this.toJSON(template);
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<TemplateJSON> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot update template with status "${template.status}". Only DRAFT templates can be modified.`
      );
    }

    // When steps are explicitly updated, mirror them into config.executionPlan.templateSteps
    // so that session-broker (which prefers executionPlan.templateSteps over top-level steps)
    // always executes the latest locators.
    let resolvedConfig = dto.config || template.config;
    if (dto.steps && Array.isArray(dto.steps)) {
      const existingConfig =
        resolvedConfig && typeof resolvedConfig === 'object' && !Array.isArray(resolvedConfig)
          ? (resolvedConfig as Record<string, unknown>)
          : {};
      const existingExecutionPlan =
        existingConfig.executionPlan &&
        typeof existingConfig.executionPlan === 'object' &&
        !Array.isArray(existingConfig.executionPlan)
          ? (existingConfig.executionPlan as Record<string, unknown>)
          : undefined;

      if (existingExecutionPlan) {
        // Sync templateSteps inside executionPlan to the new top-level steps.
        resolvedConfig = {
          ...existingConfig,
          executionPlan: {
            ...existingExecutionPlan,
            templateSteps: dto.steps,
          },
        };
      }
    }

    const mergedTemplate: TemplateRecord = {
      ...template,
      name: dto.name || template.name,
      version: dto.version || template.version,
      description: dto.description || template.description,
      paramsSchema: dto.params_schema || template.paramsSchema,
      steps: dto.steps || template.steps,
      guards: dto.guards || template.guards,
      config: resolvedConfig,
    };

    const validation = this.templateValidator.validate(this.toJSON(mergedTemplate));
    if (!validation.valid) {
      throw new BadRequestException(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Pass the resolved config (with synced executionPlan.templateSteps) into the DB update.
    const saved = await this.prisma.template.update({
      where: { id },
      data: this.buildUpdateData({ ...dto, config: resolvedConfig as UpdateTemplateDto['config'] }),
    });
    return this.toJSON(saved);
  }

  async delete(id: string): Promise<void> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status === 'PUBLISHED' || template.status === 'REVIEW') {
      throw new BadRequestException(`Cannot delete template with status "${template.status}"`);
    }

    await this.prisma.template.delete({ where: { id } });
  }

  async submitForReview(id: string): Promise<TemplateJSON> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot submit for review. Current status is "${template.status}", expected DRAFT`
      );
    }

    const saved = await this.prisma.template.update({
      where: { id },
      data: { status: 'REVIEW' },
    });
    return this.toJSON(saved);
  }

  async publish(id: string, dto: PublishTemplateDto): Promise<TemplateJSON> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'REVIEW') {
      throw new BadRequestException(
        `Cannot publish. Current status is "${template.status}", expected REVIEW`
      );
    }

    const validation = this.templateValidator.validate(this.toJSON(template));
    if (!validation.valid) {
      throw new BadRequestException(
        `Template validation failed before publishing: ${validation.errors.join(', ')}`
      );
    }

    const saved = await this.prisma.template.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        reviewedBy: dto.reviewed_by,
        publishedAt: new Date(),
      },
    });
    return this.toJSON(saved);
  }

  async deprecate(id: string): Promise<TemplateJSON> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'PUBLISHED') {
      throw new BadRequestException(
        `Cannot deprecate. Current status is "${template.status}", expected PUBLISHED`
      );
    }

    const saved = await this.prisma.template.update({
      where: { id },
      data: {
        status: 'DEPRECATED',
        deprecatedAt: new Date(),
      },
    });
    return this.toJSON(saved);
  }

  async revoke(id: string): Promise<TemplateJSON> {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    const saved = await this.prisma.template.update({
      where: { id },
      data: { status: 'REVOKED' },
    });
    return this.toJSON(saved);
  }

  private buildCreateData(dto: CreateTemplateDto, version: string) {
    return {
      name: dto.name,
      version,
      description: dto.description,
      paramsSchema: (dto.params_schema || this.getDefaultParamsSchema()) as unknown,
      steps: (dto.steps || []) as unknown,
      guards: (dto.guards || []) as unknown,
      config: (dto.config || {}) as unknown,
      createdBy: dto.created_by,
      status: 'DRAFT' as const,
    } as any;
  }

  private buildUpdateData(dto: UpdateTemplateDto) {
    const data: Record<string, unknown> = {};

    if (dto.name) data.name = dto.name;
    if (dto.version) data.version = dto.version;
    if (dto.description) data.description = dto.description;
    if (dto.params_schema) data.paramsSchema = dto.params_schema as unknown;
    if (dto.steps) data.steps = dto.steps as unknown;
    if (dto.guards) data.guards = dto.guards as unknown;
    if (dto.config) data.config = dto.config as unknown;

    return data as any;
  }

  private parsePositiveInt(value: number | string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getDefaultParamsSchema() {
    return { type: 'object' as const, properties: {}, required: [] as string[] };
  }

  private toJSON(entity: TemplateRecord): TemplateJSON {
    const createdAt = entity.createdAt?.toISOString() || new Date().toISOString();
    const updatedAt = entity.updatedAt?.toISOString() || new Date().toISOString();
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      status: entity.status,
      description: entity.description || undefined,
      params_schema:
        (entity.paramsSchema as TemplateJSON['params_schema']) || this.getDefaultParamsSchema(),
      steps: (entity.steps as TemplateJSON['steps']) || [],
      guards: (entity.guards as TemplateJSON['guards']) || [],
      config: (entity.config as TemplateJSON['config']) || {},
      created_by: entity.createdBy,
      reviewed_by: entity.reviewedBy || null,
      published_at: entity.publishedAt?.toISOString() || null,
      created_at: createdAt,
      updated_at: updatedAt,
      deprecated_at: entity.deprecatedAt?.toISOString() || null,
      metadata: {
        created_by: entity.createdBy,
        created_at: createdAt,
        updated_at: updatedAt,
        description: entity.description || undefined,
      },
    };
  }
}
