import {
  ToolCatalogStatus,
  ToolPromptExposure,
  ToolRiskLevel,
} from '@/api/tool-catalog';

export const STATUS_META: Record<
  ToolCatalogStatus,
  { color: string; label: string; badgeStatus: 'success' | 'error' | 'warning' | 'default' }
> = {
  active: { color: 'success', label: '已启用', badgeStatus: 'success' },
  disabled: { color: 'error', label: '已禁用', badgeStatus: 'error' },
  deprecated: { color: 'warning', label: '已废弃', badgeStatus: 'warning' },
};

export const RISK_META: Record<
  ToolRiskLevel,
  { color: string; label: string; desc: string; border: string; bg: string }
> = {
  L0: {
    color: '#52c41a',
    label: 'L0 (只读无害)',
    desc: '只读或内部无副作用操作',
    border: 'rgba(82, 196, 26, 0.3)',
    bg: 'rgba(82, 196, 26, 0.08)',
  },
  L1: {
    color: '#1890ff',
    label: 'L1 (低风险)',
    desc: '生成渲染或低敏感本地读写',
    border: 'rgba(244, 144, 255, 0.3)',
    bg: 'rgba(24, 144, 255, 0.08)',
  },
  L2: {
    color: '#fa8c16',
    label: 'L2 (中风险·可变更)',
    desc: '涉及外部 API 调用或受控浏览器行为',
    border: 'rgba(250, 140, 22, 0.3)',
    bg: 'rgba(250, 140, 22, 0.08)',
  },
  L3: {
    color: '#f5222d',
    label: 'L3 (高危·破坏性)',
    desc: '不可逆数据变更或关键权限执行',
    border: 'rgba(245, 34, 45, 0.3)',
    bg: 'rgba(245, 34, 45, 0.08)',
  },
};

export const PROMPT_EXPOSURE_OPTIONS: Array<{
  value: ToolPromptExposure;
  label: string;
  desc: string;
  tagColor: string;
}> = [
  {
    value: 'prompt_and_runtime',
    label: 'Prompt + Runtime (全暴露)',
    desc: '大模型提示词可见，且运行时允许直接调用',
    tagColor: 'processing',
  },
  {
    value: 'prompt_only',
    label: '仅 Prompt 暴露',
    desc: '模型知晓此能力边界，但不注册直接执行函数',
    tagColor: 'cyan',
  },
  {
    value: 'runtime_only',
    label: '仅 Runtime 执行',
    desc: '模型不可见提示词，仅供平台内部引擎调度',
    tagColor: 'purple',
  },
  {
    value: 'hidden',
    label: 'Hidden (完全隐藏)',
    desc: '对模型与调度层均隐藏，处于冷备隔离态',
    tagColor: 'default',
  },
];

export const TOOL_STATUS_OPTIONS: Array<{ value: ToolCatalogStatus; label: string }> = [
  { value: 'active', label: '已启用' },
  { value: 'disabled', label: '已禁用' },
  { value: 'deprecated', label: '已废弃' },
];

export const TOOL_RISK_OPTIONS: Array<{ value: ToolRiskLevel; label: string }> = [
  { value: 'L0', label: 'L0 (只读)' },
  { value: 'L1', label: 'L1 (低风险)' },
  { value: 'L2', label: 'L2 (中风险)' },
  { value: 'L3', label: 'L3 (高危)' },
];

export const CATEGORY_COLORS: Record<string, string> = {
  discovery: 'blue',
  parameter: 'geekblue',
  utility: 'cyan',
  execution: 'orange',
  flow: 'purple',
  interaction: 'magenta',
};

export const promptExposureMeta = (value: ToolPromptExposure) =>
  PROMPT_EXPOSURE_OPTIONS.find((option) => option.value === value) || {
    value,
    label: value,
    desc: '',
    tagColor: 'default',
  };

export const promptExposureLabel = (value: ToolPromptExposure) => promptExposureMeta(value).label;

export const releaseStatusLabel = (value?: string | null) => {
  if (!value) {
    return '未发布';
  }
  return value;
};

export const buildMetadataJson = (value?: string): Record<string, unknown> => {
  if (!value?.trim()) {
    return {};
  }

  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('metadataJson 必须是标准的 JSON 对象格式');
  }

  return parsed as Record<string, unknown>;
};
