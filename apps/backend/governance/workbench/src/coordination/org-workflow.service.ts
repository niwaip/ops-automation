import {
BadRequestException,
ConflictException,
Inject,
Injectable,
Logger,
NotFoundException,
OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WORKBENCH_PRISMA,WorkbenchPrismaPort } from '../ports';
import { CoordinationTaskType } from './dto/workbench-coordination.dto';
import {
DEDICATED_BASE_WORKFLOW_TEMPLATES,
DEFAULT_CONTRACT_REVIEW_ASSEMBLED_WORKFLOWS,
DEFAULT_NDA_ASSEMBLED_WORKFLOWS,
} from './org-base-workflow-templates.constants';
import {
AvailableBaseWorkflowItem,
CreateOrgWorkflowDto,
OrganizationWorkflowDefinition,
OrgWorkflowAccessRequest,
OrgWorkflowCatalogItemDto,
OrgWorkflowPublishStatus,
UpdateOrgWorkflowDto,
WorkflowStageDefinition
} from './org-workflow.entity';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class OrgWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(OrgWorkflowService.name);

  // 内存中持久化维护企业工作流，初始化时加载默认种子数据
  private workflows = new Map<string, OrganizationWorkflowDefinition>();
  private accessRequests = new Map<string, OrgWorkflowAccessRequest>();
  private customBaseWorkflows = new Map<string, AvailableBaseWorkflowItem>();

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort
  ) {
    this.seedDefaultWorkflows();
  }

  async onModuleInit() {
    await this.ensureTableExists();
    const seeded = await this.isSystemSeeded();
    if (!seeded) {
      if (this.workflows.size === 0) {
        this.seedDefaultWorkflows();
      }
      for (const wf of this.workflows.values()) {
        await this.saveWorkflowToDb(wf);
      }
      await this.markSystemSeeded();
      this.logger.log('Initial default workflows seeded and marked.');
    } else {
      await this.loadWorkflowsFromDb();
    }
  }

  private async ensureTableExists(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS org_workflows (
          id VARCHAR(128) PRIMARY KEY,
          workflow_id VARCHAR(128) NOT NULL,
          org_id VARCHAR(128),
          version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(64) DEFAULT 'general',
          icon VARCHAR(64),
          task_type VARCHAR(64) DEFAULT 'approval',
          status VARCHAR(32) DEFAULT 'published',
          is_published BOOLEAN DEFAULT true,
          definition_json JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_org_workflows_wf_id ON org_workflows(workflow_id)
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_org_workflows_org_id ON org_workflows(org_id)
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_org_workflows_version ON org_workflows(version)
      `);
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS org_workflow_system_meta (
          key VARCHAR(64) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    } catch (err: any) {
      this.logger.warn(`Failed to verify or create org_workflows table: ${err.message}`);
    }
  }

  private async isSystemSeeded(): Promise<boolean> {
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT value FROM org_workflow_system_meta WHERE key = 'seeded'`
      );
      if (Array.isArray(rows) && rows.length > 0 && rows[0].value === 'true') {
        return true;
      }
      const wfCountRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM org_workflows`
      );
      if (Array.isArray(wfCountRows) && wfCountRows[0]?.count > 0) {
        await this.markSystemSeeded();
        return true;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to check isSystemSeeded: ${err.message}`);
    }
    return false;
  }

  private async markSystemSeeded(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO org_workflow_system_meta (key, value, updated_at)
        VALUES ('seeded', 'true', NOW())
        ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();
      `);
    } catch (err: any) {
      this.logger.warn(`Failed to markSystemSeeded: ${err.message}`);
    }
  }

  private async loadWorkflowsFromDb(): Promise<boolean> {
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT id, workflow_id, org_id, version, name, description, category, icon, task_type, status, is_published, definition_json, created_at, updated_at
        FROM org_workflows
      `);
      if (Array.isArray(rows)) {
        this.workflows.clear();
        for (const row of rows) {
          const rawDef = typeof row.definition_json === 'string'
            ? JSON.parse(row.definition_json)
            : row.definition_json;
          const wf: OrganizationWorkflowDefinition = {
            ...rawDef,
            id: row.id,
            workflowId: row.workflow_id,
            orgId: row.org_id || rawDef.orgId,
            version: row.version || rawDef.version || '1.0.0',
            name: row.name || rawDef.name,
            description: row.description || rawDef.description || '',
            category: row.category || rawDef.category || 'general',
            icon: row.icon || rawDef.icon,
            taskType: row.task_type || rawDef.taskType,
            status: row.status || rawDef.status,
            isPublished: Boolean(row.is_published),
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          };
          this.workflows.set(wf.id, wf);
        }
        this.logger.log(`Loaded ${rows.length} enterprise workflows from database.`);
        return true;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to load org_workflows from db: ${err.message}`);
    }
    return false;
  }

  public async saveWorkflowToDb(wf: OrganizationWorkflowDefinition): Promise<void> {
    try {
      await this.ensureTableExists();
      const defJson = JSON.stringify(wf);
      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO org_workflows (id, workflow_id, org_id, version, name, description, category, icon, task_type, status, is_published, definition_json, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          workflow_id = EXCLUDED.workflow_id,
          org_id = EXCLUDED.org_id,
          version = EXCLUDED.version,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          icon = EXCLUDED.icon,
          task_type = EXCLUDED.task_type,
          status = EXCLUDED.status,
          is_published = EXCLUDED.is_published,
          definition_json = EXCLUDED.definition_json,
          updated_at = NOW();
        `,
        wf.id,
        wf.workflowId,
        wf.orgId || null,
        wf.version || '1.0.0',
        wf.name,
        wf.description || '',
        wf.category || 'general',
        wf.icon || null,
        wf.taskType || 'approval',
        wf.status || 'published',
        Boolean(wf.isPublished),
        defJson
      );
    } catch (err: any) {
      this.logger.error(`Failed to persist workflow ${wf.id} to db: ${err.message}`);
    }
  }

  public async deleteWorkflowFromDb(id: string, workflowId?: string): Promise<void> {
    try {
      if (workflowId && workflowId !== id) {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM org_workflows WHERE id = $1 OR workflow_id = $1 OR id = $2 OR workflow_id = $2`,
          id,
          workflowId
        );
      } else {
        await this.prisma.$executeRawUnsafe(
          `DELETE FROM org_workflows WHERE id = $1 OR workflow_id = $1`,
          id
        );
      }
    } catch (err: any) {
      this.logger.error(`Failed to delete workflow ${id} from db: ${err.message}`);
    }
  }

  /**
   * 初始化预置的企业工作流（基于底层普通工作流组装并赋予标准流程定义）
   */
  private seedDefaultWorkflows() {
    const defaultWorkflows: OrganizationWorkflowDefinition[] = [
      {
        id: 'legal.contract.review_flow',
        workflowId: 'legal.contract.review_flow',
        name: '标准合同起草与法务审查闭环流',
        description: '员工在线填报商务要素生成合同初稿，自动流转至法务部门进行智能要件审查与人工批注。通过后自动归档并通知员工，未通过则回退重修。',
        category: 'legal',
        icon: 'SafetyCertificateOutlined',
        taskType: CoordinationTaskType.approval,
        status: 'published',
        isPublished: true,
        version: '1.0.0',
        assembledWorkflows: [...DEFAULT_CONTRACT_REVIEW_ASSEMBLED_WORKFLOWS],
        processDefinition: {
          stages: [
            {
              id: 'draft_submission',
              name: '商务填报与初稿生成',
              type: 'submission',
              description: '员工填写对方主体、合同金额、条款要素等商务参数并生成初稿',
              isLocked: false,
            },
            {
              id: 'legal_review',
              name: '法务合规审查与批注',
              type: 'approval',
              description: '法务部门执行合同要件审查，核验合规风险并在线填写批注建议',
              approverRule: 'department',
              approverDepartment: '法务部',
              rollbackStageId: 'draft_submission',
              actions: ['approve', 'reject'],
              isLocked: true,
            },
            {
              id: 'auto_archiving',
              name: '电子归档与版本存证',
              type: 'automation',
              description: '审查通过后自动写入企业合同库并固化版本凭证',
              isLocked: true,
            },
            {
              id: 'final_receipt',
              name: '回执通知与办结',
              type: 'archive',
              capabilityId: 'platform.notification.internal-message',
              description: '向发起员工推送归档结项回执并闭环流转',
              isLocked: false,
            },
          ],
        },
        paramsSchema: BUILT_IN_WORKFLOW_TEMPLATES.find(
          (t) => t.id === 'legal.contract.review_flow'
        )!.paramsSchema as any,
        grantedRoleIds: ['employee', 'admin', 'legal'],
        createdAt: new Date('2026-09-01T08:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'legal.nda.generation_and_review_flow',
        workflowId: 'legal.nda.generation_and_review_flow',
        name: '保密合同起草与法务审查闭环流',
        description: '专属保密合同生成技能 (ConfidentialityAgreementGenerationWorkflow) 提取要件生成初稿，流转法务部专项审查批注，通过后归档存证，未通过回退重修。',
        category: 'legal',
        icon: 'SafetyCertificateOutlined',
        taskType: CoordinationTaskType.approval,
        status: 'published',
        isPublished: true,
        version: '1.0.0',
        assembledWorkflows: [...DEFAULT_NDA_ASSEMBLED_WORKFLOWS],
        processDefinition: {
          stages: [
            {
              id: 'draft_submission',
              name: '商务填报与初稿生成',
              type: 'submission',
              description: '调用专属保密合同生成技能 (ConfidentialityAgreementGenerationWorkflow) 提取主体、保密期限等要件输出初稿',
              isLocked: false,
            },
            {
              id: 'initiator_confirm',
              name: '业务担当初稿确认',
              type: 'approval',
              description: '调用专属技能生成初稿后，由业务担当查看并核对生成的内容与条款要素，确认通过后提交合同审查',
              approverRule: 'initiator',
              rollbackStageId: 'draft_submission',
              actions: ['approve', 'reject'],
              allowFileReplacement: true,
              isArtifactReview: true,
              isLocked: true,
            },
            {
              id: 'contract_review_execution',
              name: '合同合规智能审查',
              type: 'automation',
              capabilityId: 'platform.document.contract-reviewer',
              config: {
                contractType: 'nda',
                myPosition: 'buyer',
              },
              description: '担当确认后自动调用 contract-review 规则库排查永久保密陷阱、除外责任及违约条款，输出审查报告',
              isLocked: true,
            },
            {
              id: 'legal_review',
              name: '法务合规核准与确认',
              type: 'approval',
              description: '法务专员结合初稿与智能审查报告进行专业把关与批注，通过后归档存证，未通过回退担当重修',
              approverRule: 'department',
              approverDepartment: '法务部',
              rollbackStageId: 'initiator_confirm',
              actions: ['approve', 'reject'],
              isLocked: true,
            },
            {
              id: 'auto_archiving',
              name: '电子归档与版本存证',
              type: 'automation',
              capabilityId: 'platform.document.pdf-create',
              description: '法务确认通过后自动生成不可篡改版本并归档存证入企业合同库',
              isLocked: true,
            },
            {
              id: 'final_receipt',
              name: '回执通知与办结',
              type: 'archive',
              capabilityId: 'platform.notification.internal-message',
              description: '向业务担当与法务专员推送归档结项回执并闭环流转',
              isLocked: false,
            },
          ],
        },
        paramsSchema: BUILT_IN_WORKFLOW_TEMPLATES.find(
          (t) => t.id === 'legal.nda.generation_and_review_flow'
        )!.paramsSchema as any,
        grantedRoleIds: ['employee', 'admin', 'legal'],
        createdAt: new Date('2026-09-01T08:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const w of defaultWorkflows) {
      this.workflows.set(w.id, w);
    }
    this.logger.log(`Initialized ${defaultWorkflows.length} default enterprise workflows.`);
  }

  /**
   * 获取底层可用资产（供管理员组装时多选）
   */
  async getAvailableBaseWorkflows(): Promise<AvailableBaseWorkflowItem[]> {
    const results: AvailableBaseWorkflowItem[] = [...DEDICATED_BASE_WORKFLOW_TEMPLATES];
    const seenIds = new Set<string>(results.map((r) => r.id));

    try {
      // 1. 获取 Execution Flow Templates (通用技术执行流，不预设流程阶段)
      const flows = await this.prisma.executionFlowTemplate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, category: true, description: true },
        take: 30,
      });
      for (const f of flows) {
        if (!seenIds.has(f.id)) {
          seenIds.add(f.id);
          results.push({
            type: 'execution_flow',
            id: f.id,
            name: f.name,
            category: f.category,
            description: f.description || undefined,
            handlerRule: '执行流后台自动化执行',
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query executionFlowTemplates:', err);
    }

    try {
      // 2. 获取 Temporal Workflows (包含通用编排流与带 stageType 的流程专用流)
      const temporalWorkflows = await this.prisma.temporalWorkflow.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          workflowDsl: true,
          activityDsl: true,
          generatedCode: true,
          validationStatus: true,
          validationScore: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      for (const tw of temporalWorkflows) {
        if (!seenIds.has(tw.id)) {
          seenIds.add(tw.id);
          let dsl: any = null;
          try {
            dsl = typeof tw.workflowDsl === 'string' ? JSON.parse(tw.workflowDsl) : tw.workflowDsl;
          } catch (error) {
            this.logger.warn(`Failed to parse workflowDsl for workflow ${tw.id}: ${(error as Error).message}`);
          }
          let actDsl: any = null;
          try {
            actDsl = typeof tw.activityDsl === 'string' ? JSON.parse(tw.activityDsl) : tw.activityDsl;
          } catch (error) {
            this.logger.warn(`Failed to parse activityDsl for workflow ${tw.id}: ${(error as Error).message}`);
          }

          const stageType = dsl?.stageType || undefined;
          results.push({
            type: 'temporal_workflow',
            id: tw.id,
            name: tw.name,
            category: dsl?.stageCategory || dsl?.category || 'temporal',
            description: tw.description || undefined,
            stageType,
            handlerRule: dsl?.handlerRule || (stageType ? '后台自动化执行' : 'Temporal 引擎异步编排执行'),
            requiredMetadata: dsl?.requiredMetadata || undefined,
            validationStatus: tw.validationStatus || 'draft',
            validationScore: tw.validationScore || 0,
            hasGeneratedCode: Boolean(tw.generatedCode),
            workflowDsl: dsl || undefined,
            activityDsl: actDsl || undefined,
            generatedCode: tw.generatedCode || undefined,
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query temporalWorkflows:', err);
    }

    try {
      // 3. 获取 Skills (原子技能，不预设流程阶段)
      const skills = await this.prisma.skillConfig.findMany({
        where: { isActive: true },
        select: { id: true, name: true, description: true },
        take: 30,
      });
      for (const s of skills) {
        if (!seenIds.has(s.id)) {
          seenIds.add(s.id);
          results.push({
            type: 'skill',
            id: s.id,
            name: s.name,
            category: 'skill',
            description: s.description || undefined,
            handlerRule: 'AI / 工具原子技能执行',
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query skills:', err);
    }

    // 4. 追加用户自定义或 AI 生成的流程专用原子流 (具备明确 stageType)
    for (const customFlow of this.customBaseWorkflows.values()) {
      if (!seenIds.has(customFlow.id)) {
        seenIds.add(customFlow.id);
        results.push(customFlow);
      }
    }

    return results;
  }

  /**
   * 注册用户创建或 AI 生成的流程专用原子工作流 (支持与 Temporal 真实工作流关联持久化)
   */
  async registerCustomBaseWorkflow(
    item: Partial<AvailableBaseWorkflowItem> & { id: string; name: string }
  ): Promise<AvailableBaseWorkflowItem> {
    if (!item.id || !item.name) {
      throw new BadRequestException('工作流 ID 和名称不能为空');
    }
    const flow: AvailableBaseWorkflowItem = {
      type: item.type || 'temporal_workflow',
      id: item.id.trim(),
      name: item.name.trim(),
      category: item.category || 'general',
      stageType: item.stageType || 'automation',
      handlerRule: item.handlerRule || '后台自动化执行',
      requiredMetadata: item.requiredMetadata || ['业务主键', '操作人'],
      description: item.description,
      validationStatus: item.validationStatus || (item.generatedCode ? 'generated' : 'draft'),
      validationScore: item.validationScore || 0,
      hasGeneratedCode: Boolean(item.generatedCode),
      workflowDsl: item.workflowDsl,
      activityDsl: item.activityDsl,
      generatedCode: item.generatedCode,
    };

    // 如果包含 workflowDsl，同步存入真实的 temporal_workflows 数据表
    try {
      if (item.workflowDsl) {
        const dsl = {
          ...item.workflowDsl,
          stageType: flow.stageType,
          handlerRule: flow.handlerRule,
          requiredMetadata: flow.requiredMetadata,
          stageCategory: flow.category,
        };
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flow.id);
        const existing = isUuid
          ? await this.prisma.temporalWorkflow.findUnique({ where: { id: flow.id } })
          : await this.prisma.temporalWorkflow.findFirst({ where: { name: flow.name } });

        if (existing) {
          const updated = await this.prisma.temporalWorkflow.update({
            where: { id: existing.id },
            data: {
              name: flow.name,
              description: flow.description,
              workflowDsl: dsl as any,
              activityDsl: (item.activityDsl || { activities: [] }) as any,
              generatedCode: item.generatedCode || existing.generatedCode,
              validationStatus: flow.validationStatus || existing.validationStatus,
              validationScore: flow.validationScore || existing.validationScore,
            },
          });
          flow.id = updated.id;
        } else {
          const created = await this.prisma.temporalWorkflow.create({
            data: {
              ...(isUuid ? { id: flow.id } : {}),
              name: flow.name,
              description: flow.description,
              taskQueue: `${(flow.category || 'general').toUpperCase()}_STAGE_TASK_QUEUE`,
              workflowDsl: dsl as any,
              activityDsl: (item.activityDsl || { activities: [] }) as any,
              generatedCode: item.generatedCode || null,
              validationStatus: flow.validationStatus || (item.generatedCode ? 'generated' : 'draft'),
              validationScore: flow.validationScore || 0,
              isActive: true,
            },
          });
          flow.id = created.id;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to persist custom stage workflow to temporal_workflows: ${err}`);
    }

    this.customBaseWorkflows.set(flow.id, flow);
    this.logger.log(`Registered custom base workflow: ${flow.id} (${flow.name})`);
    return flow;
  }

  /**
   * 删除指定的自定义流程专用原子流
   */
  async deleteCustomBaseWorkflow(id: string): Promise<boolean> {
    const existed = this.customBaseWorkflows.delete(id);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await this.prisma.temporalWorkflow.deleteMany({ where: { id } });
      }
    } catch (err) {
      this.logger.warn(`Failed to delete temporal workflow record for ${id}: ${err}`);
    }
    this.logger.log(`Deleted custom base workflow: ${id}, existed: ${existed}`);
    return existed || true;
  }

  /**
   * 清空所有自定义流程专用原子流
   */
  async clearAllCustomBaseWorkflows(): Promise<void> {
    this.customBaseWorkflows.clear();
    try {
      const all = await this.prisma.temporalWorkflow.findMany();
      const toDeleteIds: string[] = [];
      for (const w of all) {
        let dsl: any = null;
        try {
          dsl = typeof w.workflowDsl === 'string' ? JSON.parse(w.workflowDsl) : w.workflowDsl;
        } catch (error) {
          this.logger.warn(`Failed to parse workflowDsl for workflow ${w.id}: ${(error as Error).message}`);
        }
        if (dsl?.stageType) {
          toDeleteIds.push(w.id);
        }
      }
      if (toDeleteIds.length > 0) {
        await this.prisma.temporalWorkflow.deleteMany({
          where: { id: { in: toDeleteIds } },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to clear custom temporal workflows: ${err}`);
    }
    this.logger.log('Cleared all custom base workflows');
  }

  /**
   * 管理员查询全量工作流列表（草稿 + 已发布）及全景统计
   */
  async listAdminWorkflows(): Promise<{
    workflows: OrganizationWorkflowDefinition[];
    stats: {
      total: number;
      publishedCount: number;
      draftCount: number;
      assembledBaseCount: number;
    };
  }> {
    const all = Array.from(this.workflows.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const publishedCount = all.filter((w) => w.isPublished).length;
    const draftCount = all.length - publishedCount;
    const assembledBaseCount = all.reduce(
      (sum, w) => sum + (w.assembledWorkflows?.length || 0),
      0
    );

    return {
      workflows: all,
      stats: {
        total: all.length,
        publishedCount,
        draftCount,
        assembledBaseCount,
      },
    };
  }

  /**
   * 业务端员工查询已发布的组织工作流目录（带权限判定）
   */
  async listCatalogForUser(userId: string): Promise<OrgWorkflowCatalogItemDto[]> {
    let user: any = null;
    if (userId && UUID_REGEX.test(userId)) {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { userRoles: { include: { role: true } } },
      });
    } else if (userId && userId !== 'anonymous') {
      user = await this.prisma.user.findFirst({
        where: { username: { equals: userId, mode: 'insensitive' }, isActive: true },
        include: { userRoles: { include: { role: true } } },
      });
    }

    const userRoleNames = new Set<string>();
    const userRoleIds = new Set<string>();

    if (user) {
      if (user.role) {
        userRoleNames.add(user.role);
      }
      for (const ur of user.userRoles || []) {
        userRoleIds.add(ur.roleId);
        if (ur.role?.name) {
          userRoleNames.add(ur.role.name);
        }
      }
    }

    const isAdmin = userRoleNames.has('admin') || user?.role === 'admin';

    // 仅返回已发布的工作流
    const publishedWorkflows = Array.from(this.workflows.values()).filter(
      (w) => w.isPublished
    );

    // 查询该用户当前的所有申请
    const userRequests = Array.from(this.accessRequests.values()).filter(
      (r) => r.userId === userId
    );
    const requestMap = new Map<string, OrgWorkflowAccessRequest>(
      userRequests.map((r) => [r.workflowId, r])
    );

    return publishedWorkflows.map((w) => {
      let isAuthorized = isAdmin;

      if (!isAuthorized) {
        // 校验 grantedRoleIds
        const granted = w.grantedRoleIds || [];
        if (granted.length === 0) {
          // 未配置角色时默认对所有已激活员工开放
          isAuthorized = true;
        } else {
          isAuthorized = granted.some(
            (roleIdOrName) =>
              userRoleIds.has(roleIdOrName) || userRoleNames.has(roleIdOrName)
          );
        }
      }

      const req = requestMap.get(w.id);
      let accessStatus: 'authorized' | 'requested' | 'unauthorized' = 'unauthorized';

      if (isAuthorized) {
        accessStatus = 'authorized';
      } else if (req && req.status === 'pending') {
        accessStatus = 'requested';
      }

      return {
        ...w,
        accessStatus,
        accessRequest: req || null,
      };
    });
  }

  /**
   * 按 id 或 workflowId 检索工作流定义
   */
  public findWorkflow(id: string): OrganizationWorkflowDefinition | null {
    if (!id) return null;
    const direct = this.workflows.get(id);
    if (direct) return direct;
    for (const wf of this.workflows.values()) {
      if (wf.id === id || wf.workflowId === id) {
        return wf;
      }
    }
    return null;
  }

  /**
   * 获取单个工作流详情
   */
  getWorkflowById(id: string): OrganizationWorkflowDefinition | null {
    return this.findWorkflow(id);
  }

  /**
   * 动态解析组织工作流特定阶段绑定的执行能力 (Skill / Temporal / Automation)
   * 依据 orgId + workflowId + definitionVersion + stageId，杜绝在外部写死技能 UUID
   */
  async resolveStageBinding(params: {
    workflowId: string;
    stageId?: string;
    stageType?: string;
    orgId?: string;
    version?: string;
  }): Promise<{
    found: boolean;
    workflowId: string;
    stageId?: string;
    stageType?: string;
    refId?: string;
    capabilityType?: string;
    skillId?: string;
    skillName?: string;
    skillVersion?: string;
  }> {
    // 1. 组织租户隔离与真实性校验：若指定了组织（非 default/global），严格校验组织合法性
    if (params.orgId && params.orgId !== 'default' && params.orgId !== 'global') {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.orgId);
        const org = await this.prisma.organization?.findFirst?.({
          where: isUuid
            ? { OR: [{ id: params.orgId }, { code: params.orgId }, { name: params.orgId }] }
            : { OR: [{ code: params.orgId }, { name: params.orgId }] },
          select: { id: true, isActive: true },
        });
        if (!org || org.isActive === false) {
          this.logger.warn(
            `[resolveStageBinding] Target organization not found or inactive: ${params.orgId}`
          );
          return { found: false, workflowId: params.workflowId };
        }
      } catch (err: any) {
        this.logger.warn(`Failed to validate organization ${params.orgId}: ${err.message}`);
        return { found: false, workflowId: params.workflowId };
      }
    }

    // 2. 优先匹配指定组织专属定制的工作流定义，次之匹配全局已发布工作流
    let wf: OrganizationWorkflowDefinition | null = null;
    if (params.orgId) {
      wf =
        Array.from(this.workflows.values()).find(
          (w) =>
            (w.workflowId === params.workflowId || w.id === params.workflowId) &&
            w.orgId === params.orgId
        ) || null;
    }

    if (!wf) {
      wf = this.getWorkflowById(params.workflowId);
    }

    if (!wf) {
      return { found: false, workflowId: params.workflowId };
    }

    // 3. 组织专属工作流隔离检查：若工作流专属于某组织，禁止跨组织越权解析
    if (wf.orgId && params.orgId && wf.orgId !== params.orgId && params.orgId !== 'default') {
      this.logger.warn(
        `[resolveStageBinding] Workflow ${params.workflowId} belongs to org ${wf.orgId}, cross-tenant access from ${params.orgId} denied.`
      );
      return { found: false, workflowId: params.workflowId };
    }

    // 4. 版本精确匹配强校验：如果传入了指定版本（非 latest），且与工作流当前版本不一致，返回未找到
    if (params.version && params.version !== 'latest' && params.version !== wf.version) {
      this.logger.warn(
        `[resolveStageBinding] Version mismatch for workflow ${params.workflowId}: requested ${params.version}, available ${wf.version}`
      );
      return { found: false, workflowId: params.workflowId };
    }

    const assembledList = wf.assembledWorkflows || [];
    let matchedStep: any = null;

    if (params.stageId) {
      matchedStep = assembledList.find(
        (s: any) => s.stageId === params.stageId || s.id === params.stageId || s.refId === params.stageId
      );
    }

    if (!matchedStep && params.stageType) {
      matchedStep = assembledList.find((s: any) => s.stageType === params.stageType);
    }

    if (
      !matchedStep &&
      (!params.stageId || params.stageId === 'draft_submission' || params.stageType === 'submission')
    ) {
      matchedStep =
        assembledList.find(
          (s: any) => s.triggerEvent === 'on_submit' || s.stageType === 'submission'
        ) || assembledList[0];
    }

    if (!matchedStep) {
      matchedStep = assembledList[0];
    }

    if (!matchedStep) {
      return { found: false, workflowId: params.workflowId };
    }

    const refId = matchedStep.refId || matchedStep.capabilityId || matchedStep.id;
    let skillId = refId;
    let skillName = matchedStep.name;
    let skillVersion = '1.0.0';

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refId);

    try {
      if (isUuid) {
        const sc = await this.prisma.skillConfig.findUnique({ where: { id: refId } });
        if (sc) {
          skillId = sc.id;
          skillName = sc.name;
        }
      } else {
        const sc = await this.prisma.skillConfig.findFirst({
          where: { name: refId, isActive: true },
        });
        if (sc) {
          skillId = sc.id;
          skillName = sc.name;
        } else {
          const rel = await this.prisma.capabilityRelease.findFirst({
            where: { sourceName: refId, status: 'published' },
            orderBy: { releaseVersion: 'desc' },
          });
          if (rel?.publishedSkillId) {
            skillId = rel.publishedSkillId;
            skillName = rel.sourceName || refId;
            skillVersion = String(rel.releaseVersion || '1.0.0');
          }
        }
      }

      // Check capability release for version
      if (skillId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skillId)) {
        const rel = await this.prisma.capabilityRelease.findFirst({
          where: { publishedSkillId: skillId, status: 'published' },
          orderBy: { releaseVersion: 'desc' },
        });
        if (rel?.releaseVersion) {
          skillVersion = String(rel.releaseVersion);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to query skillConfig/capabilityRelease for refId ${refId}: ${err.message}`);
    }

    return {
      found: true,
      workflowId: wf.workflowId,
      stageId: matchedStep.stageId || params.stageId || 'draft_submission',
      stageType: matchedStep.stageType || params.stageType || 'submission',
      refId,
      capabilityType: matchedStep.type || 'skill',
      skillId,
      skillName,
      skillVersion,
    };
  }

  /**
   * 创建新的企业工作流（基于底层工作流组装与流程定义）
   */
  async createWorkflow(
    dto: CreateOrgWorkflowDto,
    creatorUserId?: string
  ): Promise<OrganizationWorkflowDefinition> {
    if (!dto.name?.trim() || !dto.workflowId?.trim()) {
      throw new BadRequestException('工作流名称和唯一代号 (workflowId) 不能为空');
    }

    const existing = Array.from(this.workflows.values()).find(
      (w) => w.workflowId === dto.workflowId.trim()
    );
    if (existing) {
      throw new ConflictException(`已存在相同代号的企业工作流: ${dto.workflowId}`);
    }

    const id = dto.workflowId.trim();
    const status: OrgWorkflowPublishStatus = dto.status || 'draft';
    const isPublished = status === 'published';

    const defaultStages: WorkflowStageDefinition[] = [
      {
        id: 'submit',
        name: '发起申请',
        type: 'submission',
        description: '申请人提交业务表单参数',
      },
      {
        id: 'approval',
        name: '主管审批',
        type: 'approval',
        description: '相关审批人在收集箱核准或驳回',
        approverRule: 'leader',
        actions: ['approve', 'reject'],
      },
      {
        id: 'archive',
        name: '闭环归档',
        type: 'archive',
        description: '自动归档并保留履历审计',
      },
    ];

    const workflow: OrganizationWorkflowDefinition = {
      id,
      workflowId: dto.workflowId.trim(),
      orgId: dto.orgId,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      category: dto.category || 'general',
      icon: dto.icon || 'ApartmentOutlined',
      taskType: dto.taskType || CoordinationTaskType.approval,
      status,
      isPublished,
      version: dto.version || '1.0.0',
      assembledWorkflows: dto.assembledWorkflows || [],
      processDefinition: dto.processDefinition || { stages: defaultStages },
      paramsSchema: dto.paramsSchema || {
        properties: {
          title: { type: 'string', description: '事项标题', required: true },
          reason: { type: 'string', description: '事由说明', required: true },
        },
        required: ['title', 'reason'],
      },
      grantedRoleIds: dto.grantedRoleIds || ['employee', 'admin'],
      createdBy: creatorUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.workflows.set(id, workflow);
    await this.saveWorkflowToDb(workflow);
    this.logger.log(`Created enterprise workflow: ${workflow.name} (${workflow.id})`);
    return workflow;
  }

  /**
   * 更新企业工作流配置、底层工作流组装与流程定义
   */
  async updateWorkflow(
    id: string,
    dto: UpdateOrgWorkflowDto
  ): Promise<OrganizationWorkflowDefinition> {
    const existing = this.findWorkflow(id);
    if (!existing) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }

    const nextStatus = dto.status !== undefined ? dto.status : existing.status;
    const isPublished = nextStatus === 'published';

    const updated: OrganizationWorkflowDefinition = {
      ...existing,
      orgId: dto.orgId !== undefined ? dto.orgId : existing.orgId,
      name: dto.name?.trim() ?? existing.name,
      description: dto.description?.trim() ?? existing.description,
      category: dto.category ?? existing.category,
      icon: dto.icon ?? existing.icon,
      taskType: dto.taskType ?? existing.taskType,
      status: nextStatus,
      isPublished,
      version: dto.version ?? existing.version,
      assembledWorkflows: dto.assembledWorkflows ?? existing.assembledWorkflows,
      processDefinition: dto.processDefinition ?? existing.processDefinition,
      paramsSchema: dto.paramsSchema ?? existing.paramsSchema,
      grantedRoleIds: dto.grantedRoleIds ?? existing.grantedRoleIds,
      updatedAt: new Date().toISOString(),
    };

    this.workflows.set(updated.id, updated);
    await this.saveWorkflowToDb(updated);
    this.logger.log(`Updated enterprise workflow: ${updated.name} (${updated.id})`);
    return updated;
  }

  /**
   * 管理员一键发布 / 下架
   */
  async togglePublish(id: string, publish?: boolean): Promise<OrganizationWorkflowDefinition> {
    const existing = this.findWorkflow(id);
    if (!existing) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }

    const nextPublished = publish !== undefined ? publish : !existing.isPublished;
    existing.isPublished = nextPublished;
    existing.status = nextPublished ? 'published' : 'draft';
    existing.updatedAt = new Date().toISOString();

    this.workflows.set(existing.id, existing);
    await this.saveWorkflowToDb(existing);
    this.logger.log(`Workflow [${existing.name}] published status set to ${nextPublished}`);
    return existing;
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(id: string): Promise<void> {
    const target = this.findWorkflow(id);
    if (!target) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }
    this.workflows.delete(target.id);
    if (target.workflowId) {
      this.workflows.delete(target.workflowId);
    }
    await this.deleteWorkflowFromDb(target.id, target.workflowId);
    this.logger.log(`Deleted enterprise workflow: ${target.name} (${target.id})`);
  }

  /**
   * 授权管理：修改角色列表
   */
  async updatePermissions(id: string, roleIds: string[]): Promise<OrganizationWorkflowDefinition> {
    const existing = this.findWorkflow(id);
    if (!existing) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }
    existing.grantedRoleIds = Array.from(new Set(roleIds));
    existing.updatedAt = new Date().toISOString();
    this.workflows.set(existing.id, existing);
    await this.saveWorkflowToDb(existing);
    return existing;
  }

  /**
   * 普通员工提交开通权限申请
   */
  async requestAccess(
    workflowId: string,
    userId: string,
    reason?: string
  ): Promise<OrgWorkflowAccessRequest> {
    const workflow = this.findWorkflow(workflowId);
    if (!workflow) {
      throw new NotFoundException(`企业工作流不存在: ${workflowId}`);
    }

    let user: any = null;
    if (userId && UUID_REGEX.test(userId)) {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true },
      });
    } else if (userId && userId !== 'anonymous') {
      user = await this.prisma.user.findFirst({
        where: { username: { equals: userId, mode: 'insensitive' }, isActive: true },
        select: { id: true, username: true },
      });
    }

    const requestId = `req_${randomUUID()}`;
    const request: OrgWorkflowAccessRequest = {
      id: requestId,
      workflowId,
      userId,
      username: user?.username || 'user',
      status: 'pending',
      reason: reason?.trim(),
      createdAt: new Date().toISOString(),
    };

    this.accessRequests.set(requestId, request);
    this.logger.log(`User ${userId} requested access for workflow ${workflowId}`);
    return request;
  }

  /**
   * 管理员审核开通权限申请
   */
  async reviewAccessRequest(
    requestId: string,
    reviewerId: string,
    status: 'approved' | 'rejected',
    note?: string
  ): Promise<OrgWorkflowAccessRequest> {
    const request = this.accessRequests.get(requestId);
    if (!request) {
      throw new NotFoundException(`授权申请不存在: ${requestId}`);
    }

    request.status = status;
    request.responseNote = note?.trim();
    request.processedAt = new Date().toISOString();
    request.processedBy = reviewerId;

    if (status === 'approved') {
      // 自动将员工角色或该工作流授权名单更新
      const workflow = this.findWorkflow(request.workflowId);
      if (workflow && !workflow.grantedRoleIds.includes('employee')) {
        workflow.grantedRoleIds.push('employee');
        this.workflows.set(workflow.id, workflow);
        await this.saveWorkflowToDb(workflow);
      }
    }

    this.accessRequests.set(requestId, request);
    return request;
  }

  /**
   * 获取某工作流的所有开通申请列表
   */
  listAccessRequests(workflowId?: string): OrgWorkflowAccessRequest[] {
    const all = Array.from(this.accessRequests.values());
    if (workflowId) {
      return all.filter((r) => r.workflowId === workflowId);
    }
    return all;
  }
}
