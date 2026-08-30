import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class TemplateFlowBackupHandler {
  private readonly logger = new Logger(TemplateFlowBackupHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async countTemplates(): Promise<number> {
    try {
      const result = await this.prisma.$queryRawUnsafe<{ count: string | number }[]>(
        `SELECT count(*)::int as count FROM public.templates`
      );
      return Number(result[0]?.count || 0);
    } catch {
      return 0;
    }
  }

  async countFlowTemplates(): Promise<number> {
    return this.prisma.executionFlowTemplate.count();
  }

  async exportTemplates(): Promise<{
    templates: any[];
  }> {
    try {
      const templates = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM public.templates ORDER BY created_at DESC`
      );
      return { templates: Array.isArray(templates) ? templates : [] };
    } catch (err) {
      this.logger.warn(`Failed to export templates: ${err}`);
      return { templates: [] };
    }
  }

  async exportFlowTemplates(): Promise<{
    executionFlowTemplates: any[];
    llmOperations: any[];
  }> {
    const executionFlowTemplates = await this.prisma.executionFlowTemplate.findMany();
    let llmOperations: any[] = [];
    try {
      llmOperations = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM public.llm_operations`
      );
    } catch {
      llmOperations = [];
    }

    return {
      executionFlowTemplates,
      llmOperations: Array.isArray(llmOperations) ? llmOperations : [],
    };
  }

  async previewTemplates(backupData?: { templates?: any[] }): Promise<BackupModulePreview> {
    const backupTemplates = backupData?.templates || [];
    let currentTemplates: any[] = [];
    try {
      currentTemplates = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name FROM public.templates`
      );
    } catch {
      currentTemplates = [];
    }

    const currentMap = new Map<string, any>();
    for (const t of currentTemplates) {
      currentMap.set(t.id, t);
      if (t.name) currentMap.set(`name:${t.name}`, t);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupTemplates) {
      const id = item.id;
      const name = item.name || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Template: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Template: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'browserTemplates',
      totalInBackup: backupTemplates.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async previewFlowTemplates(backupData?: {
    executionFlowTemplates?: any[];
  }): Promise<BackupModulePreview> {
    const backupFlows = backupData?.executionFlowTemplates || [];
    const currentFlows = await this.prisma.executionFlowTemplate.findMany({
      select: { id: true, name: true },
    });
    const currentMap = new Map<string, any>();
    for (const f of currentFlows) {
      currentMap.set(f.id, f);
      if (f.name) currentMap.set(`name:${f.name}`, f);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupFlows) {
      const id = item.id;
      const name = item.name || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Flow Template: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Flow Template: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'executionFlowTemplates',
      totalInBackup: backupFlows.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async importTemplates(
    backupData: { templates?: any[] },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const templates = backupData.templates || [];
    for (const t of templates) {
      if (!t.id || !t.name) continue;
      try {
        const existing = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM public.templates WHERE id = $1::uuid`,
          t.id
        );
        if (existing && existing.length > 0) {
          if (strategy === 'merge_override') {
            await this.prisma.$executeRawUnsafe(
              `UPDATE public.templates
               SET name = $1, version = $2, status = $3, description = $4,
                   params_schema = $5::jsonb, steps = $6::jsonb, guards = $7::jsonb, config = $8::jsonb,
                   updated_at = NOW()
               WHERE id = $9::uuid`,
              t.name,
              t.version || '1.0.0',
              t.status || 'DRAFT',
              t.description || null,
              JSON.stringify(t.params_schema || t.paramsSchema || {}),
              JSON.stringify(t.steps || []),
              JSON.stringify(t.guards || []),
              JSON.stringify(t.config || {}),
              t.id
            );
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO public.templates (id, name, version, status, description, params_schema, steps, guards, config, created_by, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, NOW(), NOW())`,
            t.id,
            t.name,
            t.version || '1.0.0',
            t.status || 'DRAFT',
            t.description || null,
            JSON.stringify(t.params_schema || t.paramsSchema || {}),
            JSON.stringify(t.steps || []),
            JSON.stringify(t.guards || []),
            JSON.stringify(t.config || {}),
            t.created_by || t.createdBy || 'system'
          );
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import template ${t.name}: ${err}`);
      }
    }

    return { created, updated, skipped };
  }

  async importFlowTemplates(
    backupData: {
      executionFlowTemplates?: any[];
      llmOperations?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 1. Flow Templates
    const flows = backupData.executionFlowTemplates || [];
    for (const f of flows) {
      if (!f.id || !f.name) continue;
      const existing = await this.prisma.executionFlowTemplate.findUnique({
        where: { name: f.name },
      });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.executionFlowTemplate.update({
            where: { name: f.name },
            data: {
              description: f.description,
              goal: f.goal,
              expectedResult: f.expectedResult,
              paramsSchema: f.paramsSchema || {},
              category: f.category || 'document',
              steps: f.steps || [],
              executionFlowKeys: f.executionFlowKeys || [],
              validation: f.validation,
              isPublic: f.isPublic ?? true,
              isActive: f.isActive ?? true,
            },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await this.prisma.executionFlowTemplate.create({
          data: {
            id: f.id,
            name: f.name,
            description: f.description,
            goal: f.goal,
            expectedResult: f.expectedResult,
            paramsSchema: f.paramsSchema || {},
            category: f.category || 'document',
            steps: f.steps || [],
            executionFlowKeys: f.executionFlowKeys || [],
            validation: f.validation,
            isPublic: f.isPublic ?? true,
            isActive: f.isActive ?? true,
            createdBy: f.createdBy,
          },
        });
        created += 1;
      }
    }

    // 2. LLM Operations (if included and table exists)
    const ops = backupData.llmOperations || [];
    for (const op of ops) {
      if (!op.name) continue;
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO public.llm_operations (id, name, display_name, description, system_prompt_hint, is_standard, risk_level, created_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           ON CONFLICT (name) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               description = EXCLUDED.description,
               updated_at = NOW()`,
          op.id,
          op.name,
          op.display_name || op.displayName || op.name,
          op.description || '',
          op.system_prompt_hint || op.systemPromptHint || '',
          op.is_standard ?? op.isStandard ?? true,
          op.risk_level || op.riskLevel || 'low'
        );
      } catch (err) {
        this.logger.debug(`LLM operation raw import skipped: ${err}`);
      }
    }

    return { created, updated, skipped };
  }
}
