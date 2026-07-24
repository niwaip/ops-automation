import React from 'react';
import { Collapse, Form, Select, Input, Typography, Space, Button, Alert, Tag, Divider, message } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { temporalWorkflowApi } from '@/api/temporal';
import type { WorkflowDsl, ActivityDsl } from '@/api/temporal';
import type { HttpRequestStepConfig, StructuredTransformStepConfig } from '../utils/workflowEditHelpers';
import { resolveApiErrorMessage } from '../utils/workflowEditHelpers';
import { WorkflowStepConfigPanel } from './WorkflowStepConfigPanel';
import { WorkflowHttpStepConfigPanel } from './WorkflowHttpStepConfigPanel';
import { WorkflowStructuredTransformStepConfigPanel } from './WorkflowStructuredTransformStepConfigPanel';
import { WorkflowGenericActivityConfigPanel } from './WorkflowGenericActivityConfigPanel';
import type { WorkflowSelectableActivity } from '../hooks/useWorkflowEditState';

const { Panel } = Collapse;
const { Text } = Typography;

type HttpResponseMode = 'body' | 'full' | 'bodyPath' | 'bodyMap';

export interface WorkflowRightConfigPanelsProps {
  selectedStepIndexForConfig: number | null;
  selectedStep: any;
  stepConfigActiveKeys: string[];
  setStepConfigActiveKeys: any;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
  renderStepDurationField: (field: any, label: string, tip: string, options?: any) => React.ReactNode;
  SECTION_CARD_STYLE: React.CSSProperties;
  TWO_COLUMN_GRID_STYLE: React.CSSProperties;
  CONFIG_SECTION_STYLE: React.CSSProperties;
  selectedStepActivity: WorkflowSelectableActivity | undefined;
  isHttpRequestActivity: (activity?: WorkflowSelectableActivity, step?: any) => boolean;
  selectedStepHttpConfig: Record<string, any>;
  updateStepHttpRequestConfig: (stepIndex: number, config: Partial<HttpRequestStepConfig>) => void;
  renderHttpTemplateMapEditor: (field: any, label: string, tip: string) => React.ReactNode;
  previewHttpConfigMutation: any;
  handleOpenHttpAiPanel: () => void;
  realValidationLeafPaths: Array<{ path: string }>;
  applySuggestedResponsePath: (path: string) => void;
  isStructuredTransformActivity: (activity?: WorkflowSelectableActivity, step?: any) => boolean;
  selectedStepStructuredTransformConfig: Record<string, any>;
  updateStepStructuredTransformConfig: (stepIndex: number, config: Partial<StructuredTransformStepConfig>) => void;
  workflowDsl: WorkflowDsl;
  resolveStepActivity: (step?: any) => WorkflowSelectableActivity | undefined;
  collectWorkflowInputParams: () => Record<string, string>;
  selectedStepAiPrompt: string;
  setStructuredTransformSchemaDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  renderStructuredTransformMapEditor: (label: string, tip: string) => React.ReactNode;
  selectedStructuredTransformIssues: string[];
  selectedStructuredTransformSchemaDraft: string;
  updateStructuredTransformSchemaDraft: (stepId: string, rawValue: string) => void;
  selectedStructuredTransformSchemaError: string;
  activityDsl: ActivityDsl;
  getActivitySourceMeta: (step?: any) => { label: string; color: string; ref: string; name: string };
  getStepStructuredTransformConfig: (step?: any, activity?: any) => Record<string, any>;
  getStepHttpRequestConfig: (step?: any, activity?: any) => Record<string, any>;
  shorten: (text?: string, max?: number) => string;
  handleUpdateStep?: (index: number, field: string, value: unknown) => void;
}

export const WorkflowRightConfigPanels: React.FC<WorkflowRightConfigPanelsProps> = ({
  selectedStepIndexForConfig,
  selectedStep,
  stepConfigActiveKeys,
  setStepConfigActiveKeys,
  renderTipLabel,
  renderStepDurationField,
  SECTION_CARD_STYLE,
  TWO_COLUMN_GRID_STYLE,
  CONFIG_SECTION_STYLE,
  selectedStepActivity,
  isHttpRequestActivity,
  selectedStepHttpConfig,
  updateStepHttpRequestConfig,
  renderHttpTemplateMapEditor,
  previewHttpConfigMutation,
  handleOpenHttpAiPanel,
  realValidationLeafPaths,
  applySuggestedResponsePath,
  isStructuredTransformActivity,
  selectedStepStructuredTransformConfig,
  updateStepStructuredTransformConfig,
  workflowDsl,
  resolveStepActivity,
  collectWorkflowInputParams,
  selectedStepAiPrompt,
  setStructuredTransformSchemaDrafts,
  renderStructuredTransformMapEditor,
  selectedStructuredTransformIssues,
  selectedStructuredTransformSchemaDraft,
  updateStructuredTransformSchemaDraft,
  selectedStructuredTransformSchemaError,
  activityDsl,
  getActivitySourceMeta,
  getStepStructuredTransformConfig,
  getStepHttpRequestConfig,
  shorten,
  handleUpdateStep,
}) => {
  return (
    <WorkflowStepConfigPanel
      selectedStepIndexForConfig={selectedStepIndexForConfig}
      selectedStep={selectedStep}
      stepConfigActiveKeys={stepConfigActiveKeys}
      setStepConfigActiveKeys={setStepConfigActiveKeys}
      renderTipLabel={renderTipLabel}
      renderStepDurationField={renderStepDurationField}
      SECTION_CARD_STYLE={SECTION_CARD_STYLE}
      TWO_COLUMN_GRID_STYLE={TWO_COLUMN_GRID_STYLE}
    >
      {!isHttpRequestActivity(selectedStepActivity, selectedStep) &&
        !isStructuredTransformActivity(selectedStepActivity, selectedStep) &&
        selectedStepIndexForConfig !== null &&
        handleUpdateStep && (
          <Panel header="Activity 输入与结果参数" key="generic-activity-input">
            <WorkflowGenericActivityConfigPanel
              selectedStepIndexForConfig={selectedStepIndexForConfig}
              selectedStep={selectedStep}
              selectedStepActivity={selectedStepActivity}
              handleUpdateStep={handleUpdateStep}
              renderTipLabel={renderTipLabel}
              TWO_COLUMN_GRID_STYLE={TWO_COLUMN_GRID_STYLE}
              CONFIG_SECTION_STYLE={CONFIG_SECTION_STYLE}
            />
          </Panel>
        )}

      {isHttpRequestActivity(selectedStepActivity, selectedStep) &&
        selectedStepIndexForConfig !== null && (
          <Panel header="Activity 调用参数" key="activity-input">
            <WorkflowHttpStepConfigPanel
              selectedStepIndexForConfig={selectedStepIndexForConfig}
              selectedStepHttpConfig={selectedStepHttpConfig}
              updateStepHttpRequestConfig={updateStepHttpRequestConfig}
              renderTipLabel={renderTipLabel}
              renderHttpTemplateMapEditor={renderHttpTemplateMapEditor}
              previewHttpConfigMutation={previewHttpConfigMutation}
              handleOpenHttpAiPanel={handleOpenHttpAiPanel}
              TWO_COLUMN_GRID_STYLE={TWO_COLUMN_GRID_STYLE}
              CONFIG_SECTION_STYLE={CONFIG_SECTION_STYLE}
            />
          </Panel>
        )}

      {isHttpRequestActivity(selectedStepActivity, selectedStep) &&
        selectedStepIndexForConfig !== null && (
          <Panel header="步骤内部结果处理" key="result-processing">
            <Form.Item
              label={renderTipLabel(
                '返回值模式',
                '控制 Workflow 最终返回完整响应、body，或 body 某个路径。'
              )}
              style={{ marginBottom: 10 }}
            >
              <Select
                size="small"
                value={selectedStepHttpConfig.responseMode || 'body'}
                onChange={(value) =>
                  updateStepHttpRequestConfig(selectedStepIndexForConfig, {
                    responseMode: value as HttpResponseMode,
                  })
                }
                options={[
                  { label: '仅返回 Body', value: 'body' },
                  { label: '返回完整响应', value: 'full' },
                  { label: '返回 Body 路径', value: 'bodyPath' },
                  { label: '返回多字段对象', value: 'bodyMap' },
                ]}
              />
            </Form.Item>
            {(selectedStepHttpConfig.responseMode || 'body') === 'bodyPath' && (
              <Form.Item
                label={renderTipLabel(
                  'Body 路径',
                  '用点路径提取 body 中的字段，例如 data.current.temp。'
                )}
                style={{ marginBottom: 10 }}
              >
                <Input
                  size="small"
                  value={selectedStepHttpConfig.responseBodyPath || ''}
                  onChange={(e) =>
                    updateStepHttpRequestConfig(selectedStepIndexForConfig, {
                      responseBodyPath: e.target.value,
                    })
                  }
                  placeholder="例如：data.current.temp"
                />
              </Form.Item>
            )}
            {(selectedStepHttpConfig.responseMode || 'body') === 'bodyMap' && (
              <div style={{ ...CONFIG_SECTION_STYLE, marginBottom: 10 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  多字段返回映射
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  运行时会按这里的字段名和路径，从 body 中提取多个字段并返回结构化对象。
                </Text>
                {renderHttpTemplateMapEditor(
                  'responseFieldMappings',
                  '字段映射',
                  '左侧为返回字段名，右侧为 body 相对路径，例如 weatherText -> current_condition.0.lang_zh.0.value。'
                )}
              </div>
            )}
            {realValidationLeafPaths.length > 0 && (
              <Form.Item
                label={renderTipLabel(
                  '结果路径建议',
                  '基于最近一次真实验证结果自动展开的可选字段，可直接点击填入 Body 路径。'
                )}
                style={{ marginBottom: 0 }}
              >
                <div
                  style={{
                    border: '1px dashed var(--bg-secondary)',
                    padding: 8,
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                    maxHeight: 180,
                    overflow: 'auto',
                  }}
                >
                  <Space wrap size={[6, 6]}>
                    {realValidationLeafPaths.slice(0, 40).map((item) => (
                      <Button
                        key={item.path}
                        size="small"
                        onClick={() => applySuggestedResponsePath(item.path)}
                      >
                        {item.path}
                      </Button>
                    ))}
                  </Space>
                </div>
              </Form.Item>
            )}
          </Panel>
        )}

      {isStructuredTransformActivity(selectedStepActivity, selectedStep) &&
        selectedStepIndexForConfig !== null && (
          <Panel header="结构化转换配置" key="structured-transform">
            <WorkflowStructuredTransformStepConfigPanel
              selectedStepIndexForConfig={selectedStepIndexForConfig}
              selectedStepActivity={selectedStepActivity}
              selectedStep={selectedStep}
              selectedStepStructuredTransformConfig={selectedStepStructuredTransformConfig}
              updateStepStructuredTransformConfig={updateStepStructuredTransformConfig}
              renderTipLabel={renderTipLabel}
              TWO_COLUMN_GRID_STYLE={TWO_COLUMN_GRID_STYLE}
            />
            {(() => {
              const isAiStructuredTransform =
                selectedStepActivity?.fn === 'aiStructuredTransform' ||
                selectedStep?.activityRef === 'builtin:aiStructuredTransform' ||
                selectedStep?.activityName === 'aiStructuredTransform';
              return (
                <>
                  <Space size={8} style={{ margin: '4px 0 12px' }}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<RobotOutlined />}
                      onClick={() => {
                        void (async () => {
                          if (selectedStepIndexForConfig === null) return;
                          const prevIndex = selectedStepIndexForConfig - 1;
                          if (prevIndex < 0 || !workflowDsl.steps[prevIndex]) {
                            void message.warning('请将结构化转换步骤放在一个 HTTP 步骤之后');
                            return;
                          }
                          const prevStep = workflowDsl.steps[prevIndex];
                          const prevActivity = resolveStepActivity(prevStep);
                          if (!isHttpRequestActivity(prevActivity, prevStep)) {
                            void message.warning('上一步不是 HTTP 请求，无法自动生成结构化配置');
                            return;
                          }
                          try {
                            const httpConfig = getStepHttpRequestConfig(prevStep, prevActivity);
                            const sampleParams = collectWorkflowInputParams();
                            const preview = await temporalWorkflowApi.previewHttpRequestConfig(
                              httpConfig,
                              sampleParams
                            );
                            if (!preview.success || !preview.previewResponse) {
                              void message.error(preview.error || '获取上一步返回样本失败');
                              return;
                            }
                            const userGoal =
                              selectedStepAiPrompt ||
                              '请将今天的天气信息提炼为结构化 JSON，包含天气描述与摄氏温度';
                            const gen =
                              await temporalWorkflowApi.generateStructuredTransformConfig(
                                preview.previewResponse.body ?? preview.previewResponse,
                                userGoal,
                                selectedStepStructuredTransformConfig
                              );
                            if (!gen.success || !gen.config) {
                              void message.error(gen.error || 'AI 生成结构化配置失败');
                              return;
                            }
                            const generatedConfig = gen.config;
                            updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                              contentType:
                                generatedConfig.contentType ||
                                selectedStepStructuredTransformConfig.contentType ||
                                'json',
                              contentTemplate:
                                generatedConfig.contentTemplate ||
                                selectedStepStructuredTransformConfig.contentTemplate ||
                                '{content}',
                              instructionTemplate:
                                generatedConfig.instructionTemplate ||
                                selectedStepStructuredTransformConfig.instructionTemplate ||
                                '',
                              outputMode:
                                generatedConfig.outputMode ||
                                selectedStepStructuredTransformConfig.outputMode ||
                                'json',
                              outputSchema:
                                generatedConfig.outputSchema ||
                                selectedStepStructuredTransformConfig.outputSchema ||
                                {},
                              contextTemplate:
                                generatedConfig.contextTemplate ||
                                selectedStepStructuredTransformConfig.contextTemplate ||
                                '',
                              fieldMappings:
                                generatedConfig.fieldMappings ||
                                selectedStepStructuredTransformConfig.fieldMappings ||
                                {},
                              textTemplate:
                                generatedConfig.textTemplate ||
                                selectedStepStructuredTransformConfig.textTemplate ||
                                '',
                            });
                            if (selectedStep?.id) {
                              setStructuredTransformSchemaDrafts((prev) => ({
                                ...prev,
                                [selectedStep.id]: JSON.stringify(
                                  generatedConfig.outputSchema || {},
                                  null,
                                  2
                                ),
                              }));
                            }
                            void message.success('已生成结构化转换配置');
                          } catch (error: unknown) {
                            void message.error(
                              resolveApiErrorMessage(error, 'AI 生成结构化配置失败')
                            );
                          }
                        })();
                      }}
                    >
                      AI 生成配置
                    </Button>
                  </Space>

                  {!isAiStructuredTransform &&
                    renderStructuredTransformMapEditor(
                      '字段映射',
                      '固定规则模式下，左侧是输出字段名，右侧是来源路径或变量名，例如 weatherText -> current.weather.text。'
                    )}

                  {!isAiStructuredTransform &&
                    selectedStructuredTransformIssues.length > 0 && (
                      <Alert
                        style={{ marginBottom: 10 }}
                        type="warning"
                        showIcon
                        message="固定规则转换配置未对齐"
                        description={
                          <div>
                            {selectedStructuredTransformIssues.map((item, index) => (
                              <div key={`structured-transform-issue-${index}`}>{item}</div>
                            ))}
                          </div>
                        }
                      />
                    )}

                  {!isAiStructuredTransform &&
                    (selectedStepStructuredTransformConfig.outputMode || 'json') === 'text' && (
                      <Form.Item
                        label={renderTipLabel(
                          '文本模版',
                          '固定规则文本输出时，优先使用模版拼接最终文本，可引用 fieldMappings 或输入字段。'
                        )}
                        style={{ marginBottom: 10 }}
                      >
                        <Input.TextArea
                          rows={4}
                          value={selectedStepStructuredTransformConfig.textTemplate || ''}
                          onChange={(e) =>
                            updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                              textTemplate: e.target.value,
                            })
                          }
                          placeholder={'例如：Weather: {weatherText}\nTemp: {temperatureC} C'}
                        />
                      </Form.Item>
                    )}

                  <Form.Item
                    label={renderTipLabel(
                      '输出规则',
                      '建议填写 JSON 对象结构，描述希望返回哪些字段及其含义。'
                    )}
                    style={{ marginBottom: 10 }}
                  >
                    <Input.TextArea
                      rows={6}
                      value={selectedStructuredTransformSchemaDraft}
                      onChange={(e) => {
                        if (selectedStep?.id) {
                          updateStructuredTransformSchemaDraft(selectedStep.id, e.target.value);
                        }
                      }}
                      placeholder={'例如：{\n  "title": "页面标题",\n  "summary": "摘要"\n}'}
                      status={
                        selectedStructuredTransformSchemaError ? 'error' : undefined
                      }
                    />
                    {selectedStructuredTransformSchemaError ? (
                      <Text type="danger">{selectedStructuredTransformSchemaError}</Text>
                    ) : (
                      <Text type="secondary">
                        输出规则会作为结构化转换器的目标结构提示。
                      </Text>
                    )}
                  </Form.Item>

                  <Form.Item
                    label={renderTipLabel(
                      '补充上下文',
                      '可选，补充业务背景、字段含义、枚举说明等上下文。'
                    )}
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea
                      rows={3}
                      value={selectedStepStructuredTransformConfig.contextTemplate || ''}
                      onChange={(e) =>
                        updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                          contextTemplate: e.target.value,
                        })
                      }
                      placeholder="例如：status 字段必须映射为 draft/published/archived 三种值。"
                    />
                  </Form.Item>
                </>
              );
            })()}
          </Panel>
        )}

      <Divider style={{ margin: '16px 0' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          工作单元 DSL 摘要
        </Text>
      </Divider>
      {activityDsl.activities.length === 0 ? (
        <Alert message="从左侧添加工作单元" type="info" showIcon />
      ) : (
        <div style={{ maxHeight: 200, overflow: 'auto' }}>
          {activityDsl.activities.map((activity: any, index: number) => {
            const matchedStep = workflowDsl.steps.find(
              (step: any) =>
                step.type === 'activity' &&
                (step.activityName === activity.name ||
                  step.activityName === activity.fn ||
                  resolveStepActivity(step)?.fn === activity.fn)
            );
            const sourceMeta = getActivitySourceMeta(matchedStep);
            return (
              <Space key={`${activity.name}-${index}`} size={4} wrap style={{ margin: 2 }}>
                <Tag color="blue" style={{ margin: 0 }}>
                  {activity.name}
                </Tag>
                <Tag color={sourceMeta.color} style={{ margin: 0 }}>
                  {sourceMeta.label}
                </Tag>
                {matchedStep &&
                isStructuredTransformActivity(
                  resolveStepActivity(matchedStep),
                  matchedStep
                ) ? (
                  <Tag color="purple" style={{ margin: 0 }}>
                    {shorten(
                      getStepStructuredTransformConfig(
                        matchedStep,
                        resolveStepActivity(matchedStep)
                      ).instructionTemplate || '结构化转换',
                      18
                    )}
                  </Tag>
                ) : null}
              </Space>
            );
          })}
        </div>
      )}
    </WorkflowStepConfigPanel>
  );
};
