import { DatabaseOutlined, RobotOutlined } from '@ant-design/icons';
import { Space, Tag, Typography } from 'antd';
import type { WorkspaceNode } from '@/api/workspace';

const { Text } = Typography;

interface WorkspaceDigestOverviewCellProps {
  node: WorkspaceNode;
  isOutOfScope?: boolean;
  onOpenAiClean?: (node: WorkspaceNode) => void;
}

/**
 * 表格一览视图单元格：保持清爽干净，仅展示治理状态与精简标签。
 * 核心提炼与结构化实体详情下沉至展开行（[+]）或详情抽屉中展示。
 */
export function WorkspaceDigestOverviewCell({
  node,
  isOutOfScope,
  onOpenAiClean,
}: WorkspaceDigestOverviewCellProps) {
  if (isOutOfScope) {
    return (
      <Tag color="default" style={{ margin: 0 }}>
        {node.type === 'folder' ? '对象外 (临时空间)' : '对象外'}
      </Tag>
    );
  }

  if (node.type === 'folder') {
    return <Text type="secondary">-</Text>;
  }

  const d = node.digest;
  if (!d || !d.cleanedByAi) {
    return (
      <Tag
        color="default"
        style={{
          margin: 0,
          cursor: onOpenAiClean ? 'pointer' : 'default',
        }}
        onClick={() => onOpenAiClean?.(node)}
        title="初期上传尚未进行 AI 深度清洗，点击立即快速清洗"
      >
        未清洗
      </Tag>
    );
  }

  return (
    <Space size={6} wrap align="center">
      <Tag
        color="success"
        icon={<RobotOutlined />}
        style={{
          margin: 0,
          fontWeight: 500,
          cursor: onOpenAiClean ? 'pointer' : 'default',
        }}
        onClick={() => onOpenAiClean?.(node)}
        title="点击重新配置并清理此文件"
      >
        已 AI 提炼 {d.aiModel ? `(${d.aiModel})` : ''}
      </Tag>

      {d.extractedData && (
        <Tag color="purple" icon={<DatabaseOutlined />} style={{ margin: 0 }}>
          含结构化数据
        </Tag>
      )}
    </Space>
  );
}
