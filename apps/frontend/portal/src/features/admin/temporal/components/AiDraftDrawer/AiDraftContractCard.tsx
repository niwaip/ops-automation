import React from 'react';
import { Card, Space, Tag, Typography, Tooltip } from 'antd';
import { AiWorkflowDraft } from '@/api/temporal';
import { groupWorkflowInputParams } from '../../pages/TemporalPage.utils';

const { Text } = Typography;

export interface AiDraftContractCardProps {
  draft: AiWorkflowDraft;
}

export const renderDraftInputParamSummary = (draft: AiWorkflowDraft) => {
  const groups = groupWorkflowInputParams(draft.workflowDsl.inputParams);
  if (groups.length === 0) {
    return <Text type="secondary">未声明输入参数</Text>;
  }
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {groups.map((group: any) => (
        <Card key={`draft-group-${group.key}`} size="small" title={group.label}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {group.scalarEntries.map(([key, value]: [string, any]) => (
              <div
                key={`draft-input-${group.key}-${key}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '96px 64px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'start',
                  padding: '8px 10px',
                  border: '1px solid var(--bg-secondary)',
                  borderRadius: 8,
                  background: 'var(--bg-card)',
                }}
              >
                <Tag color="blue" style={{ margin: 0, width: 'fit-content' }}>
                  {key}
                </Tag>
                <Tag
                  color={value.required ? 'red' : 'default'}
                  style={{ margin: 0, width: 'fit-content' }}
                >
                  {value.required ? '必填' : '可选'}
                </Tag>
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  {value.description ? (
                    <Text>{value.description}</Text>
                  ) : (
                    <Text type="secondary">未填写说明</Text>
                  )}
                  {value.defaultValue ? (
                    <Text type="secondary">默认值: {value.defaultValue}</Text>
                  ) : null}
                </Space>
              </div>
            ))}
            {group.arrayGroups.map((arrayGroup: any) => (
              <Card
                key={`draft-array-${group.key}-${arrayGroup.arrayPath}`}
                size="small"
                title={`循环变量 · ${arrayGroup.arrayPath}`}
              >
                <Space wrap size={[6, 6]}>
                  {arrayGroup.entries.map(([key, value]: [string, any]) => (
                    <Tooltip key={`draft-array-tag-${key}`} title={value.description || key}>
                      <Tag color="purple" style={{ margin: 0 }}>
                        {value.fieldName || key}
                      </Tag>
                    </Tooltip>
                  ))}
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      ))}
    </Space>
  );
};

export const renderDraftOutputParamSummary = (draft: AiWorkflowDraft) => {
  const entries = Object.entries(draft.workflowDsl.outputParams || {});
  if (entries.length === 0) {
    return <Text type="secondary">未声明输出参数</Text>;
  }
  return (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {entries.map(([key, value]) => (
        <div
          key={`draft-output-${key}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px minmax(0, 1fr)',
            gap: 8,
            alignItems: 'start',
            padding: '8px 10px',
            border: '1px solid var(--bg-secondary)',
            borderRadius: 8,
            background: 'var(--bg-card)',
          }}
        >
          <Tag color="green" style={{ margin: 0, width: 'fit-content' }}>
            {key}
          </Tag>
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {value.description ? (
              <Text>{value.description}</Text>
            ) : (
              <Text type="secondary">未填写说明</Text>
            )}
            {value.sourceStep ? <Text type="secondary">来源步骤: {value.sourceStep}</Text> : null}
          </Space>
        </div>
      ))}
    </Space>
  );
};

export const AiDraftContractCard: React.FC<AiDraftContractCardProps> = ({ draft }) => {
  const inputEntries = Object.entries(draft.workflowDsl.inputParams || {});
  const requiredInputs = inputEntries.filter(([, value]) => value.required);
  const optionalInputs = inputEntries.filter(([, value]) => !value.required);
  const outputEntries = Object.entries(draft.workflowDsl.outputParams || {});
  const stepEntries = draft.workflowDsl.steps || [];

  return (
    <Card size="small" title="契约概览" style={{ marginBottom: 12 }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space wrap>
          <Tag color="blue">步骤数: {stepEntries.length}</Tag>
          <Tag color="cyan">必填参数: {requiredInputs.length}</Tag>
          <Tag color="default">可选参数: {optionalInputs.length}</Tag>
          <Tag color="green">输出字段: {outputEntries.length}</Tag>
        </Space>
        {renderDraftInputParamSummary(draft)}
        {renderDraftOutputParamSummary(draft)}
      </Space>
    </Card>
  );
};

export default AiDraftContractCard;
