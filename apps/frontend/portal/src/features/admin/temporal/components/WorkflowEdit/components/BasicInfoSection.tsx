import React, { useState } from 'react';
import { Card, Alert, Space, Tag, Typography, Form, Input, Button, FormInstance } from 'antd';
import { ThunderboltOutlined, ExperimentOutlined } from '@ant-design/icons';
import { WorkflowDescriptionOptimizerModal } from './WorkflowDescriptionOptimizerModal';
import { WorkflowPlannerTestModal } from './WorkflowPlannerTestModal';

const { Text } = Typography;

export interface BasicInfoSectionProps {
  form?: FormInstance;
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
  form,
  isGeneratedCodeStale,
  currentSourceContext,
  currentSourceTemplate,
  workflowDsl,
  setWorkflowDsl,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
}) => {
  const [optimizerModalVisible, setOptimizerModalVisible] = useState(false);
  const [plannerTestModalVisible, setPlannerTestModalVisible] = useState(false);

  const getWorkflowName = () => form?.getFieldValue('name') || workflowDsl.workflowClassName || '';
  const getCurrentDescription = () => form?.getFieldValue('description') || '';

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

      <Form.Item
        name="description"
        label={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: 12,
            }}
          >
            <span>描述</span>
            <Space size={8}>
              <Button
                type="link"
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => setOptimizerModalVisible(true)}
                style={{ padding: 0, height: 'auto', fontSize: 13 }}
              >
                AI 优化描述
              </Button>
              <Button
                type="link"
                size="small"
                icon={<ExperimentOutlined />}
                onClick={() => setPlannerTestModalVisible(true)}
                style={{ padding: 0, height: 'auto', fontSize: 13, color: '#52c41a' }}
              >
                测试规划器匹配
              </Button>
            </Space>
          </div>
        }
        style={{ marginBottom: 0 }}
      >
        <Input.TextArea rows={2} placeholder="工作流描述（例如：从指定网页提取正文并输出结构化文章列表）" />
      </Form.Item>

      <WorkflowDescriptionOptimizerModal
        visible={optimizerModalVisible}
        onClose={() => setOptimizerModalVisible(false)}
        workflowName={getWorkflowName()}
        currentDescription={getCurrentDescription()}
        inputParams={workflowDsl.inputParams}
        outputParams={workflowDsl.outputParams}
        steps={workflowDsl.steps}
        onApply={(optimized) => {
          if (form) {
            form.setFieldsValue({ description: optimized });
          }
        }}
      />

      <WorkflowPlannerTestModal
        visible={plannerTestModalVisible}
        onClose={() => setPlannerTestModalVisible(false)}
        workflowName={getWorkflowName()}
        description={getCurrentDescription()}
        inputParams={workflowDsl.inputParams}
        outputParams={workflowDsl.outputParams}
      />
    </Card>
  );
};
