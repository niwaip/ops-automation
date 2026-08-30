import React from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Empty,
  Input,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import {
  FileTextOutlined,
  GlobalOutlined,
  PlusOutlined,
  RobotOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { TemplateStep, TemplateStepExecutionPolicy } from '@/api/template';
import {
  getStepCaptureOptions,
  type TemplateProcessingStepEditor,
  type TemplateProcessingStepType,
  type TemplateStepCaptureOption,
} from '../lib/templateWorkflowComposition';

const { Text } = Typography;

interface TemplateStepsTabProps {
  steps: TemplateStep[];
  processingSteps: TemplateProcessingStepEditor[];
  isEditMode: boolean;
  jsonBlockStyle: React.CSSProperties;
  onAddBrowserStep: () => void;
  onAddProcessingStep: (type: TemplateProcessingStepType) => void;
  onDeleteStep: (index: number) => void;
  onDeleteProcessingStep: (index: number) => void;
  onUpdateStepField: (
    index: number,
    key: 'action' | 'step_id' | 'execution_policy',
    value: string
  ) => void;
  onUpdateStepCapture: (index: number, options: TemplateStepCaptureOption[]) => void;
  onUpdateProcessingStep: (index: number, patch: Partial<TemplateProcessingStepEditor>) => void;
}

const STEP_POLICY_OPTIONS: Array<{
  value: TemplateStepExecutionPolicy;
  label: string;
  color: string;
}> = [
  { value: 'auto_execute', label: '自动执行', color: 'green' },
  { value: 'require_confirmation', label: '需确认', color: 'gold' },
  { value: 'require_takeover', label: '人工接管', color: 'orange' },
  { value: 'forbid_in_replay', label: '禁止回放', color: 'red' },
];

const CAPTURE_OPTIONS = [
  { value: 'screenshot', label: '页面截图' },
  { value: 'html', label: 'HTML 源码' },
  { value: 'mainContent', label: '清理正文（提取网页内容）' },
  { value: 'snapshot', label: '页面结构快照' },
] satisfies Array<{ value: TemplateStepCaptureOption; label: string }>;

const PROMPT_PRESETS = [
  {
    label: '提取核心要点',
    prompt:
      '请分析并提取以上网页正文的核心内容要点，去除无关广告与噪点，整理为结构清晰的 Markdown 报告。',
  },
  {
    label: '多网页对比分析',
    prompt:
      '请对比以上多个步骤所提取的网页内容，梳理其异同点与关键变化，输出结构化对比表格与总结。',
  },
  {
    label: '结构化字段提取',
    prompt:
      '请从以上网页正文中提取标题、发布时间、作者、核心观点、关键数据及结论，并以 Markdown 结构化呈现。',
  },
];

const ProcessingStepCard: React.FC<{
  value: TemplateProcessingStepEditor;
  steps: TemplateStep[];
  isEditMode: boolean;
  onDelete: () => void;
  onChange: (patch: Partial<TemplateProcessingStepEditor>) => void;
}> = ({ value, steps, isEditMode, onDelete, onChange }) => {
  const { token } = theme.useToken();
  const currentStepIds = value.sourceStepIds?.length
    ? value.sourceStepIds
    : value.sourceStepId
      ? [value.sourceStepId]
      : [];
  const sourceLabel = currentStepIds.join(', ');
  const isLlm = value.type === 'llm_operation';

  return (
    <Card
      size="small"
      style={{
        marginBottom: 16,
        borderColor: isLlm ? '#9254de' : token.colorBorderSecondary,
        borderRadius: 8,
      }}
      title={
        <Space>
          <RobotOutlined style={{ color: isLlm ? '#722ed1' : '#1677ff', fontSize: 16 }} />
          <Tag color={isLlm ? 'purple' : 'blue'}>{isLlm ? 'LLM 后处理' : '报告工作流'}</Tag>
          <Text strong>{value.id}</Text>
          <Tag color="cyan">来源步骤: {sourceLabel || '未选择'}</Tag>
        </Space>
      }
      extra={
        isEditMode ? (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            删除
          </Button>
        ) : undefined
      }
    >
      <Descriptions column={1} size="small" bordered style={{ borderRadius: 6 }}>
        <Descriptions.Item label="处理步骤 ID">
          {isEditMode ? (
            <Input
              value={value.id}
              onChange={(event) => onChange({ id: event.target.value })}
              style={{ maxWidth: 320 }}
            />
          ) : (
            <Text strong>{value.id}</Text>
          )}
        </Descriptions.Item>

        <Descriptions.Item label="输入来源步骤 (提取网页正文)">
          {isEditMode ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select
                mode="multiple"
                value={currentStepIds}
                placeholder="请选择一个或多个提供网页正文的浏览器步骤"
                style={{ width: '100%', maxWidth: 500 }}
                options={steps.map((step) => ({
                  value: step.step_id,
                  label: `${step.step_id} · ${step.action}${
                    step.capture_profile?.capture.mainContent ? '' : '（已自动开启清理正文）'
                  }`,
                }))}
                onChange={(sourceStepIds) =>
                  onChange({
                    sourceStepIds,
                    sourceStepId: sourceStepIds[0] || '',
                  })
                }
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                💡 支持多选多个步骤，大模型将自动提取并聚合所选所有步骤的网页正文后进行处理。
              </Text>
            </Space>
          ) : (
            <Space size={[0, 4]} wrap>
              {currentStepIds.length > 0 ? (
                currentStepIds.map((stepId) => (
                  <Tag color="blue" key={stepId}>
                    {stepId}
                  </Tag>
                ))
              ) : (
                <Text type="secondary">未指定来源步骤</Text>
              )}
            </Space>
          )}
        </Descriptions.Item>

        {value.type === 'llm_operation' ? (
          <>
            <Descriptions.Item label="处理方式">
              {isEditMode ? (
                <Radio.Group
                  value={value.processingMode}
                  onChange={(event) => {
                    const nextMode = event.target.value;
                    onChange({
                      processingMode: nextMode,
                      customPrompt:
                        nextMode === 'custom' && !value.customPrompt.trim()
                          ? PROMPT_PRESETS[0].prompt
                          : value.customPrompt,
                    });
                  }}
                >
                  <Radio value="custom">自定义提示词 (推荐)</Radio>
                  <Radio value="summary">标准总结</Radio>
                </Radio.Group>
              ) : (
                <Tag color={value.processingMode === 'custom' ? 'purple' : 'default'}>
                  {value.processingMode === 'custom' ? '自定义提示词' : '标准总结'}
                </Tag>
              )}
            </Descriptions.Item>

            {value.processingMode === 'custom' && (
              <Descriptions.Item label="自定义提示词 (Prompt)">
                {isEditMode ? (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Input.TextArea
                      value={value.customPrompt}
                      rows={5}
                      placeholder="请输入对正文的处理提示词，例如：提取核心观点、关键数据与建议，并用 Markdown 输出"
                      onChange={(event) => onChange({ customPrompt: event.target.value })}
                    />
                    <Space size="small" wrap>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        快捷模板：
                      </Text>
                      {PROMPT_PRESETS.map((preset) => (
                        <Button
                          key={preset.label}
                          size="small"
                          type="dashed"
                          onClick={() => onChange({ customPrompt: preset.prompt })}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </Space>
                  </Space>
                ) : (
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      background: token.colorFillAlter,
                      color: token.colorText,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      padding: '8px 12px',
                      borderRadius: 4,
                      lineHeight: 1.6,
                    }}
                  >
                    {value.customPrompt || <Text type="secondary">（无自定义提示词）</Text>}
                  </div>
                )}
              </Descriptions.Item>
            )}
          </>
        ) : (
          <>
            <Descriptions.Item label="工作流 ID">
              {isEditMode ? (
                <Input
                  value={value.targetId}
                  onChange={(event) => onChange({ targetId: event.target.value })}
                  style={{ maxWidth: 320 }}
                />
              ) : (
                value.targetId
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Release">
              {isEditMode ? (
                <Input
                  value={value.targetVersion}
                  onChange={(event) => onChange({ targetVersion: event.target.value })}
                  style={{ maxWidth: 200 }}
                />
              ) : (
                value.targetVersion
              )}
            </Descriptions.Item>
          </>
        )}

        {value.type === 'llm_operation' ? (
          <Descriptions.Item label="Operation 契约">
            <Text code>
              {value.targetId ||
                (value.processingMode === 'custom' ? 'transform_text' : 'summarize_text')}
              @{value.targetVersion || '未冻结'}
            </Text>
          </Descriptions.Item>
        ) : null}

        <Descriptions.Item label="运行条件">
          {isEditMode ? (
            <Select
              value={value.runWhen}
              style={{ width: 260 }}
              options={[
                { value: 'browser_succeeded', label: '仅浏览器流程成功后' },
                { value: 'browser_terminal', label: '浏览器终态后（含失败报告）' },
              ]}
              onChange={(runWhen) => onChange({ runWhen })}
            />
          ) : (
            <Tag color={value.runWhen === 'browser_succeeded' ? 'green' : 'orange'}>
              {value.runWhen === 'browser_succeeded' ? '仅浏览器流程成功后' : '浏览器终态后'}
            </Tag>
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

const TemplateStepsTab: React.FC<TemplateStepsTabProps> = ({
  steps,
  processingSteps,
  isEditMode,
  jsonBlockStyle,
  onAddBrowserStep,
  onAddProcessingStep,
  onDeleteStep,
  onDeleteProcessingStep,
  onUpdateStepField,
  onUpdateStepCapture,
  onUpdateProcessingStep,
}) => {
  const { token } = theme.useToken();

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="流程执行结构：浏览器步骤采集 → LLM 正文处理"
        description="浏览器步骤负责自动化操作和页面正文提取；LLM 处理步骤将自动获取指定浏览器步骤提取到的正文内容，并按自定义提示词进行总结、提取或结构化输出。"
      />

      {isEditMode && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            style={{ background: '#722ed1', borderColor: '#722ed1', borderRadius: 6 }}
            icon={<RobotOutlined />}
            onClick={() => onAddProcessingStep('llm_operation')}
          >
            + 添加 LLM 处理步骤
          </Button>
          <Button
            type="default"
            style={{ borderRadius: 6 }}
            icon={<PlusOutlined />}
            onClick={onAddBrowserStep}
          >
            + 添加浏览器步骤
          </Button>
          <Button
            type="dashed"
            style={{ borderRadius: 6 }}
            icon={<FileTextOutlined />}
            onClick={() => onAddProcessingStep('workflow_skill')}
          >
            + 添加报告工作流
          </Button>
        </div>
      )}

      {steps.length === 0 && processingSteps.length === 0 ? (
        <Empty description="暂无步骤" style={{ margin: '32px 0' }} />
      ) : null}

      {/* 浏览器步骤列表 */}
      {steps.map((step, index) => (
        <Card
          key={`browser-${step.step_id}-${index}`}
          size="small"
          style={{ marginBottom: 16, borderRadius: 8, borderColor: token.colorBorderSecondary }}
          title={
            <Space>
              <GlobalOutlined style={{ color: '#1677ff', fontSize: 16 }} />
              <Tag color="geekblue">步骤 {index + 1} · 浏览器</Tag>
              <Text strong>{step.step_id}</Text>
              {isEditMode ? (
                <Input
                  value={step.action}
                  onChange={(event) => onUpdateStepField(index, 'action', event.target.value)}
                  style={{ width: 280 }}
                  placeholder="步骤动作，例如 navigate / click"
                />
              ) : (
                <Text type="secondary">· {step.action}</Text>
              )}
            </Space>
          }
          extra={
            isEditMode ? (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onDeleteStep(index)}
              >
                删除
              </Button>
            ) : undefined
          }
        >
          <Descriptions column={1} size="small" bordered style={{ borderRadius: 6 }}>
            <Descriptions.Item label="步骤 ID">
              {isEditMode ? (
                <Input
                  value={step.step_id}
                  onChange={(event) => onUpdateStepField(index, 'step_id', event.target.value)}
                  style={{ maxWidth: 320 }}
                />
              ) : (
                <Text code>{step.step_id}</Text>
              )}
            </Descriptions.Item>

            {step.locator && (
              <Descriptions.Item label="选择器">
                <Space>
                  <Tag color="orange">{step.locator.type}</Tag>
                  <Text code>{step.locator.value}</Text>
                </Space>
              </Descriptions.Item>
            )}

            {step.params && Object.keys(step.params).length > 0 && (
              <Descriptions.Item label="参数">
                <pre style={jsonBlockStyle}>{JSON.stringify(step.params, null, 2)}</pre>
              </Descriptions.Item>
            )}

            <Descriptions.Item label="步骤结果采集">
              <Checkbox.Group
                value={getStepCaptureOptions(step)}
                disabled={!isEditMode}
                options={CAPTURE_OPTIONS}
                onChange={(values) =>
                  onUpdateStepCapture(index, values as TemplateStepCaptureOption[])
                }
              />
            </Descriptions.Item>

            <Descriptions.Item label="执行策略">
              {isEditMode ? (
                <Select
                  value={step.execution_policy || 'auto_execute'}
                  style={{ width: 160 }}
                  options={STEP_POLICY_OPTIONS}
                  onChange={(value) => onUpdateStepField(index, 'execution_policy', value)}
                />
              ) : (
                <Tag
                  color={
                    STEP_POLICY_OPTIONS.find(
                      (option) => option.value === (step.execution_policy || 'auto_execute')
                    )?.color || 'default'
                  }
                >
                  {STEP_POLICY_OPTIONS.find(
                    (option) => option.value === (step.execution_policy || 'auto_execute')
                  )?.label || '自动执行'}
                </Tag>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      ))}

      {/* LLM 及后续处理步骤列表 */}
      {processingSteps.map((post, index) => (
        <ProcessingStepCard
          key={`post-${post.id}-${index}`}
          value={post}
          steps={steps}
          isEditMode={isEditMode}
          onDelete={() => onDeleteProcessingStep(index)}
          onChange={(patch) => onUpdateProcessingStep(index, patch)}
        />
      ))}

      {isEditMode && processingSteps.length === 0 && steps.length > 0 ? (
        <Card
          size="small"
          style={{
            border: '1px dashed #9254de',
            background: token.colorFillAlter,
            borderRadius: 8,
            textAlign: 'center',
            padding: '16px 0',
          }}
        >
          <Space direction="vertical" align="center">
            <RobotOutlined style={{ fontSize: 24, color: '#722ed1' }} />
            <Text style={{ color: '#722ed1', fontWeight: 500 }}>
              需要大模型对上述网页的正文进行总结分析或结构化提取？
            </Text>
            <Button
              type="primary"
              style={{ background: '#722ed1', borderColor: '#722ed1', borderRadius: 6 }}
              icon={<RobotOutlined />}
              onClick={() => onAddProcessingStep('llm_operation')}
            >
              立即添加 LLM 处理步骤
            </Button>
          </Space>
        </Card>
      ) : null}
    </>
  );
};

export default TemplateStepsTab;
