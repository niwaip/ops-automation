import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class SkillWorkflowBackupHandler {
  private readonly logger = new Logger(SkillWorkflowBackupHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async countSkills(): Promise<number> {
    return this.prisma.skillConfig.count();
  }

  async countWorkflows(): Promise<number> {
    return this.prisma.temporalWorkflow.count();
  }

  async exportSkills(): Promise<{
    skillConfigs: any[];
    toolCatalogs: any[];
    skillToolBindings: any[];
    skillPermissions: any[];
  }> {
    const [skillConfigs, toolCatalogs, skillToolBindings, skillPermissions] =
      await Promise.all([
        this.prisma.skillConfig.findMany(),
        this.prisma.toolCatalog.findMany(),
        this.prisma.skillToolBinding.findMany(),
        this.prisma.skillPermission.findMany(),
      ]);

    return {
      skillConfigs,
      toolCatalogs,
      skillToolBindings,
      skillPermissions,
    };
  }

  async exportWorkflows(): Promise<{
    temporalWorkflows: any[];
    activities: any[];
  }> {
    const [temporalWorkflows, activities] = await Promise.all([
      this.prisma.temporalWorkflow.findMany(),
      this.prisma.activity.findMany(),
    ]);

    return {
      temporalWorkflows,
      activities,
    };
  }

  async previewSkills(backupData?: {
    skillConfigs?: any[];
    toolCatalogs?: any[];
  }): Promise<BackupModulePreview> {
    const backupSkills = backupData?.skillConfigs || [];
    const currentSkills = await this.prisma.skillConfig.findMany({
      select: { id: true, name: true },
    });
    const currentMap = new Map<string, any>();
    for (const s of currentSkills) {
      currentMap.set(s.id, s);
      if (s.name) currentMap.set(`name:${s.name}`, s);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupSkills) {
      const id = item.id;
      const name = item.name || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Skill: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Skill: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'skills',
      totalInBackup: backupSkills.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async previewWorkflows(backupData?: {
    temporalWorkflows?: any[];
    activities?: any[];
  }): Promise<BackupModulePreview> {
    const backupWorkflows = backupData?.temporalWorkflows || [];
    const currentWorkflows = await this.prisma.temporalWorkflow.findMany({
      select: { id: true, name: true },
    });
    const currentMap = new Map<string, any>();
    for (const w of currentWorkflows) {
      currentMap.set(w.id, w);
      if (w.name) currentMap.set(`name:${w.name}`, w);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupWorkflows) {
      const id = item.id;
      const name = item.name || id;
      const exists = currentMap.has(id) || currentMap.has(`name:${name}`);
      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `Workflow: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `Workflow: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'temporalWorkflows',
      totalInBackup: backupWorkflows.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async importSkills(
    backupData: {
      skillConfigs?: any[];
      toolCatalogs?: any[];
      skillToolBindings?: any[];
      skillPermissions?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 1. Tool Catalog
    const toolCatalogs = backupData.toolCatalogs || [];
    for (const tool of toolCatalogs) {
      if (!tool.name) continue;
      const existing = await this.prisma.toolCatalog.findUnique({ where: { name: tool.name } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.toolCatalog.update({
            where: { name: tool.name },
            data: {
              displayName: tool.displayName || tool.name,
              description: tool.description,
              category: tool.category,
              runtimeType: tool.runtimeType,
              status: tool.status || 'active',
              riskLevel: tool.riskLevel || 'L0',
              allowSkillBinding: tool.allowSkillBinding ?? true,
              promptExposure: tool.promptExposure || 'prompt_and_runtime',
              defaultRequiresConfirmation: tool.defaultRequiresConfirmation ?? false,
              defaultRequiresApproval: tool.defaultRequiresApproval ?? false,
              metadataJson: tool.metadataJson || {},
            },
          });
        }
      } else {
        await this.prisma.toolCatalog.create({
          data: {
            id: tool.id,
            name: tool.name,
            displayName: tool.displayName || tool.name,
            description: tool.description,
            category: tool.category || 'system',
            runtimeType: tool.runtimeType,
            status: tool.status || 'active',
            riskLevel: tool.riskLevel || 'L0',
            allowSkillBinding: tool.allowSkillBinding ?? true,
            promptExposure: tool.promptExposure || 'prompt_and_runtime',
            defaultRequiresConfirmation: tool.defaultRequiresConfirmation ?? false,
            defaultRequiresApproval: tool.defaultRequiresApproval ?? false,
            metadataJson: tool.metadataJson || {},
          },
        });
      }
    }

    // 2. Skill Configs
    const skillConfigs = backupData.skillConfigs || [];
    for (const skill of skillConfigs) {
      if (!skill.name) continue;
      const existing = await this.prisma.skillConfig.findUnique({
        where: { name: skill.name },
      });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.skillConfig.update({
            where: { name: skill.name },
            data: {
              description: skill.description,
              triggerKeywords: skill.triggerKeywords || [],
              paramsSchema: skill.paramsSchema || {},
              outputSchema: skill.outputSchema || {},
              candidateSchemaJson: skill.candidateSchemaJson,
              templateId: skill.templateId,
              carboneTemplateId: skill.carboneTemplateId,
              carboneSkillId: skill.carboneSkillId,
              apiEndpoints: skill.apiEndpoints,
              executionFlow: skill.executionFlow || [],
              executionFlowTemplateIds: skill.executionFlowTemplateIds || [],
              tools: skill.tools || [],
              configStatus: skill.configStatus || 'draft',
              isActive: skill.isActive ?? true,
            },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await this.prisma.skillConfig.create({
          data: {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            triggerKeywords: skill.triggerKeywords || [],
            paramsSchema: skill.paramsSchema || {},
            outputSchema: skill.outputSchema || {},
            candidateSchemaJson: skill.candidateSchemaJson,
            templateId: skill.templateId,
            carboneTemplateId: skill.carboneTemplateId,
            carboneSkillId: skill.carboneSkillId,
            apiEndpoints: skill.apiEndpoints,
            executionFlow: skill.executionFlow || [],
            executionFlowTemplateIds: skill.executionFlowTemplateIds || [],
            tools: skill.tools || [],
            configStatus: skill.configStatus || 'draft',
            isActive: skill.isActive ?? true,
          },
        });
        created += 1;
      }
    }

    // 3. Skill Tool Bindings
    const toolBindings = backupData.skillToolBindings || [];
    for (const binding of toolBindings) {
      if (!binding.skillId || !binding.toolName) continue;
      try {
        const skillExists = await this.prisma.skillConfig.findUnique({
          where: { id: binding.skillId },
        });
        if (!skillExists) continue;
        const existing = await this.prisma.skillToolBinding.findFirst({
          where: { skillId: binding.skillId, toolName: binding.toolName },
        });
        if (existing) {
          if (strategy === 'merge_override') {
            await this.prisma.skillToolBinding.update({
              where: { id: existing.id },
              data: {
                bindingSource: binding.bindingSource || 'declared',
              },
            });
          }
        } else {
          await this.prisma.skillToolBinding.create({
            data: {
              id: binding.id,
              skillId: binding.skillId,
              toolName: binding.toolName,
              bindingSource: binding.bindingSource || 'declared',
            },
          });
        }
      } catch (err) {
        this.logger.debug(`SkillToolBinding insert error: ${err}`);
      }
    }

    return { created, updated, skipped };
  }

  async importWorkflows(
    backupData: {
      temporalWorkflows?: any[];
      activities?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 1. Activities
    const activities = backupData.activities || [];
    for (const act of activities) {
      if (!act.name) continue;
      const existing = await this.prisma.activity.findUnique({ where: { name: act.name } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.activity.update({
            where: { name: act.name },
            data: {
              fn: act.fn || act.name,
              timeout: act.timeout || '30s',
              retryPolicy: act.retryPolicy,
              handler: act.handler || 'script',
              config: act.config || {},
              generatedCode: act.generatedCode,
              isActive: act.isActive ?? true,
            },
          });
        }
      } else {
        await this.prisma.activity.create({
          data: {
            id: act.id,
            name: act.name,
            fn: act.fn || act.name,
            timeout: act.timeout || '30s',
            retryPolicy: act.retryPolicy,
            handler: act.handler || 'script',
            config: act.config || {},
            generatedCode: act.generatedCode,
            isActive: act.isActive ?? true,
          },
        });
      }
    }

    // 2. Temporal Workflows
    const workflows = backupData.temporalWorkflows || [];
    for (const wf of workflows) {
      if (!wf.id) continue;
      const existing = await this.prisma.temporalWorkflow.findUnique({ where: { id: wf.id } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.temporalWorkflow.update({
            where: { id: wf.id },
            data: {
              name: wf.name,
              description: wf.description,
              taskQueue: wf.taskQueue || 'SKILL_TASK_QUEUE',
              workflowDsl: wf.workflowDsl || {},
              activityDsl: wf.activityDsl || {},
              generatedCode: wf.generatedCode,
              artifactVersion: wf.artifactVersion || 1,
              artifactHash: wf.artifactHash,
              validationStatus: wf.validationStatus || 'draft',
              validationScore: wf.validationScore || 0,
              validationResultJson: wf.validationResultJson || wf.validationResult || null,
              isActive: wf.isActive ?? true,
            },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await this.prisma.temporalWorkflow.create({
          data: {
            id: wf.id,
            name: wf.name,
            description: wf.description,
            taskQueue: wf.taskQueue || 'SKILL_TASK_QUEUE',
            workflowDsl: wf.workflowDsl || {},
            activityDsl: wf.activityDsl || {},
            generatedCode: wf.generatedCode,
            artifactVersion: wf.artifactVersion || 1,
            artifactHash: wf.artifactHash,
            validationStatus: wf.validationStatus || 'draft',
            validationScore: wf.validationScore || 0,
            validationResultJson: wf.validationResultJson || wf.validationResult || null,
            isActive: wf.isActive ?? true,
          },
        });
        created += 1;
      }
    }

    return { created, updated, skipped };
  }
}
