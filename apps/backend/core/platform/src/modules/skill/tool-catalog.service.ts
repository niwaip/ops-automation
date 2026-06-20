import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ToolCatalogItem,
  ToolCatalogStatus,
  ToolPromptExposure,
  ToolRiskLevel,
  UpdateToolCatalogDTO,
} from './interfaces';

type ToolCatalogSeed = {
  name: string;
  displayName: string;
  description: string;
  category: string;
  runtimeType: string;
  status?: ToolCatalogStatus;
  riskLevel?: ToolRiskLevel;
  allowSkillBinding?: boolean;
  promptExposure?: ToolPromptExposure;
  defaultRequiresConfirmation?: boolean;
  defaultRequiresApproval?: boolean;
  metadataJson?: Record<string, unknown>;
};

const SYSTEM_TOOL_CATALOG: ToolCatalogSeed[] = [
  {
    name: 'skill_match',
    displayName: '技能匹配',
    description: '根据用户输入匹配可访问的技能。',
    category: 'discovery',
    runtimeType: 'skill',
  },
  {
    name: 'param_collect',
    displayName: '参数收集',
    description: '收集和校验技能执行参数。',
    category: 'parameter',
    runtimeType: 'skill',
  },
  {
    name: 'user_ask',
    displayName: '用户追问',
    description: '向用户追问或确认缺失信息。',
    category: 'utility',
    runtimeType: 'interaction',
    promptExposure: 'runtime_only',
  },
  {
    name: 'file_parse',
    displayName: '文件解析',
    description: '解析上传文件内容。',
    category: 'utility',
    runtimeType: 'file',
  },
  {
    name: 'document_render',
    displayName: '文档渲染',
    description: '调用文档引擎渲染模板。',
    category: 'execution',
    runtimeType: 'document',
    riskLevel: 'L1',
  },
  {
    name: 'preview_params',
    displayName: '参数预览',
    description: '预览待提交参数。',
    category: 'utility',
    runtimeType: 'document',
  },
  {
    name: 'api_call',
    displayName: 'API 调用',
    description: '执行外部 API 调用。',
    category: 'execution',
    runtimeType: 'api',
    riskLevel: 'L2',
  },
  {
    name: 'flow_execute',
    displayName: '流程执行',
    description: '执行流程模板。',
    category: 'flow',
    runtimeType: 'flow',
  },
  {
    name: 'browser_step',
    displayName: '浏览器步骤',
    description: '执行受控浏览器步骤。',
    category: 'execution',
    runtimeType: 'browser',
    riskLevel: 'L2',
    defaultRequiresConfirmation: true,
  },
];

@Injectable()
export class ToolCatalogService {
  private readonly logger = new Logger(ToolCatalogService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = $1
       ) AS "exists"`,
      tableName
    );

    return Boolean(rows[0]?.exists);
  }

  private async indexExists(indexName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = $1
       ) AS "exists"`,
      indexName
    );

    return Boolean(rows[0]?.exists);
  }

  private async columnExists(tableName: string, columnName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
       ) AS "exists"`,
      tableName,
      columnName
    );

    return Boolean(rows[0]?.exists);
  }

  private isIgnorableDdlError(error: unknown, objectName: string): boolean {
    const details = JSON.stringify(error);
    return (
      details.includes('42P07') ||
      details.includes('42710') ||
      details.includes('23505') ||
      details.includes('already exists') ||
      details.includes(`(${objectName}, 2200)`)
    );
  }

  private async ensureStatement(
    existsCheck: () => Promise<boolean>,
    statement: string,
    objectName: string
  ): Promise<void> {
    if (await existsCheck()) {
      return;
    }

    try {
      await this.prisma.$executeRawUnsafe(statement);
    } catch (error) {
      if ((await existsCheck()) || this.isIgnorableDdlError(error, objectName)) {
        this.logger.warn(`Ignored concurrent DDL conflict for ${objectName}`);
        return;
      }

      throw error;
    }
  }

  async ensureInfrastructure(): Promise<void> {
    await this.ensureStatement(
      () => this.tableExists('tool_catalogs'),
      `CREATE TABLE tool_catalogs (
        id uuid PRIMARY KEY,
        name varchar(100) NOT NULL UNIQUE,
        display_name varchar(100) NOT NULL,
        description varchar(500) NULL,
        category varchar(50) NULL,
        runtime_type varchar(50) NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        risk_level varchar(10) NOT NULL DEFAULT 'L0',
        allow_skill_binding boolean NOT NULL DEFAULT true,
        prompt_exposure varchar(30) NOT NULL DEFAULT 'prompt_and_runtime',
        default_requires_confirmation boolean NOT NULL DEFAULT false,
        default_requires_approval boolean NOT NULL DEFAULT false,
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
      'tool_catalogs'
    );

    await this.ensureStatement(
      () => this.tableExists('skill_tool_bindings'),
      `CREATE TABLE skill_tool_bindings (
        id uuid PRIMARY KEY,
        skill_id uuid NOT NULL REFERENCES skill_configs(id) ON DELETE CASCADE,
        tool_name varchar(100) NOT NULL,
        binding_source varchar(30) NOT NULL DEFAULT 'declared',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (skill_id, tool_name)
      )`,
      'skill_tool_bindings'
    );

    await this.ensureStatement(
      () => this.indexExists('idx_tool_catalogs_status'),
      `CREATE INDEX idx_tool_catalogs_status ON tool_catalogs(status)`,
      'idx_tool_catalogs_status'
    );
    await this.ensureStatement(
      () => this.indexExists('idx_tool_catalogs_category_status'),
      `CREATE INDEX idx_tool_catalogs_category_status ON tool_catalogs(category, status)`,
      'idx_tool_catalogs_category_status'
    );
    await this.ensureStatement(
      () => this.indexExists('idx_tool_catalogs_runtime_status'),
      `CREATE INDEX idx_tool_catalogs_runtime_status ON tool_catalogs(runtime_type, status)`,
      'idx_tool_catalogs_runtime_status'
    );
    await this.ensureStatement(
      () => this.indexExists('idx_skill_tool_bindings_skill_id'),
      `CREATE INDEX idx_skill_tool_bindings_skill_id ON skill_tool_bindings(skill_id)`,
      'idx_skill_tool_bindings_skill_id'
    );
    await this.ensureStatement(
      () => this.indexExists('idx_skill_tool_bindings_tool_name'),
      `CREATE INDEX idx_skill_tool_bindings_tool_name ON skill_tool_bindings(tool_name)`,
      'idx_skill_tool_bindings_tool_name'
    );
    await this.ensureStatement(
      () => this.columnExists('skill_configs', 'config_status'),
      `ALTER TABLE skill_configs ADD COLUMN config_status varchar(32) NOT NULL DEFAULT 'draft'`,
      'skill_configs.config_status'
    );
    await this.ensureStatement(
      () => this.columnExists('skill_configs', 'last_validation_summary'),
      `ALTER TABLE skill_configs ADD COLUMN last_validation_summary jsonb NULL`,
      'skill_configs.last_validation_summary'
    );
  }

  async seedSystemCatalog(): Promise<void> {
    for (const tool of SYSTEM_TOOL_CATALOG) {
      const existing = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, display_name, description, category, runtime_type
         FROM tool_catalogs
         WHERE name = $1
         LIMIT 1`,
        tool.name
      );

      if (!existing[0]) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO tool_catalogs (
            id, name, display_name, description, category, runtime_type, status,
            risk_level, allow_skill_binding, prompt_exposure,
            default_requires_confirmation, default_requires_approval, metadata_json,
            created_at, updated_at
          ) VALUES (
            $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now(), now()
          )`,
          randomUUID(),
          tool.name,
          tool.displayName,
          tool.description,
          tool.category,
          tool.runtimeType,
          tool.status || 'active',
          tool.riskLevel || 'L0',
          tool.allowSkillBinding ?? true,
          tool.promptExposure || 'prompt_and_runtime',
          tool.defaultRequiresConfirmation ?? false,
          tool.defaultRequiresApproval ?? false,
          JSON.stringify(tool.metadataJson || {})
        );
        continue;
      }

      await this.prisma.$executeRawUnsafe(
        `UPDATE tool_catalogs
         SET display_name = $2,
             description = $3,
             category = $4,
             runtime_type = $5,
             updated_at = now()
         WHERE name = $1`,
        tool.name,
        tool.displayName,
        tool.description,
        tool.category,
        tool.runtimeType
      );
    }

    this.logger.log(`Tool catalog ensured with ${SYSTEM_TOOL_CATALOG.length} system tools`);
  }

  async listCatalog(filters?: {
    status?: string;
    category?: string;
    runtimeType?: string;
    allowSkillBinding?: boolean;
    keyword?: string;
  }): Promise<ToolCatalogItem[]> {
    const clauses: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (filters?.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filters?.category) {
      params.push(filters.category);
      clauses.push(`category = $${params.length}`);
    }
    if (filters?.runtimeType) {
      params.push(filters.runtimeType);
      clauses.push(`runtime_type = $${params.length}`);
    }
    if (filters?.allowSkillBinding !== undefined) {
      params.push(filters.allowSkillBinding);
      clauses.push(`allow_skill_binding = $${params.length}`);
    }
    if (filters?.keyword) {
      params.push(`%${filters.keyword}%`);
      clauses.push(
        `(name ILIKE $${params.length} OR display_name ILIKE $${params.length} OR COALESCE(description, '') ILIKE $${params.length})`
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         tc.*,
         COALESCE(usage.bound_skill_count, 0) AS bound_skill_count
       FROM tool_catalogs tc
       LEFT JOIN (
         SELECT tool_name, COUNT(DISTINCT skill_id) AS bound_skill_count
         FROM skill_tool_bindings
         GROUP BY tool_name
       ) usage
         ON usage.tool_name = tc.name
       WHERE ${clauses.join(' AND ')}
       ORDER BY tc.category NULLS LAST, tc.name ASC`,
      ...params
    );

    return rows.map((row) => this.mapTool(row));
  }

  async getCatalogItem(name: string): Promise<ToolCatalogItem> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         tc.*,
         COALESCE(usage.bound_skill_count, 0) AS bound_skill_count,
         usage.bound_skill_names,
         usage.bound_skills_json
       FROM tool_catalogs tc
       LEFT JOIN (
         SELECT
           stb.tool_name,
           COUNT(DISTINCT stb.skill_id) AS bound_skill_count,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT sc.name ORDER BY sc.name), NULL) AS bound_skill_names,
           COALESCE(
             JSONB_AGG(
               DISTINCT JSONB_BUILD_OBJECT(
                 'id', sc.id,
                 'name', sc.name,
                 'isActive', sc.is_active,
                 'configStatus', sc.config_status,
                 'isPublished', (pub.release_id IS NOT NULL),
                 'publishedReleaseStatus', pub.status,
                 'publishedDeploymentStatus', pub.deployment_status
               )
             ) FILTER (WHERE sc.id IS NOT NULL),
             '[]'::jsonb
           ) AS bound_skills_json
         FROM skill_tool_bindings stb
         LEFT JOIN skill_configs sc
           ON sc.id = stb.skill_id
         LEFT JOIN (
           SELECT DISTINCT ON (published_skill_id)
             id AS release_id,
             published_skill_id,
             status,
             deployment_status,
             release_version,
             updated_at
           FROM capability_releases
           WHERE archived_at IS NULL
             AND published_skill_id IS NOT NULL
           ORDER BY published_skill_id, release_version DESC, updated_at DESC
         ) pub
           ON pub.published_skill_id = sc.id
         GROUP BY stb.tool_name
       ) usage
         ON usage.tool_name = tc.name
       WHERE tc.name = $1
       LIMIT 1`,
      name
    );

    if (!rows[0]) {
      throw new NotFoundException(`工具不存在: ${name}`);
    }

    return this.mapTool(rows[0]);
  }

  async updateCatalogItem(name: string, dto: UpdateToolCatalogDTO): Promise<ToolCatalogItem> {
    const existing = await this.getCatalogItem(name);
    const next = {
      ...existing,
      ...dto,
      metadataJson: dto.metadataJson ?? existing.metadataJson ?? {},
    };

    await this.prisma.$executeRawUnsafe(
      `UPDATE tool_catalogs
       SET display_name = $2,
           description = $3,
           status = $4,
           risk_level = $5,
           allow_skill_binding = $6,
           prompt_exposure = $7,
           default_requires_confirmation = $8,
           default_requires_approval = $9,
           metadata_json = $10::jsonb,
           updated_at = now()
       WHERE name = $1`,
      name,
      next.displayName,
      next.description || null,
      next.status,
      next.riskLevel,
      next.allowSkillBinding,
      next.promptExposure,
      next.defaultRequiresConfirmation,
      next.defaultRequiresApproval,
      JSON.stringify(next.metadataJson || {})
    );

    return this.getCatalogItem(name);
  }

  async getCatalogItemsByNames(toolNames: string[]): Promise<Map<string, ToolCatalogItem>> {
    const uniqueToolNames = Array.from(new Set(toolNames.filter(Boolean)));
    if (uniqueToolNames.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM tool_catalogs WHERE name = ANY($1::text[])`,
      uniqueToolNames
    );

    return new Map(
      rows.map((row) => {
        const tool = this.mapTool(row);
        return [tool.name, tool];
      })
    );
  }

  private mapTool(row: any): ToolCatalogItem {
    return {
      id: String(row.id),
      name: String(row.name),
      displayName: String(row.display_name || row.displayName || row.name),
      description: row.description || undefined,
      category: row.category || undefined,
      runtimeType: row.runtime_type || row.runtimeType || undefined,
      status: (row.status || 'active') as ToolCatalogStatus,
      riskLevel: (row.risk_level || row.riskLevel || 'L0') as ToolRiskLevel,
      allowSkillBinding: Boolean(row.allow_skill_binding ?? row.allowSkillBinding ?? true),
      promptExposure: (row.prompt_exposure ||
        row.promptExposure ||
        'prompt_and_runtime') as ToolPromptExposure,
      defaultRequiresConfirmation: Boolean(
        row.default_requires_confirmation ?? row.defaultRequiresConfirmation ?? false
      ),
      defaultRequiresApproval: Boolean(
        row.default_requires_approval ?? row.defaultRequiresApproval ?? false
      ),
      metadataJson: row.metadata_json || row.metadataJson || {},
    };
  }
}
