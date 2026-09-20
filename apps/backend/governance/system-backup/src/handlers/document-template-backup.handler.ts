import { Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class DocumentTemplateBackupHandler {
  private readonly logger = new Logger(DocumentTemplateBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

  public getTemplatesDir(): string {
    if (process.env.TEMPLATES_DIR && fs.existsSync(process.env.TEMPLATES_DIR)) {
      return process.env.TEMPLATES_DIR;
    }

    const candidates = [
      process.env.TEMPLATES_DIR,
      '/workspace/apps/backend/var/templates/document-engine',
      path.resolve(process.cwd(), 'apps/backend/var/templates/document-engine'),
      path.resolve(process.cwd(), '../../var/templates/document-engine'),
      path.resolve(process.cwd(), '../var/templates/document-engine'),
      path.resolve(__dirname, '../../../../var/templates/document-engine'),
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        return dir;
      }
    }

    const fallback =
      candidates[0] || path.resolve(process.cwd(), 'apps/backend/var/templates/document-engine');
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch {
      // ignore
    }
    return fallback;
  }

  async count(): Promise<number> {
    try {
      const result = await this.prisma.$queryRawUnsafe<{ count: string | number }[]>(
        `SELECT count(*)::int as count FROM document_engine.carbone_templates WHERE type = 'template'`
      );
      return Number(result[0]?.count || 0);
    } catch {
      // Fallback to disk scan if DB query fails
      try {
        const dir = this.getTemplatesDir();
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          return files.filter((f) => f.endsWith('.json') && !f.startsWith('skill_')).length;
        }
      } catch {
        // ignore
      }
      return 0;
    }
  }

  async export(): Promise<{
    templates: any[];
    skills: any[];
  }> {
    const templatesDir = this.getTemplatesDir();
    let dbTemplates: any[] = [];
    let dbSkills: any[] = [];

    try {
      dbTemplates = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM document_engine.carbone_templates ORDER BY created_at DESC`
      );
    } catch (err: any) {
      this.logger.warn(`Failed to export carbone_templates from database: ${err.message}`);
    }

    try {
      dbSkills = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM document_engine.carbone_skills ORDER BY created_at DESC`
      );
    } catch (err: any) {
      this.logger.warn(`Failed to export carbone_skills from database: ${err.message}`);
    }

    const exportedTemplates: any[] = [];
    for (const tpl of dbTemplates) {
      const id = tpl.id;
      const format = tpl.format || 'docx';
      let fileBase64: string | undefined;
      let metaJson: any | undefined;

      try {
        const filePath = path.join(templatesDir, `${id}.${format}`);
        if (fs.existsSync(filePath)) {
          fileBase64 = fs.readFileSync(filePath).toString('base64');
        }
      } catch (err: any) {
        this.logger.warn(`Could not read binary template file for ${id}: ${err.message}`);
      }

      try {
        const metaPath = path.join(templatesDir, `${id}.json`);
        if (fs.existsSync(metaPath)) {
          metaJson = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        }
      } catch (err: any) {
        this.logger.warn(`Could not read meta json for ${id}: ${err.message}`);
      }

      exportedTemplates.push({
        ...tpl,
        fileBase64,
        metaJson,
      });
    }

    const exportedSkills: any[] = [];
    for (const skl of dbSkills) {
      const id = skl.id;
      let metaJson: any | undefined;

      try {
        const skillPath = path.join(templatesDir, `skill_${id}.json`);
        if (fs.existsSync(skillPath)) {
          metaJson = JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
        }
      } catch (err: any) {
        this.logger.warn(`Could not read skill json for ${id}: ${err.message}`);
      }

      exportedSkills.push({
        ...skl,
        metaJson,
      });
    }

    return {
      templates: exportedTemplates,
      skills: exportedSkills,
    };
  }

  async preview(backupData?: {
    templates?: any[];
    skills?: any[];
  }): Promise<BackupModulePreview> {
    const backupTemplates = backupData?.templates || [];
    let currentTemplates: any[] = [];

    try {
      currentTemplates = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, file_name FROM document_engine.carbone_templates`
      );
    } catch {
      currentTemplates = [];
    }

    const currentMap = new Map<string, any>();
    for (const t of currentTemplates) {
      currentMap.set(t.id, t);
      if (t.file_name) currentMap.set(`name:${t.file_name}`, t);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupTemplates) {
      const id = item.id;
      const name = item.file_name || item.fileName || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);

      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `文档模版: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `文档模版: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'documentTemplates',
      totalInBackup: backupTemplates.length,
      newCount,
      conflictCount,
      items,
    };
  }

  private async ensureSchemaAndTables(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS document_engine;`);

      await this.prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_type t 
            JOIN pg_namespace n ON n.oid = t.typnamespace 
            WHERE t.typname = 'TemplateFormat' AND n.nspname = 'document_engine'
          ) THEN
            CREATE TYPE document_engine."TemplateFormat" AS ENUM ('docx', 'xlsx', 'pptx', 'html');
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_type t 
            JOIN pg_namespace n ON n.oid = t.typnamespace 
            WHERE t.typname = 'TemplateType' AND n.nspname = 'document_engine'
          ) THEN
            CREATE TYPE document_engine."TemplateType" AS ENUM ('template', 'marked_template');
          END IF;
        END $$;
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS document_engine.carbone_templates (
          id uuid PRIMARY KEY,
          type document_engine."TemplateType" NOT NULL DEFAULT 'template',
          original_id uuid NULL,
          file_name varchar(500) NOT NULL,
          file_path varchar(1000) NOT NULL,
          format document_engine."TemplateFormat" NOT NULL,
          size integer NULL,
          variables text[] NOT NULL DEFAULT ARRAY[]::text[],
          loops jsonb NOT NULL DEFAULT '[]'::jsonb,
          markings jsonb NULL,
          ignored_elements jsonb NULL,
          element_groups jsonb NULL,
          ignored_groups jsonb NULL,
          markings_saved_at timestamptz NULL,
          template_config jsonb NULL,
          config_saved_at timestamptz NULL,
          suggestions jsonb NULL,
          verify_result jsonb NULL,
          has_valid_file boolean NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS document_engine.carbone_skills (
          id uuid PRIMARY KEY,
          template_id uuid NOT NULL UNIQUE,
          parameters jsonb NOT NULL DEFAULT '[]'::jsonb,
          data_example jsonb NULL,
          raw_skill jsonb NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);
    } catch (err: any) {
      this.logger.warn(`Failed to ensure document_engine schema and tables: ${err.message}`);
    }
  }

  async import(
    backupData: {
      templates?: any[];
      skills?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number; errors?: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const templatesDir = this.getTemplatesDir();

    await this.ensureSchemaAndTables();

    const templates = backupData.templates || [];
    for (const t of templates) {
      if (!t.id) continue;
      const id = t.id;
      const format = t.format || 'docx';
      const fileName = t.file_name || t.fileName || `${id}.${format}`;
      const filePath = path.join(templatesDir, `${id}.${format}`);

      // 1. Restore file to disk if base64 provided
      if (t.fileBase64) {
        try {
          fs.writeFileSync(filePath, Buffer.from(t.fileBase64, 'base64'));
        } catch (err: any) {
          this.logger.warn(`Failed to write template file to disk for ${id}: ${err.message}`);
        }
      }

      // 2. Restore meta json to disk
      if (t.metaJson) {
        try {
          const metaPath = path.join(templatesDir, `${id}.json`);
          fs.writeFileSync(metaPath, JSON.stringify(t.metaJson, null, 2));
        } catch (err: any) {
          this.logger.warn(`Failed to write template meta json for ${id}: ${err.message}`);
        }
      }

      // 3. Database synchronization
      try {
        const existing = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM document_engine.carbone_templates WHERE id = $1::uuid`,
          id
        );

        const variables = Array.isArray(t.variables) ? t.variables : [];
        const loops = JSON.stringify(t.loops || []);
        const markings = t.markings ? JSON.stringify(t.markings) : null;
        const ignoredElements = t.ignored_elements || t.ignoredElements ? JSON.stringify(t.ignored_elements || t.ignoredElements) : null;
        const elementGroups = t.element_groups || t.elementGroups ? JSON.stringify(t.element_groups || t.elementGroups) : null;
        const ignoredGroups = t.ignored_groups || t.ignoredGroups ? JSON.stringify(t.ignored_groups || t.ignoredGroups) : null;
        const templateConfig = t.template_config || t.templateConfig ? JSON.stringify(t.template_config || t.templateConfig) : null;
        const suggestions = t.suggestions ? JSON.stringify(t.suggestions) : null;
        const verifyResult = t.verify_result || t.verifyResult ? JSON.stringify(t.verify_result || t.verifyResult) : null;
        const size = typeof t.size === 'number' ? t.size : null;
        const hasValidFile = Boolean(t.fileBase64 || t.has_valid_file || t.hasValidFile);
        const type = t.type === 'marked_template' ? 'marked_template' : 'template';

        if (existing && existing.length > 0) {
          if (strategy === 'merge_override') {
            await this.prisma.$executeRawUnsafe(
              `UPDATE document_engine.carbone_templates
               SET file_name = $1, file_path = $2, format = $3::document_engine."TemplateFormat", size = $4,
                   variables = $5, loops = $6::jsonb, markings = $7::jsonb, ignored_elements = $8::jsonb,
                   element_groups = $9::jsonb, ignored_groups = $10::jsonb, template_config = $11::jsonb,
                   suggestions = $12::jsonb, verify_result = $13::jsonb, has_valid_file = $14,
                   updated_at = NOW()
               WHERE id = $15::uuid`,
              fileName,
              filePath,
              format,
              size,
              variables,
              loops,
              markings,
              ignoredElements,
              elementGroups,
              ignoredGroups,
              templateConfig,
              suggestions,
              verifyResult,
              hasValidFile,
              id
            );
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO document_engine.carbone_templates (
               id, type, original_id, file_name, file_path, format, size,
               variables, loops, markings, ignored_elements, element_groups, ignored_groups,
               template_config, suggestions, verify_result, has_valid_file, created_at, updated_at
             ) VALUES (
               $1::uuid, $2::document_engine."TemplateType", $3::uuid, $4, $5, $6::document_engine."TemplateFormat", $7,
               $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb,
               $14::jsonb, $15::jsonb, $16::jsonb, $17, $18::timestamptz, NOW()
             )`,
            id,
            type,
            t.original_id || t.originalId || null,
            fileName,
            filePath,
            format,
            size,
            variables,
            loops,
            markings,
            ignoredElements,
            elementGroups,
            ignoredGroups,
            templateConfig,
            suggestions,
            verifyResult,
            hasValidFile,
            t.created_at || t.createdAt || new Date().toISOString()
          );
          created += 1;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to import carbone_template ${fileName}: ${err.message}`);
        errors.push(`文档模版 ${fileName} 导入失败: ${err.message}`);
        skipped += 1;
      }
    }

    // Skills synchronization
    const skills = backupData.skills || [];
    for (const s of skills) {
      if (!s.id || !s.template_id && !s.templateId) continue;
      const skillId = s.id;
      const templateId = s.template_id || s.templateId;

      if (s.metaJson) {
        try {
          const skillPath = path.join(templatesDir, `skill_${skillId}.json`);
          fs.writeFileSync(skillPath, JSON.stringify(s.metaJson, null, 2));
        } catch (err: any) {
          this.logger.warn(`Failed to write skill json for ${skillId}: ${err.message}`);
        }
      }

      try {
        const existingSkill = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM document_engine.carbone_skills WHERE id = $1::uuid OR template_id = $2::uuid`,
          skillId,
          templateId
        );

        const params = JSON.stringify(s.parameters || []);
        const dataExample = s.data_example || s.dataExample ? JSON.stringify(s.data_example || s.dataExample) : null;
        const rawSkill = s.raw_skill || s.rawSkill ? JSON.stringify(s.raw_skill || s.rawSkill) : null;

        if (existingSkill && existingSkill.length > 0) {
          if (strategy === 'merge_override') {
            await this.prisma.$executeRawUnsafe(
              `UPDATE document_engine.carbone_skills
               SET parameters = $1::jsonb, data_example = $2::jsonb, raw_skill = $3::jsonb, updated_at = NOW()
               WHERE id = $4::uuid`,
              params,
              dataExample,
              rawSkill,
              existingSkill[0].id
            );
          }
        } else {
          // Check if parent template exists before inserting
          const tplCheck = await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM document_engine.carbone_templates WHERE id = $1::uuid`,
            templateId
          );
          if (tplCheck && tplCheck.length > 0) {
            await this.prisma.$executeRawUnsafe(
              `INSERT INTO document_engine.carbone_skills (id, template_id, parameters, data_example, raw_skill, created_at, updated_at)
               VALUES ($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5::jsonb, $6::timestamptz, NOW())`,
              skillId,
              templateId,
              params,
              dataExample,
              rawSkill,
              s.created_at || s.createdAt || new Date().toISOString()
            );
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to import carbone_skill ${skillId}: ${err.message}`);
      }
    }

    return { created, updated, skipped, errors };
  }
}
