import { Logger } from '@nestjs/common';
import { UUID_REGEX } from './coordination-collaborator.service';
import type { OrganizationWorkflowDefinition, WorkflowParamsSchema } from './org-workflow.entity';

const logger = new Logger('OrgWorkflowSkillAdapter');

/**
 * 动态为组织工作流适配其所绑定底层技能（Skill）的最新参数契约（paramsSchema）：
 * 当底层原子技能的输入参数发生变更（增删字段、调整描述、变更默认值）时，
 * 工作流表单卡片将自动感知并 100% 同步最新契约，避免表单与技能底层参数脱节。
 */
export async function enrichWorkflowWithSkillParams(
  prisma: any,
  wf: OrganizationWorkflowDefinition
): Promise<OrganizationWorkflowDefinition> {
  if (!wf || !prisma) return wf;

  // 1. 查找首阶段（提报/初稿生成阶段）所挂载的原子技能；若未显式标记则回退首个技能
  const submissionSkill =
    wf.assembledWorkflows?.find(
      (a) =>
        (a.stageType === 'submission' ||
          a.triggerEvent === 'on_submit' ||
          a.stageId === 'draft_submission' ||
          a.stageId === 'initiator_confirm') &&
        a.type === 'skill'
    ) || wf.assembledWorkflows?.find((a) => a.type === 'skill');

  if (!submissionSkill?.refId) {
    return wf;
  }

  try {
    const isUuid = UUID_REGEX.test(submissionSkill.refId);
    let skill: any = null;

    if (isUuid) {
      skill = await prisma.skillConfig.findFirst({
        where: { id: submissionSkill.refId },
        select: { id: true, name: true, paramsSchema: true, description: true },
      });
    } else {
      skill = await prisma.skillConfig.findFirst({
        where: { name: submissionSkill.refId },
        select: { id: true, name: true, paramsSchema: true, description: true },
      });
      if (!skill) {
        skill = await prisma.skillConfig.findFirst({
          where: { name: { equals: submissionSkill.refId, mode: 'insensitive' } },
          select: { id: true, name: true, paramsSchema: true, description: true },
        });
      }
    }

    if (!skill?.paramsSchema) {
      return wf;
    }

    let schema: any = skill.paramsSchema;
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema);
      } catch {
        schema = null;
      }
    }

    if (schema?.properties && Object.keys(schema.properties).length > 0) {
      const requiredList: string[] = Array.isArray(schema.required)
        ? [...schema.required]
        : [];

      for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
        if (prop && prop.required && !requiredList.includes(key)) {
          requiredList.push(key);
        }
      }

      return {
        ...wf,
        paramsSchema: {
          properties: schema.properties,
          required: requiredList,
        } as WorkflowParamsSchema,
      };
    }
  } catch (err: any) {
    logger.warn(
      `Failed to auto-enrich workflow ${wf.id} with skill ${submissionSkill.refId} paramsSchema: ${err.message}`
    );
  }

  return wf;
}

/**
 * 批量为工作流列表动态适配挂载技能的参数契约
 */
export async function enrichWorkflowsWithSkillParams(
  prisma: any,
  workflows: OrganizationWorkflowDefinition[]
): Promise<OrganizationWorkflowDefinition[]> {
  if (!Array.isArray(workflows) || workflows.length === 0) {
    return workflows;
  }
  return await Promise.all(
    workflows.map((wf) => enrichWorkflowWithSkillParams(prisma, wf))
  );
}

/**
 * 将适配后的最新技能参数契约回写同步至数据库中，保证 DB 与内存契约一致
 */
export async function syncWorkflowParamsToDb(
  prisma: any,
  wf: OrganizationWorkflowDefinition
): Promise<void> {
  if (!prisma || !wf?.id || !wf.paramsSchema) return;
  try {
    const raw: any[] = await prisma.$queryRawUnsafe(
      `SELECT definition_json FROM org_workflows WHERE id = $1`,
      wf.id
    );
    if (Array.isArray(raw) && raw.length > 0) {
      let def = raw[0].definition_json;
      if (typeof def === 'string') {
        def = JSON.parse(def);
      }
      def.paramsSchema = wf.paramsSchema;
      await prisma.$executeRawUnsafe(
        `UPDATE org_workflows SET definition_json = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        JSON.stringify(def),
        wf.id
      );
    }
  } catch (err: any) {
    logger.warn(`Failed to sync paramsSchema to DB for ${wf.id}: ${err.message}`);
  }
}
