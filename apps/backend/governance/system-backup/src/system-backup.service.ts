import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  BackupImportResult,
  BackupImportStrategy,
  BackupModuleKey,
  BackupPreviewResult,
  SystemAssetSummary,
  SystemBackupArchive,
  SystemBackupManifest,
} from './interfaces/system-backup.interface';
import { AIModelBackupHandler } from './handlers/ai-model-backup.handler';
import { SkillWorkflowBackupHandler } from './handlers/skill-workflow-backup.handler';
import { CapabilityReleaseBackupHandler } from './handlers/capability-release-backup.handler';
import { TemplateFlowBackupHandler } from './handlers/template-flow-backup.handler';
import { UserOrgBackupHandler } from './handlers/user-org-backup.handler';
import { TaskPolicyBackupHandler } from './handlers/task-policy-backup.handler';
import { WorkspaceBackupHandler } from './handlers/workspace-backup.handler';
import { DocumentTemplateBackupHandler } from './handlers/document-template-backup.handler';

if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this) <= Number.MAX_SAFE_INTEGER ? Number(this) : this.toString();
  };
}

export function serializeBigInts<T>(value: T): T {
  if (typeof value === 'bigint') {
    return (value <= Number.MAX_SAFE_INTEGER ? Number(value) : value.toString()) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInts(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    if (value instanceof Date) return value;
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      res[k] = serializeBigInts(v);
    }
    return res as T;
  }
  return value;
}

@Injectable()
export class SystemBackupService {
  private readonly logger = new Logger(SystemBackupService.name);

  constructor(
    private readonly aiModelHandler: AIModelBackupHandler,
    private readonly skillWorkflowHandler: SkillWorkflowBackupHandler,
    private readonly capabilityReleaseHandler: CapabilityReleaseBackupHandler,
    private readonly templateFlowHandler: TemplateFlowBackupHandler,
    private readonly userOrgHandler: UserOrgBackupHandler,
    private readonly taskPolicyHandler: TaskPolicyBackupHandler,
    private readonly workspaceHandler: WorkspaceBackupHandler,
    private readonly documentTemplateHandler?: DocumentTemplateBackupHandler
  ) {}

  private computeChecksum(data: unknown): string {
    const jsonStr = JSON.stringify(data, (_, value) =>
      typeof value === 'bigint'
        ? value <= Number.MAX_SAFE_INTEGER
          ? Number(value)
          : value.toString()
        : value
    );
    return `sha256:${crypto.createHash('sha256').update(jsonStr, 'utf-8').digest('hex')}`;
  }

  async getAssetSummary(): Promise<SystemAssetSummary> {
    const [
      aiModelsCount,
      skillsCount,
      workflowsCount,
      releasesCount,
      templatesCount,
      flowsCount,
      userOrgsCount,
      taskPoliciesCount,
      workspacesCount,
      documentTemplatesCount,
    ] = await Promise.all([
      this.aiModelHandler.count(),
      this.skillWorkflowHandler.countSkills(),
      this.skillWorkflowHandler.countWorkflows(),
      this.capabilityReleaseHandler.count(),
      this.templateFlowHandler.countTemplates(),
      this.templateFlowHandler.countFlowTemplates(),
      this.userOrgHandler.count(),
      this.taskPolicyHandler.count(),
      this.workspaceHandler.count(),
      this.documentTemplateHandler ? this.documentTemplateHandler.count() : Promise.resolve(0),
    ]);

    const counts: Record<BackupModuleKey, number> = {
      aiModels: aiModelsCount,
      skills: skillsCount,
      temporalWorkflows: workflowsCount,
      capabilityReleases: releasesCount,
      browserTemplates: templatesCount,
      executionFlowTemplates: flowsCount,
      userOrganizations: userOrgsCount,
      taskPolicies: taskPoliciesCount,
      workspaces: workspacesCount,
      documentTemplates: documentTemplatesCount,
    };

    const totalAssets = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return { counts, totalAssets };
  }

  async exportBackup(requestedModules?: BackupModuleKey[]): Promise<SystemBackupArchive> {
    const allModules: BackupModuleKey[] = [
      'aiModels',
      'skills',
      'temporalWorkflows',
      'capabilityReleases',
      'browserTemplates',
      'executionFlowTemplates',
      'userOrganizations',
      'taskPolicies',
      'workspaces',
      'documentTemplates',
    ];

    const selectedModules = new Set<BackupModuleKey>(
      requestedModules && requestedModules.length > 0 ? requestedModules : allModules
    );

    const modulesData: SystemBackupArchive['modules'] = {};
    const counts: Record<BackupModuleKey, number> = {
      aiModels: 0,
      skills: 0,
      temporalWorkflows: 0,
      capabilityReleases: 0,
      browserTemplates: 0,
      executionFlowTemplates: 0,
      userOrganizations: 0,
      taskPolicies: 0,
      workspaces: 0,
      documentTemplates: 0,
    };

    if (selectedModules.has('aiModels')) {
      const aiData = await this.aiModelHandler.export();
      modulesData.aiModels = aiData;
      counts.aiModels = aiData.models.length;
    }

    if (selectedModules.has('skills')) {
      const skillsData = await this.skillWorkflowHandler.exportSkills();
      modulesData.skills = {
        skills: [],
        ...skillsData,
      };
      counts.skills = skillsData.skillConfigs.length;
    }

    if (selectedModules.has('temporalWorkflows')) {
      const wfData = await this.skillWorkflowHandler.exportWorkflows();
      modulesData.temporalWorkflows = wfData;
      counts.temporalWorkflows = wfData.temporalWorkflows.length;
    }

    if (selectedModules.has('capabilityReleases')) {
      const releaseData = await this.capabilityReleaseHandler.export();
      modulesData.capabilityReleases = releaseData;
      counts.capabilityReleases = releaseData.capabilityReleases.length;
    }

    if (selectedModules.has('browserTemplates')) {
      const tplData = await this.templateFlowHandler.exportTemplates();
      modulesData.browserTemplates = {
        templates: tplData.templates,
        templateVersions: [],
      };
      counts.browserTemplates = tplData.templates.length;
    }

    if (selectedModules.has('executionFlowTemplates')) {
      const flowData = await this.templateFlowHandler.exportFlowTemplates();
      modulesData.executionFlowTemplates = flowData;
      counts.executionFlowTemplates =
        flowData.executionFlowTemplates.length + (flowData.llmOperations?.length || 0);
    }

    if (selectedModules.has('userOrganizations')) {
      const userOrgData = await this.userOrgHandler.export();
      modulesData.userOrganizations = userOrgData;
      counts.userOrganizations = userOrgData.users.length + userOrgData.organizations.length;
    }

    if (selectedModules.has('taskPolicies')) {
      const tpData = await this.taskPolicyHandler.export();
      modulesData.taskPolicies = tpData;
      counts.taskPolicies =
        tpData.policySets.length +
        tpData.recipes.length +
        tpData.commandAliases.length;
    }

    if (selectedModules.has('workspaces')) {
      const wsData = await this.workspaceHandler.export();
      modulesData.workspaces = wsData;
      counts.workspaces =
        wsData.workspaces.length + ((wsData as any).nodes?.length ?? wsData.documents?.length ?? 0);
    }

    if (selectedModules.has('documentTemplates') && this.documentTemplateHandler) {
      const docData = await this.documentTemplateHandler.export();
      modulesData.documentTemplates = docData;
      counts.documentTemplates = docData.templates.length;
    }

    const sanitizedModulesData = serializeBigInts(modulesData);

    const manifest: SystemBackupManifest = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      systemVersion: '1.0.0',
      checksum: this.computeChecksum(sanitizedModulesData),
      counts,
    };

    return {
      manifest,
      modules: sanitizedModulesData,
    };
  }

  async previewBackup(payload: SystemBackupArchive): Promise<BackupPreviewResult> {
    if (!payload || !payload.manifest || !payload.modules) {
      throw new BadRequestException('无效的备份文件结构，缺少 manifest 或 modules 字段');
    }

    let valid = true;
    if (!payload.manifest.checksum) {
      valid = false;
    } else {
      const expectedChecksum = payload.manifest.checksum;
      const actualChecksum = this.computeChecksum(payload.modules);
      if (expectedChecksum !== actualChecksum) {
        valid = false;
      }
    }

    const modulePreviews = await Promise.all([
      payload.modules.aiModels
        ? this.aiModelHandler.preview(payload.modules.aiModels)
        : Promise.resolve(null),
      payload.modules.skills
        ? this.skillWorkflowHandler.previewSkills(payload.modules.skills)
        : Promise.resolve(null),
      payload.modules.temporalWorkflows
        ? this.skillWorkflowHandler.previewWorkflows(payload.modules.temporalWorkflows)
        : Promise.resolve(null),
      payload.modules.capabilityReleases
        ? this.capabilityReleaseHandler.preview(payload.modules.capabilityReleases)
        : Promise.resolve(null),
      payload.modules.browserTemplates
        ? this.templateFlowHandler.previewTemplates(payload.modules.browserTemplates)
        : Promise.resolve(null),
      payload.modules.executionFlowTemplates
        ? this.templateFlowHandler.previewFlowTemplates(payload.modules.executionFlowTemplates)
        : Promise.resolve(null),
      payload.modules.userOrganizations
        ? this.userOrgHandler.preview(payload.modules.userOrganizations)
        : Promise.resolve(null),
      payload.modules.taskPolicies
        ? this.taskPolicyHandler.preview(payload.modules.taskPolicies)
        : Promise.resolve(null),
      payload.modules.workspaces
        ? this.workspaceHandler.preview(payload.modules.workspaces)
        : Promise.resolve(null),
      payload.modules.documentTemplates && this.documentTemplateHandler
        ? this.documentTemplateHandler.preview(payload.modules.documentTemplates)
        : Promise.resolve(null),
    ]);

    const activePreviews = modulePreviews.filter((p): p is NonNullable<typeof p> => Boolean(p));

    let totalItems = 0;
    let newItems = 0;
    let conflictItems = 0;

    for (const preview of activePreviews) {
      totalItems += preview.totalInBackup;
      newItems += preview.newCount;
      conflictItems += preview.conflictCount;
    }

    return {
      valid,
      manifest: payload.manifest,
      modulePreviews: activePreviews,
      summary: {
        totalItems,
        newItems,
        conflictItems,
      },
    };
  }

  async importBackup(
    payload: SystemBackupArchive,
    strategy: BackupImportStrategy = 'merge_override',
    requestedModules?: BackupModuleKey[]
  ): Promise<BackupImportResult> {
    if (!payload || !payload.manifest || !payload.modules) {
      throw new BadRequestException('无效的备份文件格式');
    }

    if (!payload.manifest.checksum) {
      throw new BadRequestException('备份文件缺少必填的 manifest.checksum 字段，拒绝导入');
    }
    const expectedChecksum = payload.manifest.checksum;
    const actualChecksum = this.computeChecksum(payload.modules);
    if (expectedChecksum !== actualChecksum) {
      throw new BadRequestException(
        `备份文件校验和不匹配，文件可能已损坏或被篡改 (期望: ${expectedChecksum}, 实际: ${actualChecksum})`
      );
    }

    const selectedModules = new Set<BackupModuleKey>(
      requestedModules && requestedModules.length > 0
        ? requestedModules
        : (Object.keys(payload.modules) as BackupModuleKey[])
    );

    const importedCounts: Record<
      BackupModuleKey,
      { created: number; updated: number; skipped: number }
    > = {
      aiModels: { created: 0, updated: 0, skipped: 0 },
      skills: { created: 0, updated: 0, skipped: 0 },
      temporalWorkflows: { created: 0, updated: 0, skipped: 0 },
      capabilityReleases: { created: 0, updated: 0, skipped: 0 },
      browserTemplates: { created: 0, updated: 0, skipped: 0 },
      executionFlowTemplates: { created: 0, updated: 0, skipped: 0 },
      userOrganizations: { created: 0, updated: 0, skipped: 0 },
      taskPolicies: { created: 0, updated: 0, skipped: 0 },
      workspaces: { created: 0, updated: 0, skipped: 0 },
      documentTemplates: { created: 0, updated: 0, skipped: 0 },
    };

    const errors: string[] = [];

    // 1. User & Organizations (Dependencies first)
    if (selectedModules.has('userOrganizations') && payload.modules.userOrganizations) {
      try {
        importedCounts.userOrganizations = await this.userOrgHandler.import(
          payload.modules.userOrganizations,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import userOrganizations failed: ${err.message}`, err.stack);
        errors.push(`用户组织导入失败: ${err.message}`);
      }
    }

    // 2. AI Models
    if (selectedModules.has('aiModels') && payload.modules.aiModels) {
      try {
        importedCounts.aiModels = await this.aiModelHandler.import(
          payload.modules.aiModels,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import aiModels failed: ${err.message}`, err.stack);
        errors.push(`AI模型导入失败: ${err.message}`);
      }
    }

    // 3. Browser Templates
    if (selectedModules.has('browserTemplates') && payload.modules.browserTemplates) {
      try {
        importedCounts.browserTemplates = await this.templateFlowHandler.importTemplates(
          payload.modules.browserTemplates,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import browserTemplates failed: ${err.message}`, err.stack);
        errors.push(`浏览器模板导入失败: ${err.message}`);
      }
    }

    // 4. Execution Flow Templates & LLM Operations
    if (selectedModules.has('executionFlowTemplates') && payload.modules.executionFlowTemplates) {
      try {
        const flowResult = await this.templateFlowHandler.importFlowTemplates(
          payload.modules.executionFlowTemplates,
          strategy
        );
        importedCounts.executionFlowTemplates = {
          created: flowResult.created,
          updated: flowResult.updated,
          skipped: flowResult.skipped,
        };
        if (flowResult.errors && flowResult.errors.length > 0) {
          errors.push(...flowResult.errors);
        }
      } catch (err: any) {
        this.logger.error(`Import executionFlowTemplates failed: ${err.message}`, err.stack);
        errors.push(`流程模板导入失败: ${err.message}`);
      }
    }

    // 5. Skills & Tools
    if (selectedModules.has('skills') && payload.modules.skills) {
      try {
        importedCounts.skills = await this.skillWorkflowHandler.importSkills(
          payload.modules.skills,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import skills failed: ${err.message}`, err.stack);
        errors.push(`技能导入失败: ${err.message}`);
      }
    }

    // 6. Temporal Workflows
    if (selectedModules.has('temporalWorkflows') && payload.modules.temporalWorkflows) {
      try {
        importedCounts.temporalWorkflows = await this.skillWorkflowHandler.importWorkflows(
          payload.modules.temporalWorkflows,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import temporalWorkflows failed: ${err.message}`, err.stack);
        errors.push(`工作流导入失败: ${err.message}`);
      }
    }

    // 7. Capability Releases
    if (selectedModules.has('capabilityReleases') && payload.modules.capabilityReleases) {
      try {
        importedCounts.capabilityReleases = await this.capabilityReleaseHandler.import(
          payload.modules.capabilityReleases,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import capabilityReleases failed: ${err.message}`, err.stack);
        errors.push(`发布工件导入失败: ${err.message}`);
      }
    }

    // 8. Task Policies (Recipes, Aliases)
    if (selectedModules.has('taskPolicies') && payload.modules.taskPolicies) {
      try {
        importedCounts.taskPolicies = await this.taskPolicyHandler.import(
          payload.modules.taskPolicies,
          strategy
        );
      } catch (err: any) {
        this.logger.error(`Import taskPolicies failed: ${err.message}`, err.stack);
        errors.push(`任务策略导入失败: ${err.message}`);
      }
    }

    // 9. Workspaces & Documents
    if (selectedModules.has('workspaces') && payload.modules.workspaces) {
      try {
        const wsResult = await this.workspaceHandler.import(
          payload.modules.workspaces,
          strategy
        );
        importedCounts.workspaces = {
          created: wsResult.created,
          updated: wsResult.updated,
          skipped: wsResult.skipped,
        };
        if (wsResult.errors && wsResult.errors.length > 0) {
          errors.push(...wsResult.errors);
        }
      } catch (err: any) {
        this.logger.error(`Import workspaces failed: ${err.message}`, err.stack);
        errors.push(`工作空间导入失败: ${err.message}`);
      }
    }

    // 10. Document Templates & Skills
    if (
      selectedModules.has('documentTemplates') &&
      payload.modules.documentTemplates &&
      this.documentTemplateHandler
    ) {
      try {
        const docResult = await this.documentTemplateHandler.import(
          payload.modules.documentTemplates,
          strategy
        );
        importedCounts.documentTemplates = {
          created: docResult.created,
          updated: docResult.updated,
          skipped: docResult.skipped,
        };
        if (docResult.errors && docResult.errors.length > 0) {
          errors.push(...docResult.errors);
        }
      } catch (err: any) {
        this.logger.error(`Import documentTemplates failed: ${err.message}`, err.stack);
        errors.push(`文档模版导入失败: ${err.message}`);
      }
    }

    const success = errors.length === 0;
    const totalCreated = Object.values(importedCounts).reduce((acc, v) => acc + v.created, 0);
    const totalUpdated = Object.values(importedCounts).reduce((acc, v) => acc + v.updated, 0);
    const totalSkipped = Object.values(importedCounts).reduce((acc, v) => acc + v.skipped, 0);

    const message = success
      ? `系统数据还原成功：新增 ${totalCreated} 项，更新覆盖 ${totalUpdated} 项，跳过 ${totalSkipped} 项。`
      : `系统数据还原部分完成，存在 ${errors.length} 项错误。`;

    return {
      success,
      strategy,
      importedCounts,
      message,
      errors,
    };
  }
}
