import React from 'react';
import { Card, Alert, Space, Tag, Typography, Form, Input } from 'antd';

const { Text } = Typography;

export interface BasicInfoSectionProps {
  isGeneratedCodeStale: boolean;
  currentSourceContext: any;
  currentSourceTemplate: any;
  workflowDsl: any;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<any>>;
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
  renderTipLabel: (title: string, tip: string) => React.ReactNode;
}

export const BasicInfoSection: React.FC<BasicInfoSectionProps> = ({
  isGeneratedCodeStale,
  currentSourceContext,
  currentSourceTemplate,
  workflowDsl,
  setWorkflowDsl,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
}) => {
  return (
    <Card
      title="基础信息"
      size="small"
      style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}
      styles={{ body: SECTION_CARD_BODY_STYLE }}
    >
      {isGeneratedCodeStale && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="工作流配置已变更，旧代码已失效"
          description="你刚刚修改了步骤、参数或配置，系统已清空旧的生成代码。请重新点击“生成并保存代码”后再做端到端验证。"
        />
      )}
      {currentSourceContext && (
        <Alert
          type={currentSourceContext.sourceType === 'template' ? 'info' : 'success'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            currentSourceContext.sourceType === 'template'
              ? '当前工作流来自模版'
              : '当前工作流包含 AI 草稿来源信息'
          }
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap size={[8, 8]}>
                {currentSourceContext.sourceType && (
                  <Tag color={currentSourceContext.sourceType === 'template' ? 'purple' : 'geekblue'}>
                    来源: {currentSourceContext.sourceType}
                  </Tag>
                )}
                {currentSourceContext.generatedAt && (
                  <Tag>生成时间: {currentSourceContext.generatedAt}</Tag>
                )}
                {currentSourceContext.referenceUrl ? <Tag color="blue">参考 URL</Tag> : null}
              </Space>
              {currentSourceContext.referenceUrl && (
                <Text copyable>{currentSourceContext.referenceUrl}</Text>
              )}
              {currentSourceContext.userDescription && (
                <Text>{currentSourceContext.userDescription}</Text>
              )}
            </Space>
          }
        />
      )}
      {currentSourceTemplate && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="当前工作流来自模版"
          description={
            <Space wrap size={[8, 8]}>
              <Tag color="purple">模版 ID: {currentSourceTemplate.templateId || '无'}</Tag>
              {currentSourceTemplate.skillId ? (
                <Tag color="geekblue">内置 Skill: {currentSourceTemplate.skillId}</Tag>
              ) : (
                <Tag>内置 Skill: 无</Tag>
              )}
            </Space>
          }
        />
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>工作流名称</Text>
          <Form.Item
            name="name"
            rules={[{ required: true, message: '请输入工作流名称' }]}
            style={{ marginBottom: 0, flex: 1 }}
          >
            <Input size="small" placeholder="例如：天气查询流程" />
          </Form.Item>
        </div>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>函数名</Text>
          <Input
            size="small"
            value={workflowDsl.workflowClassName || ''}
            placeholder="例如：WeatherQueryWorkflow"
            onChange={(e) => {
              const nextName = e.target.value;
              setWorkflowDsl({
                ...workflowDsl,
                workflowClassName: nextName,
                workflowDefnName: workflowDsl.workflowDefnName || nextName,
              });
            }}
          />
        </div>
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>队列名</Text>
          <Form.Item
            name="taskQueue"
            rules={[{ required: true, message: '请输入Task Queue' }]}
            style={{ marginBottom: 0, flex: 1 }}
            tooltip="Temporal Worker 监听的队列名称，用于路由当前工作流任务。"
          >
            <Input size="small" placeholder="例如：SKILL_TASK_QUEUE" />
          </Form.Item>
        </div>
      </div>
      <Form.Item name="description" label="描述" style={{ marginBottom: 0 }}>
        <Input.TextArea rows={2} placeholder="工作流描述" />
      </Form.Item>
    </Card>
  );
};
