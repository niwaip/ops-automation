import {
  MessageOutlined,
  ApiOutlined,
  SettingOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { SkillConfigDTO } from '@/api/skill';
import { isRegistryBuiltinSkill } from '@/features/admin/skills/builtinSkillInventory';

export type SkillParamFormItem = {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  required?: boolean;
  defaultValue?: string;
  extractionPrompt?: string;
};

export const BUILTIN_SKILL_NAMES = new Set([
  'markdown_artifact_writer',
  'general_document_generator',
  'system_status_checker',
  'platform.document.markdown-artifact-writer',
  'platform.notification.internal-message',
]);

export const isBuiltinSkill = (skill: SkillConfigDTO): boolean => {
  if (isRegistryBuiltinSkill(skill)) {
    return true;
  }

  const id = (skill.id || '').toLowerCase();
  const name = (skill.name || '').toLowerCase();
  const sourceType = (skill.publishedSourceType || '').toLowerCase();

  if (BUILTIN_SKILL_NAMES.has(id) || BUILTIN_SKILL_NAMES.has(name)) {
    return true;
  }

  if (
    id.startsWith('platform.') ||
    id.startsWith('builtin.') ||
    id.startsWith('system.') ||
    name.startsWith('platform.') ||
    name.startsWith('builtin.') ||
    name.startsWith('system.')
  ) {
    return true;
  }

  if (
    sourceType === 'builtin' ||
    sourceType === 'builtin_workflow' ||
    sourceType === 'system' ||
    sourceType === 'default' ||
    sourceType.includes('builtin')
  ) {
    return true;
  }

  return false;
};

export const schemaToFormParams = (
  paramsSchema?: SkillConfigDTO['paramsSchema']
): SkillParamFormItem[] => {
  if (!paramsSchema?.properties) {
    return [];
  }

  return Object.entries(paramsSchema.properties).map(([name, config]) => ({
    name,
    type: config.type,
    description: config.description,
    required: paramsSchema.required.includes(name),
    defaultValue: config.default !== undefined ? String(config.default) : undefined,
    extractionPrompt: config.extractionPrompt,
  }));
};

export const formParamsToSchema = (items: SkillParamFormItem[] = []) => {
  const properties: Record<
    string,
    {
      type: 'string' | 'number' | 'date' | 'boolean';
      description: string;
      required?: boolean;
      default?: string | number | boolean;
      extractionPrompt?: string;
    }
  > = {};
  const required: string[] = [];

  items.forEach((item) => {
    if (!item?.name) {
      return;
    }

    properties[item.name] = {
      type: item.type,
      description: item.description,
      required: !!item.required,
      extractionPrompt: item.extractionPrompt || undefined,
    };

    if (item.defaultValue !== undefined && item.defaultValue !== '') {
      properties[item.name].default =
        item.type === 'number'
          ? Number(item.defaultValue)
          : item.type === 'boolean'
            ? item.defaultValue === 'true'
            : item.defaultValue;
    }

    if (item.required) {
      required.push(item.name);
    }
  });

  return { properties, required };
};

// Step types for execution flow
export const STEP_TYPES = [
  { label: '提示词 (Prompt)', value: 'text', icon: <MessageOutlined />, color: 'blue' },
  { label: 'API 调用', value: 'api', icon: <ApiOutlined />, color: 'green' },
  { label: '工具调用', value: 'tool', icon: <SettingOutlined />, color: 'purple' },
  { label: '脚本执行', value: 'script', icon: <CodeOutlined />, color: 'orange' },
];

export const VALIDATION_PHASES = ['启动', '配置检查', '真实执行', 'AI 审计'];

export interface ValidationProgressMeta {
  current: number;
  percent: number;
  status: 'normal' | 'active' | 'success' | 'exception';
}

export const getValidationProgressMeta = (
  stage: string,
  isRunning: boolean,
  pulse: number
): ValidationProgressMeta => {
  const normalized = stage.trim();
  const pulseOffset = pulse % 6;

  if (!normalized || normalized === '等待开始' || normalized === '正在启动验证') {
    return {
      current: 0,
      percent: isRunning ? Math.min(18, 12 + pulseOffset) : 0,
      status: isRunning ? ('active' as const) : ('normal' as const),
    };
  }

  if (normalized.includes('配置')) {
    return {
      current: 1,
      percent: Math.min(38, 28 + pulseOffset),
      status: 'active' as const,
    };
  }

  if (normalized.includes('真实模拟执行') || normalized.includes('执行')) {
    return {
      current: 2,
      percent: Math.min(72, 56 + pulseOffset * 2),
      status: 'active' as const,
    };
  }

  if (normalized.includes('审计')) {
    return {
      current: 3,
      percent: Math.min(92, 82 + pulseOffset),
      status: 'active' as const,
    };
  }

  if (normalized.includes('完成')) {
    return {
      current: 3,
      percent: 100,
      status: 'success' as const,
    };
  }

  if (normalized.includes('失败')) {
    return {
      current: 3,
      percent: 100,
      status: 'exception' as const,
    };
  }

  return {
    current: 0,
    percent: isRunning ? Math.min(24, 14 + pulseOffset) : 0,
    status: isRunning ? ('active' as const) : ('normal' as const),
  };
};
