import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionFlowTemplateService } from '../execution-flow/execution-flow-template.service';
import {
  CreateSkillDTO,
  SkillToolBinding,
  SkillToolValidationMessage,
  SkillToolValidationResult,
} from './interfaces';
import { ToolCatalogService } from './tool-catalog.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

@Injectable()
export class SkillToolBindingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionFlowService: ExecutionFlowTemplateService,
    private readonly toolCatalogService: ToolCatalogService
  ) {}

  normalizeToolNames(toolNames?: string[]): string[] {
    return Array.from(
      new Set((toolNames || []).map((item) => String(item || '').trim()).filter(Boolean))
    );
  }

  extractToolNamesFromExecutionFlow(executionFlow?: Array<Record<string, any>>): string[] {
    if (!Array.isArray(executionFlow)) {
      return [];
    }

    const inferred = executionFlow.flatMap((step) => {
      if (!step || typeof step !== 'object') {
        return [];
      }
      if (step.type === 'api') {
        return ['api_call'];
      }
      return typeof step?.tool?.name === 'string' ? [step.tool.name] : [];
    });

    return this.normalizeToolNames(inferred);
  }

  async inferToolNamesFromTemplates(templateIds?: string[]): Promise<string[]> {
    const inferred = new Set<string>();
    const normalizedTemplateIds = this.normalizeToolNames(templateIds);

    if (normalizedTemplateIds.length === 0) {
      return [];
    }

    inferred.add('flow_execute');

    for (const templateId of normalizedTemplateIds) {
      const template = await this.executionFlowService.getTemplate(templateId);
      if (!template) {
        continue;
      }
      for (const step of template.steps || []) {
        if (step?.type === 'api') {
          inferred.add('api_call');
        }
        if (step?.tool?.name) {
          inferred.add(step.tool.name);
        }
      }
    }

    return Array.from(inferred);
  }

  async buildSkillToolValidation(
    payload: Pick<CreateSkillDTO, 'tools' | 'executionFlow' | 'executionFlowTemplateIds'>
  ): Promise<SkillToolValidationResult> {
    const declaredTools = this.normalizeToolNames(payload.tools);
    const inferredFromFlow = this.extractToolNamesFromExecutionFlow(payload.executionFlow as any[]);
    const inferredFromTemplates = await this.inferToolNamesFromTemplates(
      payload.executionFlowTemplateIds
    );
    const inferredTools = this.normalizeToolNames([...inferredFromFlow, ...inferredFromTemplates]);
    const effectiveTools = this.normalizeToolNames([...declaredTools, ...inferredTools]);

    const catalogMap = await this.toolCatalogService.getCatalogItemsByNames(effectiveTools);
    const missingTools = effectiveTools.filter((toolName) => !catalogMap.has(toolName));
    const disabledTools = effectiveTools.filter(
      (toolName) => catalogMap.get(toolName)?.status !== 'active'
    );
    const forbiddenSkillTools = declaredTools.filter((toolName) => {
      const tool = catalogMap.get(toolName);
      return tool ? !tool.allowSkillBinding : false;
    });
    const undeclaredFlowTools = inferredTools.filter(
      (toolName) => !declaredTools.includes(toolName)
    );

    const messages: SkillToolValidationMessage[] = [];
    missingTools.forEach((toolName) => {
      messages.push({
        code: 'tool_not_registered_in_catalog',
        toolName,
        severity: 'error',
        message: `工具 "${toolName}" 未注册到工具目录中`,
      });
    });
    disabledTools.forEach((toolName) => {
      messages.push({
        code: 'tool_disabled',
        toolName,
        severity: 'error',
        message: `工具 "${toolName}" 当前已被禁用`,
      });
    });
    forbiddenSkillTools.forEach((toolName) => {
      messages.push({
        code: 'tool_binding_forbidden',
        toolName,
        severity: 'error',
        message: `工具 "${toolName}" 不允许被 Skill 绑定`,
      });
    });
    undeclaredFlowTools.forEach((toolName) => {
      messages.push({
        code: 'undeclared_flow_tool',
        toolName,
        severity: 'error',
        message: `执行流中推导出了工具 "${toolName}"，但 Skill.tools 未显式声明该工具`,
      });
    });

    return {
      isValid: messages.every((item) => item.severity !== 'error'),
      declaredTools,
      inferredTools,
      effectiveTools,
      missingTools,
      disabledTools,
      forbiddenSkillTools,
      undeclaredFlowTools,
      messages,
    };
  }

  async syncSkillToolBindings(
    skillId: string,
    payload: Pick<CreateSkillDTO, 'tools' | 'executionFlow' | 'executionFlowTemplateIds'>
  ): Promise<void> {
    const declaredTools = this.normalizeToolNames(payload.tools);
    const inferredFromFlow = this.extractToolNamesFromExecutionFlow(payload.executionFlow as any[]);
    const inferredFromTemplates = await this.inferToolNamesFromTemplates(
      payload.executionFlowTemplateIds
    );

    const bindingRows = [
      ...declaredTools.map((toolName) => ({ toolName, bindingSource: 'declared' })),
      ...this.normalizeToolNames([...inferredFromFlow, ...inferredFromTemplates])
        .filter((toolName) => !declaredTools.includes(toolName))
        .map((toolName) => ({
          toolName,
          bindingSource: toolName === 'flow_execute' ? 'system_required' : 'inferred_from_flow',
        })),
    ];

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM skill_tool_bindings WHERE skill_id = $1::uuid`,
      skillId
    );

    for (const row of bindingRows) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO skill_tool_bindings (
          id, skill_id, tool_name, binding_source, created_at, updated_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, $4, now(), now()
        )`,
        randomUUID(),
        skillId,
        row.toolName,
        row.bindingSource
      );
    }
  }

  async getSkillToolBindingMap(skillIds: string[]): Promise<Map<string, SkillToolBinding[]>> {
    const uniqueSkillIds = Array.from(new Set(skillIds.filter((id) => isValidUUID(id))));
    if (uniqueSkillIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT skill_id, tool_name, binding_source
       FROM skill_tool_bindings
       WHERE skill_id = ANY($1::uuid[])
       ORDER BY tool_name ASC`,
      uniqueSkillIds
    );

    const map = new Map<string, SkillToolBinding[]>();
    for (const row of rows) {
      const current = map.get(row.skill_id) || [];
      current.push({
        skillId: row.skill_id,
        toolName: row.tool_name,
        bindingSource: row.binding_source,
      });
      map.set(row.skill_id, current);
    }
    return map;
  }
}
