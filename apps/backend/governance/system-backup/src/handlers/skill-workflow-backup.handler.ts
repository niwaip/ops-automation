import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class SkillWorkflowBackupHandler {
  private readonly logger = new Logger(SkillWorkflowBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

  async countSkills(): Promise<number> {
    const [skillConfigs, toolCatalogs, skillSchedules] = await Promise.all([
      this.prisma.skillConfig.count(),
      this.prisma.toolCatalog ? this.prisma.toolCatalog.count() : 0,
      this.prisma.skillSchedule ? this.prisma.skillSchedule.count() : 0,
    ]);
    return skillConfigs + toolCatalogs + skillSchedules;
  }

  async countWorkflows(): Promise<number> {
    const [workflows, activities] = await Promise.all([
      this.prisma.temporalWorkflow.count(),
      this.prisma.activity ? this.prisma.activity.count() : 0,
    ]);
    return workflows + activities;
  }

  async exportSkills(): Promise<{
    skillConfigs: any[];
    toolCatalogs: any[];
    skillToolBindings: any[];
    skillPermissions: any[];
    skillSchedules: any[];
  }> {
    const [skillConfigs, toolCatalogs, skillToolBindings, skillPermissions, skillSchedules] =
      await Promise.all([
        this.prisma.skillConfig.findMany(),
        this.prisma.toolCatalog.findMany(),
        this.prisma.skillToolBinding.findMany(),
        this.prisma.skillPermission.findMany(),
        this.prisma.skillSchedule ? this.prisma.skillSchedule.findMany() : [],
      ]);

    return {
      skillConfigs,
      toolCatalogs,
      skillToolBindings,
      skillPermissions,
      skillSchedules: Array.isArray(skillSchedules) ? skillSchedules : [],
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
    skillSchedules?: any[];
  }): Promise<BackupModulePreview> {
    const backupSkills = backupData?.skillConfigs || [];
    const backupTools = backupData?.toolCatalogs || [];
    const backupSchedules = backupData?.skillSchedules || [];

    const allItems = [
      ...backupSkills.map((s) => ({ ...s, _type: 'Skill' })),
      ...backupTools.map((t) => ({ ...t, _type: 'Tool' })),
      ...backupSchedules.map((sc) => ({ ...sc, _type: 'Schedule' })),
    ];

    const currentMap = new Map<string, any>();
    try {
      const currentSkills = await this.prisma.skillConfig.findMany({
        select: { id: true, name: true },
      });
      for (const s of currentSkills) {
        currentMap.set(`skill:${s.id}`, s);
        if (s.name) currentMap.set(`skill:name:${s.name}`, s);
      }

      if (this.prisma.toolCatalog) {
        const currentTools = await this.prisma.toolCatalog.findMany({
          select: { id: true, name: true },
        });
        for (const t of currentTools) {
          currentMap.set(`tool:${t.id}`, t);
          if (t.name) currentMap.set(`tool:name:${t.name}`, t);
        }
      }

      if (this.prisma.skillSchedule) {
        const currentSchedules = await this.prisma.skillSchedule.findMany({
          select: { id: true, name: true },
        });
        for (const sc of currentSchedules) {
          currentMap.set(`sched:${sc.id}`, sc);
          if (sc.name) currentMap.set(`sched:name:${sc.name}`, sc);
        }
      }
    } catch (err) {
      this.logger.debug(`Error reading current skills for preview: ${err}`);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of allItems) {
      const id = item.id;
      const name = item.name || id;
      let exists = false;

      if (item._type === 'Skill') {
        exists = currentMap.has(`skill:${id}`) || (item.name && currentMap.has(`skill:name:${item.name}`));
      } else if (item._type === 'Tool') {
        exists = currentMap.has(`tool:${id}`) || (item.name && currentMap.has(`tool:name:${item.name}`));
      } else if (item._type === 'Schedule') {
        exists = currentMap.has(`sched:${id}`) || (item.name && currentMap.has(`sched:name:${item.name}`));
      }

      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'skills',
      totalInBackup: allItems.length,
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
    const backupActivities = backupData?.activities || [];

    const allItems = [
      ...backupWorkflows.map((w) => ({ ...w, _type: 'Workflow' })),
      ...backupActivities.map((a) => ({ ...a, _type: 'Activity' })),
    ];

    const currentMap = new Map<string, any>();
    try {
      const currentWorkflows = await this.prisma.temporalWorkflow.findMany({
        select: { id: true, name: true },
      });
      for (const w of currentWorkflows) {
        currentMap.set(`wf:${w.id}`, w);
        if (w.name) currentMap.set(`wf:name:${w.name}`, w);
      }

      if (this.prisma.activity) {
        const currentActivities = await this.prisma.activity.findMany({
          select: { id: true, name: true },
        });
        for (const a of currentActivities) {
          currentMap.set(`act:${a.id}`, a);
          if (a.name) currentMap.set(`act:name:${a.name}`, a);
        }
      }
    } catch (err) {
      this.logger.debug(`Error reading current workflows for preview: ${err}`);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of allItems) {
      const id = item.id;
      const name = item.name || id;
      let exists = false;

      if (item._type === 'Workflow') {
        exists = currentMap.has(`wf:${id}`) || (item.name && currentMap.has(`wf:name:${item.name}`));
      } else if (item._type === 'Activity') {
        exists = currentMap.has(`act:${id}`) || (item.name && currentMap.has(`act:name:${item.name}`));
      }

      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'temporalWorkflows',
      totalInBackup: allItems.length,
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
      skillSchedules?: any[];
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
      try {
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
            updated += 1;
          } else {
            skipped += 1;
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
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import tool catalog ${tool.name}: ${err}`);
        skipped += 1;
      }
    }

    // 2. Skill Configs
    const skillConfigs = backupData.skillConfigs || [];
    for (const skill of skillConfigs) {
      if (!skill.name) continue;
      try {
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
      } catch (err) {
        this.logger.warn(`Failed to import skill config ${skill.name}: ${err}`);
        skipped += 1;
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

    // 4. Skill Permissions
    const permissions = backupData.skillPermissions || [];
    for (const perm of permissions) {
      if (!perm.skillId || !perm.roleId) continue;
      try {
        if (!this.prisma.skillPermission) continue;
        const [skillExists, roleExists] = await Promise.all([
          this.prisma.skillConfig.findUnique({ where: { id: perm.skillId } }),
          this.prisma.role ? this.prisma.role.findUnique({ where: { id: perm.roleId } }) : true,
        ]);
        if (!skillExists || !roleExists) continue;

        await this.prisma.skillPermission.upsert({
          where: {
            skillId_roleId: {
              skillId: perm.skillId,
              roleId: perm.roleId,
            },
          },
          create: {
            skillId: perm.skillId,
            roleId: perm.roleId,
            grantedAt: perm.grantedAt || new Date(),
            grantedBy: perm.grantedBy,
          },
          update: {
            grantedBy: perm.grantedBy,
          },
        });
      } catch (err) {
        this.logger.debug(`SkillPermission insert error: ${err}`);
      }
    }

    // 5. Skill Schedules
    const schedules = backupData.skillSchedules || [];
    for (const sched of schedules) {
      if (!sched.id || !sched.name || !sched.skillId) continue;
      try {
        if (!this.prisma.skillSchedule) continue;
        const skillExists = await this.prisma.skillConfig.findUnique({
          where: { id: sched.skillId },
        });
        if (!skillExists) continue;

        const existing = await this.prisma.skillSchedule.findUnique({
          where: { id: sched.id },
        });
        if (existing) {
          if (strategy === 'merge_override') {
            const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = sched;
            await this.prisma.skillSchedule.update({
              where: { id: sched.id },
              data: rest,
            });
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.skillSchedule.create({
            data: sched,
          });
          created += 1;
        }
      } catch (err) {
        this.logger.debug(`SkillSchedule import skipped: ${err}`);
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
      try {
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
            updated += 1;
          } else {
            skipped += 1;
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
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import activity ${act.name}: ${err}`);
        skipped += 1;
      }
    }

    // 2. Temporal Workflows
    const workflows = backupData.temporalWorkflows || [];
    for (const wf of workflows) {
      if (!wf.id) continue;
      try {
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
      } catch (err) {
        this.logger.warn(`Failed to import temporal workflow ${wf.name || wf.id}: ${err}`);
        skipped += 1;
      }
    }

    return { created, updated, skipped };
  }
}
