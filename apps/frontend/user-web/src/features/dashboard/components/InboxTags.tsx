import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  MailOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import type { WorkbenchInboxItem } from '@/api/workbenchInbox';

export function renderSourceTag(sourceType: string) {
  switch (sourceType) {
    case 'chat': return <Tag color="cyan" icon={<RobotOutlined />}>智能协同</Tag>;
    case 'email': return <Tag color="gold" icon={<MailOutlined />}>邮件</Tag>;
    case 'schedule': return <Tag color="geekblue" icon={<ClockCircleOutlined />}>定时任务</Tag>;
    case 'im_channel': return <Tag color="purple">IM 消息</Tag>;
    case 'workflow': return <Tag color="blue" icon={<ThunderboltOutlined />}>工作流</Tag>;
    default: return <Tag color="default">手动便签</Tag>;
  }
}

export function renderConfidenceTag(item: WorkbenchInboxItem) {
  const extra = (item.extra || item.unifiedPayload?.extra || {}) as Record<string, any>;
  if (extra.requiresHumanIntervention || item.title?.includes('需人工介入')) {
    return <Tag color="error" icon={<EyeOutlined />}>需人工介入</Tag>;
  }
  const score = Math.round(item.confidence * 100);
  if (score >= 75) {
    return <Tooltip title={`要素完整度评分: ${score}%`}><Tag color="success" icon={<CheckCircleOutlined />}>要素完整 · {score}%</Tag></Tooltip>;
  }
  return (
    <Tooltip title={`置信度 ${score}%: 条目要素（动作/时间/主体）不够清晰，建议点击上方「AI 智能整理」深度厘清`}>
      <Tag color="warning" icon={<RobotOutlined />}>建议整理 · {score}%</Tag>
    </Tooltip>
  );
}

export function renderStatusTag(status: string) {
  switch (status) {
    case 'unprocessed': return <Tag color="processing" style={{ margin: 0, fontWeight: 500 }}>未整理</Tag>;
    case 'clarified': return <Tag color="cyan" style={{ margin: 0, fontWeight: 500 }}>已AI厘清</Tag>;
    case 'converted': return <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0, fontWeight: 500 }}>已转待办</Tag>;
    case 'archived': return <Tag color="default" style={{ margin: 0 }}>已归档</Tag>;
    default: return null;
  }
}

export function renderPriorityTag(priority?: string) {
  switch (priority) {
    case 'urgent': return <Tag color="error">紧急</Tag>;
    case 'high': return <Tag color="warning">高优先级</Tag>;
    case 'medium': return <Tag color="processing">中优先级</Tag>;
    case 'low': return <Tag color="default">低优先级</Tag>;
    default: return priority ? <Tag color="default">{priority}</Tag> : null;
  }
}
