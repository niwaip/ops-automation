import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class TemplateFlowBackupHandler {
  private readonly logger = new Logger(TemplateFlowBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

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
    const flowsCount = await this.prisma.executionFlowTemplate.count();
    let llmOpsCount = 0;
    try {
      const result = await this.prisma.$queryRawUnsafe<{ count: string | number }[]>(
        `SELECT count(*)::int as count FROM public.llm_operations`
      );
      llmOpsCount = Number(result[0]?.count || 0);
    } catch {
      llmOpsCount = 0;
    }
    return flowsCount + llmOpsCount;
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
    llmOperationVersions: any[];
    llmOperationActivations: any[];
  }> {
    const executionFlowTemplates = await this.prisma.executionFlowTemplate.findMany();
    let llmOperations: any[] = [];
    let llmOperationVersions: any[] = [];
    let llmOperationActivations: any[] = [];

    try {
      llmOperations = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM public.llm_operations ORDER BY created_at ASC`
      );
    } catch (e) {
      this.logger.warn(`Failed to export llm_operations: ${e}`);
    }

    try {
      llmOperationVersions = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM public.llm_operation_versions ORDER BY created_at ASC`
      );
    } catch (e) {
      this.logger.warn(`Failed to export llm_operation_versions: ${e}`);
    }

    try {
      llmOperationActivations = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM public.llm_operation_activations ORDER BY activated_at ASC`
      );
    } catch (e) {
      this.logger.warn(`Failed to export llm_operation_activations: ${e}`);
    }

    return {
      executionFlowTemplates: Array.isArray(executionFlowTemplates) ? executionFlowTemplates : [],
      llmOperations: Array.isArray(llmOperations) ? llmOperations : [],
      llmOperationVersions: Array.isArray(llmOperationVersions) ? llmOperationVersions : [],
      llmOperationActivations: Array.isArray(llmOperationActivations) ? llmOperationActivations : [],
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
    llmOperations?: any[];
    llmOperationVersions?: any[];
    llmOperationActivations?: any[];
  }): Promise<BackupModulePreview> {
    const backupFlows = backupData?.executionFlowTemplates || [];
    const backupOps = backupData?.llmOperations || [];

    const currentFlows = await this.prisma.executionFlowTemplate.findMany({
      select: { id: true, name: true },
    });
    const currentMap = new Map<string, any>();
    for (const f of currentFlows) {
      currentMap.set(f.id, f);
      if (f.name) currentMap.set(`name:${f.name}`, f);
    }

    let currentOps: any[] = [];
    try {
      currentOps = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id, operation_key, display_name FROM public.llm_operations`
      );
    } catch {
      currentOps = [];
    }
    const currentOpMap = new Map<string, any>();
    for (const op of currentOps) {
      currentOpMap.set(op.id, op);
      if (op.operation_key) currentOpMap.set(`key:${op.operation_key}`, op);
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

    for (const op of backupOps) {
      const id = op.id;
      const key = op.operation_key || op.operationKey || id;
      const name = op.display_name || op.displayName || key;
      const exists = currentOpMap.has(id) || currentOpMap.has(`key:${key}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `LLM Operation: ${name} (${key})`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `LLM Operation: ${name} (${key})`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'executionFlowTemplates',
      totalInBackup: backupFlows.length + backupOps.length,
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
      llmOperationVersions?: any[];
      llmOperationActivations?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number; errors?: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // 1. Flow Templates
    const flows = backupData.executionFlowTemplates || [];
    for (const f of flows) {
      if (!f.id || !f.name) continue;
      try {
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
      } catch (err: any) {
        this.logger.warn(`Failed to import execution_flow_template ${f.name}: ${err.message}`);
        errors.push(`流程模板 ${f.name} 导入失败: ${err.message}`);
        skipped += 1;
      }
    }

    const opIdMap = new Map<string, string>();
    const verIdMap = new Map<string, string>();

    // 2. LLM Operations
    const ops = backupData.llmOperations || [];
    for (const op of ops) {
      const opKey = op.operation_key || op.operationKey;
      if (!opKey || !op.id) continue;
      try {
        const existing = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM public.llm_operations WHERE id = $1::uuid OR operation_key = $2`,
          op.id,
          opKey
        );
        if (existing && existing.length > 0) {
          const targetOpId = existing[0].id;
          opIdMap.set(op.id, targetOpId);

          if (strategy === 'merge_override') {
            await this.prisma.$executeRawUnsafe(
              `UPDATE public.llm_operations
               SET display_name = $1, description = $2, owner = $3, status = $4, source = $5, updated_at = NOW()
               WHERE id = $6::uuid`,
              op.display_name || op.displayName || opKey,
              op.description || '',
              op.owner || 'system',
              op.status || 'active',
              op.source || 'system_seed',
              targetOpId
            );
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO public.llm_operations (id, operation_key, display_name, description, owner, status, source, created_at, updated_at)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::timestamptz, NOW())`,
            op.id,
            opKey,
            op.display_name || op.displayName || opKey,
            op.description || '',
            op.owner || 'system',
            op.status || 'active',
            op.source || 'system_seed',
            op.created_at || new Date().toISOString()
          );
          opIdMap.set(op.id, op.id);
          created += 1;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to import llm_operation ${opKey}: ${err.message}`);
        errors.push(`LLM操作 ${opKey} 导入失败: ${err.message}`);
        skipped += 1;
      }
    }

    // 3. LLM Operation Versions
    const versions = backupData.llmOperationVersions || [];
    for (const v of versions) {
      if (!v.id || !v.operation_id || !v.version) continue;
      try {
        const targetOpId = opIdMap.get(v.operation_id) || v.operation_id;
        const existing = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM public.llm_operation_versions WHERE id = $1::uuid OR (operation_id = $2::uuid AND version = $3)`,
          v.id,
          targetOpId,
          v.version
        );
        if (existing && existing.length > 0) {
          const targetVerId = existing[0].id;
          verIdMap.set(v.id, targetVerId);

          if (strategy === 'merge_override') {
            await this.prisma.$executeRawUnsafe(
              `UPDATE public.llm_operation_versions
               SET state = $1, manifest_json = $2::jsonb, operation_digest = $3, contract_digest = $4,
                   change_summary = $5, source = $6, approved_by = $7, approved_at = $8::timestamptz, updated_at = NOW()
               WHERE id = $9::uuid`,
              v.state || 'approved',
              JSON.stringify(v.manifest_json || v.manifestJson || {}),
              v.operation_digest || v.operationDigest || '',
              v.contract_digest || v.contractDigest || '',
              v.change_summary || v.changeSummary || '',
              v.source || 'system_seed',
              v.approved_by || v.approvedBy || null,
              v.approved_at || null,
              targetVerId
            );
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO public.llm_operation_versions (
               id, operation_id, version, state, manifest_json, operation_digest, contract_digest,
               change_summary, source, approved_by, approved_at, created_by, created_at, updated_at
             ) VALUES (
               $1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $7,
               $8, $9, $10, $11::timestamptz, $12, $13::timestamptz, NOW()
             )`,
            v.id,
            targetOpId,
            v.version,
            v.state || 'approved',
            JSON.stringify(v.manifest_json || v.manifestJson || {}),
            v.operation_digest || v.operationDigest || '',
            v.contract_digest || v.contractDigest || '',
            v.change_summary || v.changeSummary || '',
            v.source || 'system_seed',
            v.approved_by || v.approvedBy || null,
            v.approved_at || null,
            v.created_by || v.createdBy || 'system',
            v.created_at || new Date().toISOString()
          );
          verIdMap.set(v.id, v.id);
          created += 1;
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to import llm_operation_version ${v.version} for ${v.operation_id}: ${err.message}`
        );
        errors.push(`LLM操作版本 ${v.version} 导入失败: ${err.message}`);
        skipped += 1;
      }
    }

    // 4. LLM Operation Activations
    const activations = backupData.llmOperationActivations || [];
    for (const act of activations) {
      if (!act.id || !act.operation_id || !act.version_id) continue;
      const env = act.environment || 'production';
      try {
        const targetOpId = opIdMap.get(act.operation_id) || act.operation_id;
        const targetVerId = verIdMap.get(act.version_id) || act.version_id;

        const existing = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id FROM public.llm_operation_activations WHERE id = $1::uuid OR (operation_id = $2::uuid AND environment = $3)`,
          act.id,
          targetOpId,
          env
        );
        if (existing && existing.length > 0) {
          if (strategy === 'merge_override') {
            await this.prisma.$executeRawUnsafe(
              `UPDATE public.llm_operation_activations
               SET version_id = $1::uuid, label = $2, activated_by = $3, reason = $4, rollout_percent = $5, activated_at = $6::timestamptz, updated_at = NOW()
               WHERE id = $7::uuid`,
              targetVerId,
              act.label || env,
              act.activated_by || act.activatedBy || 'system',
              act.reason || 'Restored from system backup',
              act.rollout_percent ?? act.rolloutPercent ?? null,
              act.activated_at || new Date().toISOString(),
              existing[0].id
            );
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO public.llm_operation_activations (
               id, operation_id, version_id, environment, label, activated_by, reason, rollout_percent, activated_at, updated_at
             ) VALUES (
               $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::timestamptz, NOW()
             )`,
            act.id,
            targetOpId,
            targetVerId,
            env,
            act.label || env,
            act.activated_by || act.activatedBy || 'system',
            act.reason || 'Restored from system backup',
            act.rollout_percent ?? act.rolloutPercent ?? null,
            act.activated_at || new Date().toISOString()
          );
          created += 1;
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to import llm_operation_activation for ${act.operation_id}: ${err.message}`
        );
        errors.push(`LLM操作激活记录 (${env}) 导入失败: ${err.message}`);
        skipped += 1;
      }
    }

    return { created, updated, skipped, errors };
  }
}
