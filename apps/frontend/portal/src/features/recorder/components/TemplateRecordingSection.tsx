import React from 'react';
import {
  Button,
  Collapse,
  Divider,
  List,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  BugOutlined,
  CodeOutlined,
  DeleteOutlined,
  FileAddOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { TemplateStepExecutionPolicy } from '@/api/template';
import type { TemplateStep } from './AIControls.types';
import { TEMPLATE_STEP_POLICY_OPTIONS } from './AIControls.utils';

const { Text } = Typography;

export interface TemplateRecordingSectionProps {
  isTemplatePanelExpanded: boolean;
  setIsTemplatePanelExpanded: (expanded: boolean) => void;
  templateSteps: TemplateStep[];
  savedTemplateId: string | null;
  isDarkTheme: boolean;
  historyLength: number;
  testLoading: boolean;
  resetLoading: boolean;
  onAutoExtract: () => void;
  onOpenBranchGate: (stepId?: string) => void;
  onCompile: () => void;
  onClear: () => void;
  onTest: () => void | Promise<void>;
  onResetWorkers: () => void | Promise<void>;
  onRemoveStep: (stepId: string) => void;
  onUpdatePolicy: (stepId: string, policy: TemplateStepExecutionPolicy) => void;
}

export const TemplateRecordingSection: React.FC<TemplateRecordingSectionProps> = ({
  isTemplatePanelExpanded,
  setIsTemplatePanelExpanded,
  templateSteps,
  savedTemplateId,
  isDarkTheme,
  historyLength,
  testLoading,
  resetLoading,
  onAutoExtract,
  onOpenBranchGate,
  onCompile,
  onClear,
  onTest,
  onResetWorkers,
  onRemoveStep,
  onUpdatePolicy,
}) => {
  return (
    <>
      <Divider style={{ margin: '12px 0' }} />
      <Collapse
        size="small"
        activeKey={isTemplatePanelExpanded ? ['template'] : []}
        onChange={(keys) =>
          setIsTemplatePanelExpanded(
            Array.isArray(keys) ? keys.includes('template') : keys === 'template'
          )
        }
        items={[
          {
            key: 'template',
            label: (
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <Text strong style={{ fontSize: 13 }}>
                    <FileAddOutlined style={{ marginRight: 4 }} />
                    模版录制
                  </Text>
                  <Tag color={templateSteps.length > 0 ? 'processing' : 'default'}>
                    {templateSteps.length} 步
                  </Tag>
                  {savedTemplateId && <Tag color="success">已保存</Tag>}
                </Space>
              </Space>
            ),
            children: (
              <div
                style={{
                  background: isDarkTheme ? 'var(--bg-secondary)' : '#f6f8fa',
                  borderRadius: 8,
                  padding: 12,
                  border: isDarkTheme ? '1px solid #334155' : 'none',
                }}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <Text strong style={{ fontSize: 13 }}>
                      <FileAddOutlined style={{ marginRight: 4 }} />
                      模版录制
                    </Text>
                  </Space>
                  <Space>
                    <Button
                      size="small"
                      icon={<RobotOutlined />}
                      onClick={onAutoExtract}
                      disabled={historyLength === 0}
                      title="从历史记录中自动提取确定性命令"
                    >
                      自动提取
                    </Button>
                    <Button
                      size="small"
                      icon={<FileSearchOutlined />}
                      onClick={() => onOpenBranchGate()}
                    >
                      条件分歧
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CodeOutlined />}
                      onClick={onCompile}
                      disabled={templateSteps.length === 0}
                    >
                      编译模版
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={onClear}
                      disabled={templateSteps.length === 0}
                    >
                      清空
                    </Button>
                  </Space>
                </Space>

                {savedTemplateId && (
                  <Space style={{ marginTop: 12, width: '100%' }}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<BugOutlined />}
                      onClick={() => {
                        void onTest();
                      }}
                      loading={testLoading}
                    >
                      测试模版
                    </Button>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        void onResetWorkers();
                      }}
                      loading={resetLoading}
                    >
                      重置 Worker
                    </Button>
                  </Space>
                )}

                {templateSteps.length > 0 && (
                  <List
                    size="small"
                    style={{
                      marginTop: 12,
                      background: isDarkTheme ? 'var(--bg-primary)' : '#fff',
                      borderRadius: 4,
                      border: isDarkTheme ? '1px solid #334155' : '1px solid #e8e8e8',
                    }}
                    dataSource={templateSteps}
                    renderItem={(step, index) => (
                      <List.Item
                        actions={[
                          <Button
                            key="branch"
                            type="text"
                            size="small"
                            icon={<FileSearchOutlined />}
                            onClick={() => onOpenBranchGate(step.id)}
                            title="在当前步骤后插入条件分歧"
                          />,
                          <Button
                            key="remove"
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => onRemoveStep(step.id)}
                          />,
                        ]}
                      >
                        <Space
                          style={{ width: '100%', justifyContent: 'space-between' }}
                          align="start"
                        >
                          <Space wrap>
                            <Tag color="blue">{index + 1}</Tag>
                            <Tag>{step.tool}</Tag>
                            {step.execution_policy && (
                              <Tag
                                color={
                                  TEMPLATE_STEP_POLICY_OPTIONS.find(
                                    (option) => option.value === step.execution_policy
                                  )?.color || 'default'
                                }
                              >
                                {TEMPLATE_STEP_POLICY_OPTIONS.find(
                                  (option) => option.value === step.execution_policy
                                )?.label || step.execution_policy}
                              </Tag>
                            )}
                            <Text style={{ fontSize: 11 }}>{step.description}</Text>
                          </Space>
                          <Select<TemplateStepExecutionPolicy>
                            size="small"
                            value={step.execution_policy || 'auto_execute'}
                            style={{ width: 132 }}
                            options={TEMPLATE_STEP_POLICY_OPTIONS.map((option) => ({
                              value: option.value,
                              label: option.label,
                              title: option.description,
                            }))}
                            onChange={(value) => onUpdatePolicy(step.id, value)}
                          />
                        </Space>
                      </List.Item>
                    )}
                  />
                )}

                {templateSteps.length === 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      textAlign: 'center',
                      color: isDarkTheme ? '#64748b' : '#999',
                      fontSize: 12,
                    }}
                  >
                    执行命令后，点击"添加到模版"按钮将确定性命令添加到模版中
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
};
