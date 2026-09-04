import type { SkillConfigDTO, BuiltinSkillInventoryDTO } from '@/api/skill';

export interface BuiltinToolkitGroup {
  key: string;
  name: string;
  englishName: string;
  icon: string;
  tagColor: string;
  description: string;
  matcher: (skill: SkillConfigDTO) => boolean;
}

export interface SkillTableRow extends SkillConfigDTO {
  isGroup?: boolean;
  groupKey?: string;
  groupMeta?: BuiltinToolkitGroup;
  children?: SkillTableRow[];
  childCount?: number;
  enabledCount?: number;
  allEnabled?: boolean;
  someEnabled?: boolean;
  configurableSkill?: SkillConfigDTO;
}

export const BUILTIN_TOOLKIT_GROUPS: BuiltinToolkitGroup[] = [
  {
    key: 'workspace',
    name: '知识空间套件',
    englishName: 'Knowledge & Workspace Toolkit',
    icon: '📚',
    tagColor: 'green',
    description: '提供个人盘、部门盘与公司公共盘知识文档探索研读、关键词扫描定位、大纲速览及互联网实时搜索服务',
    matcher: (skill) =>
      skill.id.startsWith('platform.workspace.') ||
      skill.id.startsWith('platform.search.') ||
      skill.id.includes('workspace') ||
      skill.name.includes('工作空间') ||
      skill.name.includes('知识') ||
      skill.name.includes('文档探索') ||
      skill.name.includes('联网搜索'),
  },
  {
    key: 'email',
    name: '邮件服务套件',
    englishName: 'Email Toolkit',
    icon: '📧',
    tagColor: 'blue',
    description: '提供企业邮件读取、检索、状态标记及邮件发送服务，支持统一邮箱连接与凭据管理',
    matcher: (skill) =>
      skill.id.startsWith('platform.email.') ||
      skill.id.includes('email') ||
      skill.name.includes('邮件'),
  },
  {
    key: 'document',
    name: '文档编辑套件',
    englishName: 'Document Toolkit',
    icon: '📄',
    tagColor: 'volcano',
    description: '提供各类文档（PDF/Word/PPT/Markdown等）内容提取、页面拆分合并、文档创建与结构化产物生成服务',
    matcher: (skill) =>
      !skill.id.includes('workspace') &&
      !skill.name.includes('工作空间') &&
      !skill.name.includes('探索') &&
      (skill.id.startsWith('platform.document.') ||
        skill.id.includes('pdf') ||
        skill.id.includes('document') ||
        skill.name.toUpperCase().includes('PDF') ||
        skill.name.includes('Markdown') ||
        (skill.name.includes('文档') && !skill.name.includes('探索'))),
  },
  {
    key: 'notification',
    name: '消息推送套件',
    englishName: 'Notification Toolkit',
    icon: '🔔',
    tagColor: 'purple',
    description: '提供 Bark、Webhook 及各类移动端即时消息推送服务',
    matcher: (skill) =>
      skill.id.includes('bark') ||
      skill.id.includes('push') ||
      skill.id.includes('notify') ||
      skill.name.includes('推送') ||
      skill.name.includes('通知'),
  },
];

export function buildGroupedBuiltinSkills(
  skills: SkillConfigDTO[],
  builtinInventoryMap: Map<string, BuiltinSkillInventoryDTO>
): SkillTableRow[] {
  const assignedSkillIds = new Set<string>();
  const rows: SkillTableRow[] = [];

  for (const group of BUILTIN_TOOLKIT_GROUPS) {
    const matchingSkills = skills.filter(
      (s) => !assignedSkillIds.has(s.id) && group.matcher(s)
    );

    if (matchingSkills.length === 0) continue;

    matchingSkills.forEach((s) => assignedSkillIds.add(s.id));

    const enabledCount = matchingSkills.filter((s) => s.isActive).length;
    const allEnabled = enabledCount === matchingSkills.length;
    const someEnabled = enabledCount > 0 && !allEnabled;

    const configurableSkill = matchingSkills.find((s) => {
      const inv = builtinInventoryMap.get(s.id);
      return (inv?.runtimeConfig?.fields.length || 0) > 0;
    });

    const childRows: SkillTableRow[] = matchingSkills.map((s) => ({
      ...s,
      groupKey: group.key,
      isGroup: false,
    }));

    rows.push({
      id: `group:${group.key}`,
      name: `${group.name} (${group.englishName})`,
      description: group.description,
      triggerKeywords: [],
      paramsSchema: { properties: {}, required: [] },
      executionFlowTemplateIds: [],
      executionFlow: [],
      tools: [],
      isActive: allEnabled,
      isPublished: matchingSkills.every((s) => s.isPublished),
      publishedReleaseStatus: 'active',
      publishedDeploymentStatus: 'healthy',
      publishedSourceType: 'builtin',
      builtinMetadata: {
        registryId: `group:${group.key}`,
        capabilityKey: `group.${group.key}`,
        aliases: [],
        owner: 'platform',
        category: group.key,
        defaultAccess: 'authenticated',
        lifecycle: 'stable',
        activeVersion: `${matchingSkills.length} tools`,
        versionCount: matchingSkills.length,
      },
      isGroup: true,
      groupKey: group.key,
      groupMeta: group,
      childCount: matchingSkills.length,
      enabledCount,
      allEnabled,
      someEnabled,
      configurableSkill,
      children: childRows,
    });
  }

  // Any remaining skills that didn't match a defined group
  const remainingSkills = skills.filter((s) => !assignedSkillIds.has(s.id));
  if (remainingSkills.length > 0) {
    const generalGroup: BuiltinToolkitGroup = {
      key: 'general',
      name: '其他通用工具',
      englishName: 'General Tools',
      icon: '🛠️',
      tagColor: 'default',
      description: '其他系统内置的独立通用工具与能力扩展',
      matcher: () => true,
    };

    const enabledCount = remainingSkills.filter((s) => s.isActive).length;
    const allEnabled = enabledCount === remainingSkills.length;
    const someEnabled = enabledCount > 0 && !allEnabled;

    const configurableSkill = remainingSkills.find((s) => {
      const inv = builtinInventoryMap.get(s.id);
      return (inv?.runtimeConfig?.fields.length || 0) > 0;
    });

    rows.push({
      id: 'group:general',
      name: `${generalGroup.name} (${generalGroup.englishName})`,
      description: generalGroup.description,
      triggerKeywords: [],
      paramsSchema: { properties: {}, required: [] },
      executionFlowTemplateIds: [],
      executionFlow: [],
      tools: [],
      isActive: allEnabled,
      isPublished: remainingSkills.every((s) => s.isPublished),
      publishedReleaseStatus: 'active',
      publishedDeploymentStatus: 'healthy',
      publishedSourceType: 'builtin',
      builtinMetadata: {
        registryId: 'group:general',
        capabilityKey: 'group.general',
        aliases: [],
        owner: 'platform',
        category: 'general',
        defaultAccess: 'authenticated',
        lifecycle: 'stable',
        activeVersion: `${remainingSkills.length} tools`,
        versionCount: remainingSkills.length,
      },
      isGroup: true,
      groupKey: generalGroup.key,
      groupMeta: generalGroup,
      childCount: remainingSkills.length,
      enabledCount,
      allEnabled,
      someEnabled,
      configurableSkill,
      children: remainingSkills.map((s) => ({
        ...s,
        groupKey: generalGroup.key,
        isGroup: false,
      })),
    });
  }

  return rows;
}
