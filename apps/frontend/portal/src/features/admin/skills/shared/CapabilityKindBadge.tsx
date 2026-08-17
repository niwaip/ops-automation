import { Tag } from 'antd';

export type CapabilityKind = 'builtin_skill' | 'published_skill' | 'llm_operation';

interface CapabilityKindBadgeProps {
  kind: CapabilityKind;
}

const getKindColor = (kind: CapabilityKind): string => {
  switch (kind) {
    case 'builtin_skill':
      return 'success';
    case 'published_skill':
      return 'purple';
    case 'llm_operation':
      return 'processing';
    default:
      return 'default';
  }
};

const getKindLabel = (kind: CapabilityKind): string => {
  switch (kind) {
    case 'builtin_skill':
      return '内置 Skill';
    case 'published_skill':
      return '已发布 Skill';
    case 'llm_operation':
      return 'LLM Operation';
    default:
      return kind;
  }
};

export function CapabilityKindBadge({ kind }: CapabilityKindBadgeProps) {
  return <Tag color={getKindColor(kind)}>{getKindLabel(kind)}</Tag>;
}