import React from 'react';
import { Card, Descriptions, Space, Tag, Typography } from 'antd';
import type { ExecutionSemantic } from '@/api/execution';

const { Text } = Typography;

const renderSemanticGroupedMissing = (
  groupedMissing: NonNullable<ExecutionSemantic['groupedMissing']>,
  labels: {
    group: string;
    field: string;
    blocking: string;
    previewOk: string;
  }
) => {
  if (!groupedMissing.length) {
    return null;
  }

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {groupedMissing.map((group) => (
        <Card
          key={group.key}
          size="small"
          styles={{ body: { padding: 12 } }}
          style={{ borderRadius: 10, background: 'var(--bg-secondary)' }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space wrap>
              <Text strong>{group.label}</Text>
              <Tag color={group.kind === 'array_group' ? 'processing' : 'default'}>
                {group.kind === 'array_group' ? labels.group : labels.field}
              </Tag>
              <Tag color={group.blocking ? 'red' : 'gold'}>
                {group.blocking ? labels.blocking : labels.previewOk}
              </Tag>
            </Space>
            {group.description ? <Text type="secondary">{group.description}</Text> : null}
            <Text type="secondary">{group.missingFieldNames.join(', ')}</Text>
          </Space>
        </Card>
      ))}
    </Space>
  );
};

const SemanticOverviewCard: React.FC<{
  semantic: ExecutionSemantic;
  text: {
    semanticOverview: string;
    semanticMode: string;
    complexity: string;
    previewReady: string;
    finalReady: string;
    missingFields: string;
    arrayGroups: string;
    semanticSummary: string;
    groupedMissing: string;
    groupLabel: string;
    fieldLabel: string;
    blockingLabel: string;
    previewOkLabel: string;
    yes: string;
    no: string;
  };
}> = ({ semantic, text }) => {
  const groupedMissing = Array.isArray(semantic.groupedMissing) ? semantic.groupedMissing : [];
  const complexityCategory =
    typeof semantic.complexity?.category === 'string' ? semantic.complexity.category : '-';
  const missingFields =
    typeof semantic.complexity?.missingFields === 'number'
      ? semantic.complexity.missingFields
      : '-';
  const arrayGroups =
    typeof semantic.complexity?.arrayGroups === 'number' ? semantic.complexity.arrayGroups : '-';
  const semanticSummary =
    typeof semantic.summary === 'string' && semantic.summary.trim().length > 0
      ? semantic.summary
      : undefined;

  return (
    <Card title={text.semanticOverview} style={{ marginBottom: 16 }}>
      <Descriptions
        column={2}
        size="small"
        style={{ marginBottom: groupedMissing.length > 0 ? 16 : 0 }}
      >
        <Descriptions.Item label={text.semanticMode}>{semantic.mode}</Descriptions.Item>
        <Descriptions.Item label={text.complexity}>{complexityCategory}</Descriptions.Item>
        <Descriptions.Item label={text.previewReady}>
          <Tag color={semantic.previewReady ? 'green' : 'gold'}>
            {semantic.previewReady ? text.yes : text.no}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={text.finalReady}>
          <Tag color={semantic.finalReady ? 'green' : 'red'}>
            {semantic.finalReady ? text.yes : text.no}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label={text.missingFields}>{missingFields}</Descriptions.Item>
        <Descriptions.Item label={text.arrayGroups}>{arrayGroups}</Descriptions.Item>
        {semanticSummary ? (
          <Descriptions.Item label={text.semanticSummary} span={2}>
            {semanticSummary}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      {groupedMissing.length > 0 ? (
        <div>
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            {text.groupedMissing}
          </Text>
          {renderSemanticGroupedMissing(groupedMissing, {
            group: text.groupLabel,
            field: text.fieldLabel,
            blocking: text.blockingLabel,
            previewOk: text.previewOkLabel,
          })}
        </div>
      ) : null}
    </Card>
  );
};

export default SemanticOverviewCard;
