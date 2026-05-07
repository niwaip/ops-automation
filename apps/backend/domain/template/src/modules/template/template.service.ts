import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TemplateEntity } from './template.entity';
import { CreateTemplateDto, UpdateTemplateDto, PublishTemplateDto } from './template.dto';
import { TemplateJSON, ListTemplatesQuery, ListTemplatesResponse } from '../../types/template.types';
import { TemplateValidator } from '../../validators/template.validator';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(TemplateEntity)
    private readonly templateRepository: Repository<TemplateEntity>,
    private readonly templateValidator: TemplateValidator,
  ) {}

  /**
   * Create a new template
   */
  async create(dto: CreateTemplateDto): Promise<TemplateJSON> {
    let version = dto.version || '1.0.0';
    const baseName = dto.name;

    // Auto-increment version if template with same name already exists
    const existing = await this.templateRepository.findOne({
      where: { name: baseName, version },
      order: { created_at: 'DESC' },
    });

    if (existing) {
      // Auto-increment version (e.g., 1.0.0 -> 1.0.1)
      const versionParts = version.split('.');
      const patchVersion = parseInt(versionParts[2] || '0', 10) + 1;
      version = `${versionParts[0]}.${versionParts[1]}.${patchVersion}`;

      // Check again with new version
      const existingWithNewVersion = await this.templateRepository.findOne({
        where: { name: baseName, version },
      });

      if (existingWithNewVersion) {
        // If still exists, try minor version increment
        const minorVersion = parseInt(versionParts[1] || '0', 10) + 1;
        version = `${versionParts[0]}.${minorVersion}.0`;
      }
    }

    // Validate template structure before saving
    const entityToValidate = this.templateRepository.create({
      id: uuidv4(), // Generate UUID for validation
      name: baseName,
      version,
      description: dto.description,
      params_schema: dto.params_schema || { type: 'object', properties: {}, required: [] },
      steps: dto.steps || [],
      guards: dto.guards || [],
      config: dto.config || {},
      created_by: dto.created_by,
      status: 'DRAFT',
    });
    const templateJSON = this.toJSON(entityToValidate);
    const validation = this.templateValidator.validate(templateJSON);
    if (!validation.valid) {
      throw new BadRequestException(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    const saved = await this.templateRepository.save(entityToValidate);
    return this.toJSON(saved);
  }

  /**
   * List templates with pagination and filtering
   */
  async list(query: ListTemplatesQuery): Promise<ListTemplatesResponse> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.templateRepository.createQueryBuilder('template');

    if (query.status) {
      qb.where('template.status = :status', { status: query.status });
    }

    qb.orderBy('template.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [templates, total] = await qb.getManyAndCount();

    return {
      templates: templates.map((template) => this.toJSON(template)),
      total,
      page,
      limit,
    };
  }

  /**
   * Get a template by ID
   */
  async get(id: string): Promise<TemplateJSON> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }
    return this.toJSON(template);
  }

  /**
   * Update a template
   */
  async update(id: string, dto: UpdateTemplateDto): Promise<TemplateJSON> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    // Only allow updates on DRAFT templates
    if (template.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot update template with status "${template.status}". Only DRAFT templates can be modified.`);
    }

    // Merge updates
    if (dto.name) template.name = dto.name;
    if (dto.version) template.version = dto.version;
    if (dto.description) template.description = dto.description;
    if (dto.params_schema) template.params_schema = dto.params_schema;
    if (dto.steps) template.steps = dto.steps;
    if (dto.guards) template.guards = dto.guards;
    if (dto.config) template.config = dto.config;

    // Validate updated template
    const validation = this.templateValidator.validate(this.toJSON(template));
    if (!validation.valid) {
      throw new BadRequestException(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    const saved = await this.templateRepository.save(template);
    return this.toJSON(saved);
  }

  /**
   * Delete a template (only DRAFT or DEPRECATED)
   */
  async delete(id: string): Promise<void> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status === 'PUBLISHED' || template.status === 'REVIEW') {
      throw new BadRequestException(`Cannot delete template with status "${template.status}"`);
    }

    await this.templateRepository.remove(template);
  }

  /**
   * Submit template for review (DRAFT -> REVIEW)
   */
  async submitForReview(id: string): Promise<TemplateJSON> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot submit for review. Current status is "${template.status}", expected DRAFT`);
    }

    template.status = 'REVIEW';
    const saved = await this.templateRepository.save(template);
    return this.toJSON(saved);
  }

  /**
   * Publish template (REVIEW -> PUBLISHED)
   */
  async publish(id: string, dto: PublishTemplateDto): Promise<TemplateJSON> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'REVIEW') {
      throw new BadRequestException(`Cannot publish. Current status is "${template.status}", expected REVIEW`);
    }

    // Final validation before publishing
    const validation = this.templateValidator.validate(this.toJSON(template));
    if (!validation.valid) {
      throw new BadRequestException(`Template validation failed before publishing: ${validation.errors.join(', ')}`);
    }

    template.status = 'PUBLISHED';
    template.reviewed_by = dto.reviewed_by;
    template.published_at = new Date();

    const saved = await this.templateRepository.save(template);
    return this.toJSON(saved);
  }

  /**
   * Deprecate template (PUBLISHED -> DEPRECATED)
   */
  async deprecate(id: string): Promise<TemplateJSON> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    if (template.status !== 'PUBLISHED') {
      throw new BadRequestException(`Cannot deprecate. Current status is "${template.status}", expected PUBLISHED`);
    }

    template.status = 'DEPRECATED';
    template.deprecated_at = new Date();

    const saved = await this.templateRepository.save(template);
    return this.toJSON(saved);
  }

  /**
   * Revoke template (any status -> REVOKED)
   */
  async revoke(id: string): Promise<TemplateJSON> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template with ID "${id}" not found`);
    }

    template.status = 'REVOKED';
    const saved = await this.templateRepository.save(template);
    return this.toJSON(saved);
  }

  /**
   * Convert entity to JSON format
   */
  private toJSON(entity: TemplateEntity): TemplateJSON {
    const createdAt = entity.created_at?.toISOString() || new Date().toISOString();
    const updatedAt = entity.updated_at?.toISOString() || new Date().toISOString();
    return {
      id: entity.id,
      name: entity.name,
      version: entity.version,
      status: entity.status,
      description: entity.description,
      params_schema: entity.params_schema,
      steps: entity.steps,
      guards: entity.guards || [],
      config: entity.config || {},
      created_by: entity.created_by,
      reviewed_by: entity.reviewed_by || null,
      published_at: entity.published_at?.toISOString() || null,
      created_at: createdAt,
      updated_at: updatedAt,
      deprecated_at: entity.deprecated_at?.toISOString() || null,
      metadata: {
        created_by: entity.created_by,
        created_at: createdAt,
        updated_at: updatedAt,
        description: entity.description,
      },
    };
  }
}
