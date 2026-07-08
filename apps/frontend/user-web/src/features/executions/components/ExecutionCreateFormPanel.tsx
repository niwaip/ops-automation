import React from 'react';
import { Button, Empty, Form, Radio, Select, Space, Spin, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import ExecutionCreatePanelCard from '@/features/executions/components/ExecutionCreatePanelCard';
import {
  executionCreateFormCardBodyStyle,
  executionCreateModePanelStyle,
  executionCreateModeRowStyle,
  executionCreateScheduleRulePillStyle,
  executionCreateSkillSelectorStyle,
} from '@/features/executions/components/executionCreateStyles';
import ExecutionCreateSchemaFieldsCard from '@/features/executions/components/ExecutionCreateSchemaFieldsCard';
import ExecutionCreateScheduleSettingsCard from '@/features/executions/components/ExecutionCreateScheduleSettingsCard';
import type { ExecutionCreateFormValues, SchedulePattern, SchemaField } from '@/features/executions/lib/executionCreate';

const { Text } = Typography;

interface ExecutionCreateFormPanelProps {
  form: FormInstance<ExecutionCreateFormValues>;
  initialSkillId?: string;
  isSkillOptionsLoading: boolean;
  isEmptySkillOptions: boolean;
  skillOptions: Array<{ skillId: string; skillName: string }>;
  selectedSkillId?: string;
  schemaFields: SchemaField[];
  requiredFieldCount: number;
  optionalFieldCount: number;
  selectedSkillLoading: boolean;
  loadingIndicator: React.ReactElement;
  onOpenAiModal: () => void;
  onResetDefaults: () => void;
  executionMode: ExecutionCreateFormValues['executionMode'];
  schedulePattern: SchedulePattern;
  scheduleRuleSummary: string;
  submitAction: {
    label: string;
    loading: boolean;
    disabled: boolean;
  };
  onSubmit: (values: ExecutionCreateFormValues) => void;
  onResetForm: () => void;
  onSwitchToScheduleMode: () => void;
  onCancel: () => void;
}

const ExecutionCreateFormPanel: React.FC<ExecutionCreateFormPanelProps> = ({
  form,
  initialSkillId,
  isSkillOptionsLoading,
  isEmptySkillOptions,
  skillOptions,
  selectedSkillId,
  schemaFields,
  requiredFieldCount,
  optionalFieldCount,
  selectedSkillLoading,
  loadingIndicator,
  onOpenAiModal,
  onResetDefaults,
  executionMode,
  schedulePattern,
  scheduleRuleSummary,
  submitAction,
  onSubmit,
  onResetForm,
  onSwitchToScheduleMode,
  onCancel,
}) => {
  const skillSelectOptions: React.ComponentProps<typeof Select>['options'] = skillOptions.map(
    (skill) => ({
      value: skill.skillId,
      label: (
        <Space size={8}>
          <span>{skill.skillName}</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 8px',
              height: 22,
              borderRadius: 999,
              background: 'rgba(82, 196, 26, 0.12)',
              color: '#389e0d',
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            published
          </span>
        </Space>
      ),
      'data-label': skill.skillName,
      'data-search': `${skill.skillName} ${skill.skillId}`,
    })
  );

  return (
    <ExecutionCreatePanelCard
      className="execution-create-form-card"
      styles={{ body: executionCreateFormCardBodyStyle }}
    >
      {isSkillOptionsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spin tip="正在加载已发布技能..." />
        </div>
      ) : isEmptySkillOptions ? (
        <Empty description="当前没有已发布技能可发起执行" />
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            skillId: initialSkillId,
            executionMode: 'immediate',
            input: {},
            timezone: 'Asia/Shanghai',
          }}
          onFinish={onSubmit}
        >
          <div style={executionCreateSkillSelectorStyle}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Form.Item
                name="skillId"
                label="技能"
                rules={[{ required: true, message: '请选择一个技能' }]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  size="large"
                  showSearch
                  placeholder="请选择已发布技能"
                  optionFilterProp="data-search"
                  optionLabelProp="data-label"
                  options={skillSelectOptions}
                />
              </Form.Item>
            </Space>
          </div>

          <ExecutionCreateSchemaFieldsCard
            selectedSkillId={selectedSkillId}
            schemaFields={schemaFields}
            requiredFieldCount={requiredFieldCount}
            optionalFieldCount={optionalFieldCount}
            skillLoading={selectedSkillLoading}
            loadingIndicator={loadingIndicator}
            onOpenAiModal={onOpenAiModal}
            onResetDefaults={onResetDefaults}
          />

          <Form.Item name="executionMode" label="执行方式">
            <div style={executionCreateModePanelStyle}>
              <div style={executionCreateModeRowStyle}>
                <Space wrap size={12} style={{ flex: 1 }}>
                  <Radio.Group optionType="button" buttonStyle="solid">
                    <Radio.Button value="immediate">立即执行</Radio.Button>
                    <Radio.Button value="schedule">定时执行</Radio.Button>
                  </Radio.Group>
                  {executionMode === 'schedule' ? (
                    <div style={executionCreateScheduleRulePillStyle}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        规则
                      </Text>
                      <Text strong style={{ fontSize: 12 }}>{scheduleRuleSummary}</Text>
                    </div>
                  ) : null}
                </Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  htmlType="submit"
                  loading={submitAction.loading}
                  disabled={submitAction.disabled}
                >
                  {submitAction.label}
                </Button>
              </div>
            </div>
          </Form.Item>

          {executionMode === 'schedule' ? (
            <ExecutionCreateScheduleSettingsCard schedulePattern={schedulePattern} />
          ) : null}

          <Space>
            <Button onClick={onResetForm}>重置</Button>
            {executionMode !== 'schedule' && selectedSkillId ? (
              <Button onClick={onSwitchToScheduleMode}>去配置定时任务</Button>
            ) : null}
            <Button onClick={onCancel}>取消</Button>
          </Space>
        </Form>
      )}
    </ExecutionCreatePanelCard>
  );
};

export default ExecutionCreateFormPanel;
