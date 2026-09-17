import { useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  skillApi,
  builtinSkillApi,
  type BuiltinSkillInventoryDTO,
  type SkillConfigDTO,
} from '@/api/skill';
import {
  orgWorkflowApi,
  type AvailableBaseWorkflowItem,
} from '@/api/orgWorkflow';
import { isBuiltinSkill } from '@/features/admin/skills/utils/skillHelpers';

export interface WorkflowCapabilityOption {
  label: string;
  value: string;
  title: string;
  description?: string;
  category?: string;
  type: 'workflow' | 'builtin' | 'custom' | 'legacy';
  rawItem?: any;
}

export interface WorkflowCapabilityGroup {
  label: string;
  options: WorkflowCapabilityOption[];
}

/**
 * 历史/内部 HandlerKey 与标准公开能力 Key 之间的对齐映射表
 */
export const KNOWN_CAPABILITY_ALIASES: Record<string, string> = {
  'document.contract.review': 'platform.document.contract-reviewer',
  'document.contract.compare': 'platform.document.contract-comparator',
  'document.pdf.create': 'platform.document.pdf-create',
  'document.pdf.split': 'platform.document.pdf-split',
  'document.pdf.merge': 'platform.document.pdf-merge',
  'contract_review': 'platform.document.contract-reviewer',
  'contract_reviewer': 'platform.document.contract-reviewer',
  'contract_compare': 'platform.document.contract-comparator',
  'contract_comparator': 'platform.document.contract-comparator',
  'web_search': 'platform.search.web',
  'tavily_search': 'platform.search.web',
};

export function resolveCanonicalCapabilityKey(keyOrAlias?: string): string {
  if (!keyOrAlias) return '';
  return KNOWN_CAPABILITY_ALIASES[keyOrAlias] || keyOrAlias;
}

/**
 * 动态加载并组织供工作流自动化阶段选择的执行能力列表
 * 数据源对接管理端技能中心：
 * - 内置标准技能：builtinSkillApi.listInventory (/admin/skills?tab=builtin)
 * - 自定义发布技能：skillApi.list (/admin/skills?tab=custom)
 */
export function useWorkflowCapabilityOptions(currentValue?: string) {
  const builtinQuery = useQuery(
    ['builtin-skill-inventory'],
    builtinSkillApi.listInventory,
    {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  );

  const customSkillsQuery = useQuery(
    ['skills'],
    skillApi.list,
    {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  );

  const workflowsQuery = useQuery(
    ['available-base-workflows'],
    orgWorkflowApi.getAvailableBaseWorkflows,
    {
      staleTime: 60000,
      refetchOnWindowFocus: false,
    }
  );

  const isLoading =
    builtinQuery.isLoading ||
    customSkillsQuery.isLoading ||
    workflowsQuery.isLoading;

  const { capabilityGroups, capabilityMap } = useMemo(() => {
    const builtinList: BuiltinSkillInventoryDTO[] = builtinQuery.data?.skills || [];
    const allCustomSkills: SkillConfigDTO[] = customSkillsQuery.data?.skills || [];
    const customList = allCustomSkills.filter((s) => !isBuiltinSkill(s));
    const baseWorkflows: AvailableBaseWorkflowItem[] = Array.isArray(workflowsQuery.data)
      ? workflowsQuery.data
      : [];

    const map = new Map<string, WorkflowCapabilityOption>();

    // 1. 业务工作流资产（Execution Flow / Temporal Workflow / 编排专用流）
    const workflowOptions: WorkflowCapabilityOption[] = baseWorkflows
      .filter((w) => w.type !== 'skill') // 技能项走标准技能通道
      .map((w) => {
        const typeLabel = w.type === 'execution_flow' ? '执行流' : 'Temporal编排流';
        const opt: WorkflowCapabilityOption = {
          label: `${w.name} [${typeLabel}] (${w.id})`,
          value: w.id,
          title: w.name,
          description: w.description || w.handlerRule || undefined,
          category: w.category || w.type,
          type: 'workflow',
          rawItem: w,
        };
        map.set(w.id, opt);
        return opt;
      });

    // 2. 内置标准技能 (Builtin Skills)
    const builtinOptions: WorkflowCapabilityOption[] = builtinList.map((skill) => {
      const opt: WorkflowCapabilityOption = {
        label: `${skill.displayName || skill.capabilityKey} (${skill.capabilityKey})`,
        value: skill.capabilityKey,
        title: skill.displayName || skill.capabilityKey,
        description: skill.description || undefined,
        category: skill.category,
        type: 'builtin',
        rawItem: skill,
      };
      map.set(skill.capabilityKey, opt);
      // 兼容别名检索
      if (Array.isArray(skill.aliases)) {
        skill.aliases.forEach((alias) => {
          if (!map.has(alias)) {
            map.set(alias, opt);
          }
        });
      }
      return opt;
    });

    // 3. 自定义发布技能 (Custom Skills)
    const customOptions: WorkflowCapabilityOption[] = customList.map((skill) => {
      const opt: WorkflowCapabilityOption = {
        label: `${skill.name || skill.id} (${skill.id})`,
        value: skill.id,
        title: skill.name || skill.id,
        description: skill.description || undefined,
        category: 'custom',
        type: 'custom',
        rawItem: skill,
      };
      map.set(skill.id, opt);
      if (skill.name && !map.has(skill.name)) {
        map.set(skill.name, opt);
      }
      return opt;
    });

    // 补充静态预置的标准别名映射（防止后端接口未刷新或旧版字段差异）
    Object.entries(KNOWN_CAPABILITY_ALIASES).forEach(([alias, targetKey]) => {
      const targetOpt = map.get(targetKey);
      if (targetOpt && !map.has(alias)) {
        map.set(alias, targetOpt);
      }
    });

    const groups: WorkflowCapabilityGroup[] = [];

    if (workflowOptions.length > 0) {
      groups.push({
        label: `业务工作流与编排流 (Workflows - ${workflowOptions.length})`,
        options: workflowOptions,
      });
    }

    groups.push(
      {
        label: `内置标准技能 (Builtin Skills - ${builtinOptions.length})`,
        options: builtinOptions,
      },
      {
        label: `自定义发布技能 (Custom Skills - ${customOptions.length})`,
        options: customOptions,
      }
    );

    const canonicalCurrentValue = resolveCanonicalCapabilityKey(currentValue);

    // 如果已有配置项不在当前加载列表中（且无法通过标准别名映射找到），追加兜底展示组，避免 UI 显示为空白或丢失已存参数
    if (
      currentValue &&
      !map.has(currentValue) &&
      !map.has(canonicalCurrentValue)
    ) {
      const fallbackOpt: WorkflowCapabilityOption = {
        label: `${currentValue} (已配置/兼容标识)`,
        value: currentValue,
        title: currentValue,
        description: '已保存的执行能力标识',
        type: 'legacy',
      };
      map.set(currentValue, fallbackOpt);
      groups.push({
        label: '已选配置 / 兼容标识',
        options: [fallbackOpt],
      });
    }

    return { capabilityGroups: groups, capabilityMap: map };
  }, [builtinQuery.data, customSkillsQuery.data, workflowsQuery.data, currentValue]);

  const canonicalCurrentValue = resolveCanonicalCapabilityKey(currentValue);
  const selectedCapability = currentValue
    ? capabilityMap.get(currentValue) || capabilityMap.get(canonicalCurrentValue)
    : undefined;

  return {
    isLoading,
    capabilityGroups,
    capabilityMap,
    selectedCapability,
    workflows: workflowsQuery.data || [],
    builtinSkills: builtinQuery.data?.skills || [],
    customSkills: (customSkillsQuery.data?.skills || []).filter((s) => !isBuiltinSkill(s)),
    refetch: () => {
      builtinQuery.refetch();
      customSkillsQuery.refetch();
      workflowsQuery.refetch();
    },
  };
}
