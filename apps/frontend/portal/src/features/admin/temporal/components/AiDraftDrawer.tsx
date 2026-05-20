import React, { useMemo, useState } from 'react';
import { Drawer, Space, Alert, Button, Tag, Typography, Input, Tooltip, Card, message, Popconfirm, Modal, Collapse } from 'antd';
import { ThunderboltOutlined, SendOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  temporalWorkflowApi, AiWorkflowDraft, AiWorkflowDraftSession, AiWorkflowDraftSessionMessage,
  TemplateWorkflowDraft
} from '@/api/temporal';
import { HTTP_REQUEST_STEP_CONFIG_KEY, STRUCTURED_TRANSFORM_STEP_CONFIG_KEY } from '../pages/TemporalPage.constants';
import {
  groupWorkflowInputParams,
  collectTemplateVariablesFromValue, asPlainRecord, beautifyText
} from '../pages/TemporalPage.utils';

const { Text } = Typography;
const { Panel } = Collapse;

export interface AiDraftDrawerProps {
  visible: boolean;
  onClose: () => void;
  onApplyDraft: (draft: Pick<TemplateWorkflowDraft, 'name' | 'description' | 'taskQueue' | 'workflowDsl' | 'activityDsl'>) => void;
}

export const AiDraftDrawer: React.FC<AiDraftDrawerProps> = ({ visible, onClose, onApplyDraft }) => {
  const queryClient = useQueryClient();

  const [aiDraftSessionId, setAiDraftSessionId] = useState<string | null>(null);
  const [aiDraftMessages, setAiDraftMessages] = useState<AiWorkflowDraftSessionMessage[]>([]);
  const [aiDraftInput, setAiDraftInput] = useState('');
  const [currentAiDraft, setCurrentAiDraft] = useState<AiWorkflowDraft | null>(null);
  const [aiDraftDescription, setAiDraftDescription] = useState('');
  const [aiDraftReferenceUrl, setAiDraftReferenceUrl] = useState('');
  const [applyDraftConfirmVisible, setApplyDraftConfirmVisible] = useState(false);

  const shorten = (text?: string, max = 24) => {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };

  const aiDraftSessionsQuery = useQuery(
    ['temporal-draft-sessions'],
    () => temporalWorkflowApi.listAiDraftSessions(),
    { enabled: visible },
  );

  const syncAiDraftSessionState = (session: AiWorkflowDraftSession) => {
    setAiDraftSessionId(session.sessionId);
    setAiDraftMessages(session.messages || []);
    setCurrentAiDraft(session.currentDraft || null);
  };

  const generateAiDraftMutation = useMutation(
    (payload: { description?: string; referenceUrl?: string }) => temporalWorkflowApi.createAiDraftSession(payload),
    {
      onSuccess: (session: AiWorkflowDraftSession) => {
        syncAiDraftSessionState(session);
        const draft = session.currentDraft;
        if (draft?.warnings?.length) {
          message.warning(draft.warnings[0]);
        }
      },
      onError: (error: any) => {
        message.error('生成 AI 工作流草稿失败: ' + (error.message || '未知错误'));
      },
    },
  );

  const refineAiDraftMutation = useMutation(
    (payload: { sessionId: string; userPrompt: string }) =>
      temporalWorkflowApi.refineAiDraftSession(payload.sessionId, payload.userPrompt),
    {
      onSuccess: (session: AiWorkflowDraftSession) => {
        syncAiDraftSessionState(session);
        const draft = session.currentDraft;
        if (draft?.warnings?.length) {
          message.warning(draft.warnings[0]);
        }
      },
      onError: (error: any) => {
        message.error('改进 AI 工作流草稿失败: ' + (error.message || '未知错误'));
      },
    },
  );

  const deleteAiDraftSessionMutation = useMutation(
    (sessionId: string) => temporalWorkflowApi.deleteAiDraftSession(sessionId),
    {
      onSuccess: (_, sessionId) => {
        if (aiDraftSessionId === sessionId) {
          setAiDraftSessionId(null);
          setAiDraftMessages([]);
          setCurrentAiDraft(null);
        }
        queryClient.invalidateQueries(['temporal-draft-sessions']);
        message.success('草稿会话已删除');
      },
      onError: (error: any) => {
        message.error('删除草稿会话失败: ' + (error.message || '未知错误'));
      },
    },
  );

  const handleGenerateAiDraft = () => {
    if (!aiDraftDescription.trim() && !aiDraftReferenceUrl.trim()) {
      message.warning('请至少输入工作流说明或参考 URL');
      return;
    }
    generateAiDraftMutation.mutate({
      description: aiDraftDescription.trim(),
      referenceUrl: aiDraftReferenceUrl.trim(),
    });
  };

  const handleRefineAiDraft = () => {
    if (!aiDraftInput.trim() || !aiDraftSessionId) {
      return;
    }
    const userPrompt = aiDraftInput.trim();
    setAiDraftInput('');
    refineAiDraftMutation.mutate({
      sessionId: aiDraftSessionId,
      userPrompt,
    });
  };

  const handleResumeAiDraftSession = async (sessionId: string) => {
    try {
      const session = await temporalWorkflowApi.getAiDraftSession(sessionId);
      syncAiDraftSessionState(session);
      message.success('已恢复草稿会话');
    } catch (error: any) {
      message.error('恢复草稿会话失败: ' + (error.message || '未知错误'));
    }
  };

  const handleDeleteAiDraftSession = (sessionId: string) => {
    deleteAiDraftSessionMutation.mutate(sessionId);
  };

  const renderDraftInputParamSummary = (draft: AiWorkflowDraft) => {
    const groups = groupWorkflowInputParams(draft.workflowDsl.inputParams);
    if (groups.length === 0) {
      return <Text type="secondary">未声明输入参数</Text>;
    }
    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {groups.map((group) => (
          <Card key={`draft-group-${group.key}`} size="small" title={group.label}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {group.scalarEntries.map(([key, value]) => (
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
                  <Tag color="blue" style={{ margin: 0, width: 'fit-content' }}>{key}</Tag>
                  <Tag color={value.required ? 'red' : 'default'} style={{ margin: 0, width: 'fit-content' }}>
                    {value.required ? '必填' : '可选'}
                  </Tag>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    {value.description ? <Text>{value.description}</Text> : <Text type="secondary">未填写说明</Text>}
                    {value.defaultValue ? <Text type="secondary">默认值: {value.defaultValue}</Text> : null}
                  </Space>
                </div>
              ))}
              {group.arrayGroups.map((arrayGroup) => (
                <Card key={`draft-array-${group.key}-${arrayGroup.arrayPath}`} size="small" title={`循环变量 · ${arrayGroup.arrayPath}`}>
                  <Space wrap size={[6, 6]}>
                    {arrayGroup.entries.map(([key, value]) => (
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

  const renderDraftOutputParamSummary = (draft: AiWorkflowDraft) => {
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
            <Tag color="green" style={{ margin: 0, width: 'fit-content' }}>{key}</Tag>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {value.description ? <Text>{value.description}</Text> : <Text type="secondary">未填写说明</Text>}
              {value.sourceStep ? <Text type="secondary">来源步骤: {value.sourceStep}</Text> : null}
            </Space>
          </div>
        ))}
      </Space>
    );
  };

  const renderDraftContractCard = (draft: AiWorkflowDraft) => {
    const inputEntries = Object.entries(draft.workflowDsl.inputParams || {});
    const requiredInputs = inputEntries.filter(([, value]) => value.required);
    const optionalInputs = inputEntries.filter(([, value]) => !value.required);
    const outputEntries = Object.entries(draft.workflowDsl.outputParams || {});
    const stepEntries = draft.workflowDsl.steps || [];
    const sampleInputPayload = inputEntries.reduce<Record<string, string>>((acc, [key, value]) => {
      const description = String(value.description || '').trim();
      const fallback = value.required ? `<required:${key}>` : `<optional:${key}>`;
      acc[key] = value.defaultValue || (description ? `<${description}>` : fallback);
      return acc;
    }, {});
    const sampleOutputPayload = outputEntries.reduce<Record<string, string>>((acc, [key, value]) => {
      const description = String(value.description || '').trim();
      const sourceStep = String(value.sourceStep || '').trim();
      acc[key] = description || (sourceStep ? `<from:${sourceStep}>` : `<output:${key}>`);
      return acc;
    }, {});

    const renderKeyTags = (
      entries: Array<[string, { description?: string; required?: boolean; defaultValue?: string; sourceStep?: string }]>,
      color: string,
      emptyText: string,
    ) => {
      if (entries.length === 0) {
        return <Text type="secondary">{emptyText}</Text>;
      }
      return (
        <Space wrap size={[6, 6]}>
          {entries.map(([key, value]) => (
            <Tooltip
              key={`contract-${color}-${key}`}
              title={[
                value.description ? `说明: ${value.description}` : '',
                value.defaultValue ? `默认值: ${value.defaultValue}` : '',
                value.sourceStep ? `来源步骤: ${value.sourceStep}` : '',
              ].filter(Boolean).join('\n') || key}
            >
              <Tag color={color} style={{ margin: 0 }}>
                {key}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      );
    };

    const stepCallItems = stepEntries.map((step, index) => {
      const rawInput = asPlainRecord(step.input);
      const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
      const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
      const inputVariables = Array.from(
        collectTemplateVariablesFromValue({
          ...rawInput,
          ...(Object.keys(httpConfig).length > 0 ? httpConfig : {}),
          ...(Object.keys(transformConfig).length > 0 ? transformConfig : {}),
        }),
      );
      return {
        key: `step-call-${step.id || index}`,
        stepLabel: step.name || `步骤 ${index + 1}`,
        activityLabel: step.activityName || step.activityRef || '未指定 Activity',
        timeout: step.startToCloseTimeout || '-',
        callType: Object.keys(httpConfig).length > 0
          ? `HTTP ${(httpConfig.method || 'GET').toString().toUpperCase()}`
          : Object.keys(transformConfig).length > 0
            ? `结构化转换 ${transformConfig.outputMode || 'json'}`
            : '通用 Activity',
        target: Object.keys(httpConfig).length > 0
          ? (httpConfig.urlTemplate || '-')
          : Object.keys(transformConfig).length > 0
            ? shorten(String(transformConfig.instructionTemplate || '结构化转换'), 60)
            : '-',
        params: inputVariables,
      };
    });

    const lineageItems = stepEntries.flatMap((step, index) => {
      const rawInput = asPlainRecord(step.input);
      const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
      const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
      const responseFieldMappings = asPlainRecord(httpConfig.responseFieldMappings);
      const outputSchema = asPlainRecord(transformConfig.outputSchema);
      const inputVariables = Array.from(
        collectTemplateVariablesFromValue({
          ...rawInput,
          ...(Object.keys(httpConfig).length > 0 ? httpConfig : {}),
          ...(Object.keys(transformConfig).length > 0 ? transformConfig : {}),
        }),
      );

      const baseInfo = {
        stepLabel: step.name || `步骤 ${index + 1}`,
        activityLabel: step.activityName || step.activityRef || '未指定 Activity',
      };
      const transformFieldMappings = asPlainRecord(transformConfig.fieldMappings);

      const inputLinks = inputVariables.map((variable) => ({
        key: `lineage-input-${step.id}-${variable}`,
        source: `输入.${variable}`,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: Object.keys(httpConfig).length > 0
          ? `请求配置.${String(httpConfig.method || 'GET').toUpperCase()}`
          : Object.keys(transformConfig).length > 0
            ? `转换配置.${transformConfig.outputMode || 'json'}`
            : '步骤输入',
        detail: Object.keys(httpConfig).length > 0
          ? (httpConfig.urlTemplate || '动态请求')
          : Object.keys(transformConfig).length > 0
            ? (transformConfig.textTemplate || transformConfig.instructionTemplate || (Object.keys(transformFieldMappings).length > 0 ? Object.entries(transformFieldMappings).map(([k, v]) => `${k}<-${v}`).join('；') : '结构化转换'))
            : '',
      }));

      const outputLinks = Object.entries(draft.workflowDsl.outputParams || {})
        .filter(([, value]) => (value.sourceStep || '') === step.id)
        .map(([key, value]) => ({
          key: `lineage-output-${step.id}-${key}`,
          source: baseInfo.stepLabel,
          step: baseInfo.stepLabel,
          activity: baseInfo.activityLabel,
          target: `输出.${key}`,
          detail: value.description || '',
        }));

      const responseMappingLinks = Object.entries(responseFieldMappings).map(([key, value]) => ({
        key: `lineage-http-map-${step.id}-${key}`,
        source: baseInfo.stepLabel,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: `字段.${key}`,
        detail: `提取路径 ${value}`,
      }));

      const schemaLinks = Object.keys(outputSchema).map((key) => ({
        key: `lineage-schema-${step.id}-${key}`,
        source: baseInfo.stepLabel,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: `字段.${key}`,
        detail: typeof outputSchema[key] === 'string' ? String(outputSchema[key]) : '输出结构字段',
      }));

      return [...inputLinks, ...responseMappingLinks, ...schemaLinks, ...outputLinks];
    });

    const groupedLineageSections = [
      {
        title: '输入驱动',
        items: lineageItems.filter((item) => item.source.startsWith('输入.')),
      },
      {
        title: '步骤提取',
        items: lineageItems.filter((item) => item.target.startsWith('字段.')),
      },
      {
        title: '最终输出',
        items: lineageItems.filter((item) => item.target.startsWith('输出.')),
      },
    ].filter((section) => section.items.length > 0);

    const qualityHints = [
      ...(inputEntries.length === 0 ? ['当前草稿还没有显式声明输入参数，建议确认是否需要定义标准入口契约。'] : []),
      ...(requiredInputs.some(([, value]) => !String(value.description || '').trim())
        ? ['存在必填输入缺少参数说明，建议补充 description，方便调用方理解。']
        : []),
      ...(outputEntries.length === 0 ? ['当前草稿还没有显式声明输出字段，返回结构可能只能依赖最后一步结果。'] : []),
      ...(outputEntries.some(([, value]) => !String(value.description || '').trim())
        ? ['存在输出字段缺少说明，建议补充 outputParams.description。']
        : []),
      ...stepEntries.flatMap((step, index) => {
        const rawInput = asPlainRecord(step.input);
        const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
        const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
        const stepName = step.name || `步骤 ${index + 1}`;
        const messages: string[] = [];
        if (Object.keys(httpConfig).length > 0) {
          if (!String(httpConfig.urlTemplate || '').trim()) {
            messages.push(`${stepName} 使用了 HTTP 请求能力，但还没有明确的 URL 模版。`);
          }
          if ((httpConfig.responseMode || '') === 'bodyMap' && Object.keys(asPlainRecord(httpConfig.responseFieldMappings)).length === 0) {
            messages.push(`${stepName} 设置了多字段返回，但还没有配置字段映射。`);
          }
        }
        if (Object.keys(transformConfig).length > 0) {
          const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
          if (isAiTransform && !String(transformConfig.instructionTemplate || '').trim()) {
            messages.push(`${stepName} 使用了 AI 结构化转换，但还没有明确的处理规则。`);
          }
          if (!isAiTransform && (transformConfig.outputMode || 'json') === 'text'
            && !String(transformConfig.textTemplate || '').trim()
            && Object.keys(asPlainRecord(transformConfig.fieldMappings)).length === 0) {
            messages.push(`${stepName} 使用了固定规则文本转换，但还没有配置 textTemplate 或 fieldMappings。`);
          }
          if ((transformConfig.outputMode || 'json') === 'json' && Object.keys(asPlainRecord(transformConfig.outputSchema)).length === 0) {
            messages.push(`${stepName} 输出模式为 JSON，但还没有定义 outputSchema。`);
          }
        }
        if (!step.activityName && !step.activityRef) {
          messages.push(`${stepName} 还没有绑定 Activity。`);
        }
        return messages;
      }),
      ...(stepCallItems.some((item) => item.params.length === 0)
        ? ['部分步骤没有显式模版变量依赖，请确认这是否是预期行为。']
        : []),
    ];

    return (
      <div
        style={{
          border: '1px solid rgba(99, 102, 241, 0.24)',
          background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, var(--bg-card) 100%)',
          borderRadius: 12,
          padding: 12,
        }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Space wrap size={[6, 6]}>
              <Tag color="blue" style={{ margin: 0 }}>输入参数 {inputEntries.length}</Tag>
              <Tag color="red" style={{ margin: 0 }}>必填 {requiredInputs.length}</Tag>
              <Tag color="default" style={{ margin: 0 }}>可选 {optionalInputs.length}</Tag>
              <Tag color="green" style={{ margin: 0 }}>输出字段 {outputEntries.length}</Tag>
            </Space>
            <Space wrap size={[6, 6]}>
              {draft.workflowDsl.workflowClassName ? (
                <Tag color="geekblue" style={{ margin: 0 }}>
                  类名: {draft.workflowDsl.workflowClassName}
                </Tag>
              ) : null}
              <Tag color="purple" style={{ margin: 0 }}>
                步骤 {stepEntries.length}
              </Tag>
            </Space>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>必填输入</Text>
              {renderKeyTags(requiredInputs, 'red', '当前没有必填输入')}
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>可选输入</Text>
              {renderKeyTags(optionalInputs, 'default', '当前没有可选输入')}
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>输出字段</Text>
              {renderKeyTags(outputEntries, 'green', '当前没有声明输出字段')}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>草稿质量提示</Text>
            {qualityHints.length === 0 ? (
              <Alert
                type="success"
                showIcon
                message="当前草稿的输入、输出和步骤配置都比较完整。"
              />
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {qualityHints.map((item, index) => (
                  <Alert
                    key={`quality-hint-${index}`}
                    type="warning"
                    showIcon
                    message={item}
                  />
                ))}
              </Space>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>输入示例 JSON</Text>
              <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
                {JSON.stringify(sampleInputPayload, null, 2)}
              </pre>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>输出示例 JSON</Text>
              <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
                {JSON.stringify(sampleOutputPayload, null, 2)}
              </pre>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>入口摘要</Text>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text>工作流名称: {draft.workflowDsl.name || draft.name}</Text>
                <Text>Task Queue: {draft.taskQueue || draft.workflowDsl.taskQueue || 'SKILL_TASK_QUEUE'}</Text>
                <Text>入口参数: {inputEntries.length === 0 ? '无' : inputEntries.map(([key]) => key).join('，')}</Text>
                <Text>必填参数: {requiredInputs.length === 0 ? '无' : requiredInputs.map(([key]) => key).join('，')}</Text>
              </Space>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>返回摘要</Text>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text>输出字段: {outputEntries.length === 0 ? '未声明' : outputEntries.map(([key]) => key).join('，')}</Text>
                <Text>来源步骤: {Array.from(new Set(outputEntries.map(([, value]) => value.sourceStep).filter(Boolean))).join('，') || '默认最后一步'}</Text>
                <Text type="secondary">返回结构优先基于 outputParams 定义，若未声明则以最后一步结果为准。</Text>
              </Space>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>步骤调用摘要</Text>
            {stepCallItems.length === 0 ? (
              <Text type="secondary">当前草稿还没有步骤调用信息</Text>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {stepCallItems.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 0.9fr)',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-secondary)',
                    }}
                  >
                    <div>
                      <Space wrap size={[6, 6]}>
                        <Tag color="purple" style={{ margin: 0 }}>{item.stepLabel}</Tag>
                        <Tag color="blue" style={{ margin: 0 }}>{item.activityLabel}</Tag>
                        <Tag style={{ margin: 0 }}>{item.callType}</Tag>
                      </Space>
                      <div style={{ marginTop: 6, fontSize: 12 }}>{item.target}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>超时: {item.timeout}</div>
                      <div style={{ fontSize: 12 }}>
                        输入依赖: {item.params.length > 0 ? item.params.join('，') : '无显式模版变量'}
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>字段来源链路</Text>
            {groupedLineageSections.length === 0 ? (
              <Text type="secondary">当前草稿还无法推导明确的字段链路</Text>
            ) : (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {groupedLineageSections.map((section) => (
                  <div key={section.title}>
                    <Text strong style={{ display: 'block', marginBottom: 6 }}>{section.title}</Text>
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      {section.items.slice(0, 12).map((item) => (
                        <div
                          key={item.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 0.9fr) 28px minmax(0, 1.1fr)',
                            gap: 8,
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <Text strong>{item.source}</Text>
                            {item.detail ? (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                {item.detail}
                              </div>
                            ) : null}
                          </div>
                          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{'->'}</div>
                          <div style={{ minWidth: 0 }}>
                            <Text>{item.target}</Text>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                              {item.step} / {item.activity}
                            </div>
                          </div>
                        </div>
                      ))}
                    </Space>
                  </div>
                ))}
              </Space>
            )}
          </div>
        </Space>
      </div>
    );
  };

  const renderDraftStepSummary = (draft: AiWorkflowDraft) => {
    const steps = draft.workflowDsl.steps || [];
    if (steps.length === 0) {
      return <Text type="secondary">未生成步骤</Text>;
    }
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {steps.map((step, index) => {
          const rawInput = asPlainRecord(step.input);
          const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
          const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
          const responseFieldMappings = asPlainRecord(httpConfig.responseFieldMappings);
          const outputSchema = asPlainRecord(transformConfig.outputSchema);
          const transformFieldMappings = asPlainRecord(transformConfig.fieldMappings);
          const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
          return (
            <div
              key={`draft-step-${step.id || index}`}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--bg-secondary)',
                borderRadius: 10,
                background: 'var(--bg-card)',
              }}
            >
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Space wrap size={[6, 6]}>
                  <Tag color="purple" style={{ margin: 0 }}>步骤 {index + 1}</Tag>
                  <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                  {step.activityName ? <Tag style={{ margin: 0 }}>{step.activityName}</Tag> : null}
                  {step.startToCloseTimeout ? <Tag color="gold" style={{ margin: 0 }}>{step.startToCloseTimeout}</Tag> : null}
                </Space>

                {Object.keys(httpConfig).length > 0 ? (
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text>HTTP 请求: {(httpConfig.method || 'GET').toString().toUpperCase()} {httpConfig.urlTemplate || '-'}</Text>
                    <Text type="secondary">返回模式: {httpConfig.responseMode || 'body'}</Text>
                    {httpConfig.responseBodyPath ? <Text type="secondary">提取路径: {httpConfig.responseBodyPath}</Text> : null}
                    {Object.keys(responseFieldMappings).length > 0 ? (
                      <Text type="secondary">字段映射: {Object.entries(responseFieldMappings).map(([k, v]) => `${k} <- ${v}`).join('；')}</Text>
                    ) : null}
                  </Space>
                ) : null}

                {Object.keys(transformConfig).length > 0 ? (
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text>{isAiTransform ? 'AI 结构化转换' : '固定规则结构化转换'}: {transformConfig.contentType || 'text'} {'->'} {transformConfig.outputMode || 'json'}</Text>
                    {transformConfig.instructionTemplate ? (
                      <Text type="secondary">处理规则: {shorten(String(transformConfig.instructionTemplate), 80)}</Text>
                    ) : null}
                    {!isAiTransform && Object.keys(transformFieldMappings).length > 0 ? (
                      <Text type="secondary">字段映射: {Object.entries(transformFieldMappings).map(([k, v]) => `${k} <- ${v}`).join('；')}</Text>
                    ) : null}
                    {!isAiTransform && transformConfig.textTemplate ? (
                      <Text type="secondary">文本模版: {shorten(String(transformConfig.textTemplate), 80)}</Text>
                    ) : null}
                    {Object.keys(outputSchema).length > 0 ? (
                      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 8 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>输出结构</Text>
                        <pre style={{ margin: 0, maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
                          {JSON.stringify(outputSchema, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </Space>
                ) : null}
              </Space>
            </div>
          );
        })}
      </Space>
    );
  };

  const buildDraftDiffSummary = (current: AiWorkflowDraft, previous?: AiWorkflowDraft | null) => {
    if (!previous) {
      return {
        addedInputs: Object.keys(current.workflowDsl.inputParams || {}),
        changedInputs: [] as string[],
        addedOutputs: Object.keys(current.workflowDsl.outputParams || {}),
        changedOutputs: [] as string[],
        addedSteps: (current.workflowDsl.steps || []).map((step) => step.name || step.id),
        changedSteps: [] as string[],
      };
    }

    const currentInputs = Object.keys(current.workflowDsl.inputParams || {});
    const previousInputs = new Set(Object.keys(previous.workflowDsl.inputParams || {}));
    const previousInputMap = previous.workflowDsl.inputParams || {};
    const currentOutputs = Object.keys(current.workflowDsl.outputParams || {});
    const previousOutputs = new Set(Object.keys(previous.workflowDsl.outputParams || {}));
    const previousOutputMap = previous.workflowDsl.outputParams || {};
    const previousStepsById = new Map((previous.workflowDsl.steps || []).map((step) => [step.id, step]));

    const addedInputs = currentInputs.filter((key) => !previousInputs.has(key));
    const changedInputs = currentInputs
      .filter((key) => previousInputs.has(key))
      .filter((key) => {
        const currentInput = current.workflowDsl.inputParams?.[key];
        const previousInput = previousInputMap[key];
        return JSON.stringify({
          required: currentInput?.required,
          defaultValue: currentInput?.defaultValue,
          description: currentInput?.description,
        }) !== JSON.stringify({
          required: previousInput?.required,
          defaultValue: previousInput?.defaultValue,
          description: previousInput?.description,
        });
      })
      .map((key) => {
        const currentInput = current.workflowDsl.inputParams?.[key];
        const previousInput = previousInputMap[key];
        const changes: string[] = [];
        if ((currentInput?.required ?? false) !== (previousInput?.required ?? false)) {
          changes.push(`必填=${currentInput?.required ? "是" : "否"}`);
        }
        if ((currentInput?.defaultValue || "") !== (previousInput?.defaultValue || "")) {
          changes.push(`默认值=${currentInput?.defaultValue || "<空>"}`);
        }
        if ((currentInput?.description || "") !== (previousInput?.description || "")) {
          changes.push("说明已更新");
        }
        return `${key}（${changes.join("，")}）`;
      });
    const addedOutputs = currentOutputs.filter((key) => !previousOutputs.has(key));
    const changedOutputs = currentOutputs
      .filter((key) => previousOutputs.has(key))
      .filter((key) => {
        const currentOutput = current.workflowDsl.outputParams?.[key];
        const previousOutput = previousOutputMap[key];
        return JSON.stringify({
          description: currentOutput?.description,
          sourceStep: currentOutput?.sourceStep,
        }) !== JSON.stringify({
          description: previousOutput?.description,
          sourceStep: previousOutput?.sourceStep,
        });
      })
      .map((key) => {
        const currentOutput = current.workflowDsl.outputParams?.[key];
        const previousOutput = previousOutputMap[key];
        const changes: string[] = [];
        if ((currentOutput?.sourceStep || "") !== (previousOutput?.sourceStep || "")) {
          changes.push(`来源=${currentOutput?.sourceStep || "最后一步"}`);
        }
        if ((currentOutput?.description || "") !== (previousOutput?.description || "")) {
          changes.push("说明已更新");
        }
        return `${key}（${changes.join("，")}）`;
      });
    const addedSteps = (current.workflowDsl.steps || [])
      .filter((step) => !previousStepsById.has(step.id))
      .map((step) => step.name || step.id);
    const changedSteps = (current.workflowDsl.steps || [])
      .filter((step) => {
        const prev = previousStepsById.get(step.id);
        if (!prev) {
          return false;
        }
        return JSON.stringify({
          name: step.name,
          activityName: step.activityName,
          input: step.input,
          startToCloseTimeout: step.startToCloseTimeout,
        }) !== JSON.stringify({
          name: prev.name,
          activityName: prev.activityName,
          input: prev.input,
          startToCloseTimeout: prev.startToCloseTimeout,
        });
      })
      .map((step) => step.name || step.id);

    return {
      addedInputs,
      changedInputs,
      addedOutputs,
      changedOutputs,
      addedSteps,
      changedSteps,
    };
  };

  const renderDraftDiffSummary = (current: AiWorkflowDraft, previous?: AiWorkflowDraft | null) => {
    const diff = buildDraftDiffSummary(current, previous);
    const hasChanges = diff.addedInputs.length > 0
      || diff.changedInputs.length > 0
      || diff.addedOutputs.length > 0
      || diff.changedOutputs.length > 0
      || diff.addedSteps.length > 0
      || diff.changedSteps.length > 0;
    if (!hasChanges) {
      return (
        <Alert
          type="info"
          showIcon
          message={previous ? "本轮草稿与上一轮相比没有识别到明显结构变化。" : "这是首轮草稿，后续修改会在这里展示差异。"}
        />
      );
    }
    return (
      <div style={{ background: "var(--bg-card)", borderRadius: 10, padding: 10, border: "1px solid var(--bg-secondary)" }}>
        <Text strong style={{ display: "block", marginBottom: 8 }}>相对上一轮的变化</Text>
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          {diff.addedInputs.length > 0 ? <Alert type="success" showIcon message={`新增输入参数: ${diff.addedInputs.join("，")}`} /> : null}
          {diff.changedInputs.length > 0 ? <Alert type="warning" showIcon message={`输入参数已调整: ${diff.changedInputs.join("；")}`} /> : null}
          {diff.addedOutputs.length > 0 ? <Alert type="success" showIcon message={`新增输出字段: ${diff.addedOutputs.join("，")}`} /> : null}
          {diff.changedOutputs.length > 0 ? <Alert type="warning" showIcon message={`输出字段已调整: ${diff.changedOutputs.join("；")}`} /> : null}
          {diff.addedSteps.length > 0 ? <Alert type="success" showIcon message={`新增步骤: ${diff.addedSteps.join("，")}`} /> : null}
          {diff.changedSteps.length > 0 ? <Alert type="warning" showIcon message={`已调整步骤: ${diff.changedSteps.join("，")}`} /> : null}
        </Space>
      </div>
    );
  };

  const latestDraftMessageIndex = useMemo(
    () => {
      for (let index = aiDraftMessages.length - 1; index >= 0; index -= 1) {
        if (aiDraftMessages[index]?.draft) {
          return index;
        }
      }
      return -1;
    },
    [aiDraftMessages],
  );

  const previousDraftForCurrent = useMemo(() => {
    if (!currentAiDraft || latestDraftMessageIndex <= 0) {
      return undefined;
    }
    for (let index = latestDraftMessageIndex - 1; index >= 0; index -= 1) {
      if (aiDraftMessages[index]?.draft) {
        return aiDraftMessages[index].draft;
      }
    }
    return undefined;
  }, [aiDraftMessages, currentAiDraft, latestDraftMessageIndex]);

  const currentDraftApplyDiff = useMemo(
    () => (currentAiDraft ? buildDraftDiffSummary(currentAiDraft, previousDraftForCurrent) : null),
    [currentAiDraft, previousDraftForCurrent],
  );

  return (
    <Drawer
      title="AI 工作流草稿助手"
      placement="right"
      width={1100}
      open={visible}
      onClose={onClose}
      styles={{ body: { padding: 0 } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" disabled={!currentAiDraft} onClick={() => setApplyDraftConfirmVisible(true)}>应用草稿</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', height: '100%' }}>
        {/* 会话历史侧边栏 */}
        <div style={{ width: 300, borderRight: '1px solid var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--bg-secondary)' }}>
            <Button
              type="primary"
              block
              icon={<ThunderboltOutlined />}
              onClick={() => {
                setAiDraftSessionId(null);
                setAiDraftMessages([]);
                setCurrentAiDraft(null);
              }}
            >
              新建草稿会话
            </Button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {aiDraftSessionsQuery.data?.map((session: any) => (
                <Card
                  key={session.sessionId}
                  size="small"
                  style={{
                    cursor: 'pointer',
                    borderColor: aiDraftSessionId === session.sessionId ? 'var(--primary-color)' : undefined,
                  }}
                  onClick={() => handleResumeAiDraftSession(session.sessionId)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Space direction="vertical" size={2}>
                      <Text strong>{session.currentDraftName || session.title || '未命名会话'}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{new Date(session.updatedAt).toLocaleString()}</Text>
                    </Space>
                    <Popconfirm
                      title="确认删除该草稿会话？"
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        handleDeleteAiDraftSession(session.sessionId);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button size="small" type="text" danger onClick={(e) => e.stopPropagation()}>删除</Button>
                    </Popconfirm>
                  </div>
                </Card>
              ))}
              {(!aiDraftSessionsQuery.data || aiDraftSessionsQuery.data.length === 0) && (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <Text type="secondary">暂无历史草稿会话</Text>
                </div>
              )}
            </Space>
          </div>
        </div>

        {/* 聊天和草稿主区域 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {aiDraftSessionId ? (
            <>
              {/* 聊天记录 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg-secondary)' }}>
                {aiDraftMessages.map((msg, i) => {
                  const isLatestDraft = Boolean(msg.draft) && i === latestDraftMessageIndex;
                  const previousDraft = msg.draft
                    ? [...aiDraftMessages.slice(0, i)].reverse().find((item) => Boolean(item.draft))?.draft
                    : undefined;

                  return (
                    <div
                      key={`draft-msg-${i}`}
                      style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        background: msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-secondary)',
                        color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                        padding: '10px 14px',
                        borderRadius: 12,
                        borderBottomRightRadius: msg.role === 'user' ? 2 : 12,
                        borderBottomLeftRadius: msg.role === 'assistant' ? 2 : 12,
                        marginBottom: 24,
                      }}
                    >
                      <div className={msg.role === 'assistant' ? 'chat-message-markdown' : ''}>
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {beautifyText(msg.content)}
                          </ReactMarkdown>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        )}
                      </div>
                      {msg.draft && (
                         <div
                           style={{
                             marginTop: 10,
                            borderTop: '1px solid var(--border-color)',
                             paddingTop: 10,
                           }}
                         >
                           <Space direction="vertical" size={10} style={{ width: '100%' }}>
                             <div>
                               <Space wrap size={[6, 6]}>
                                <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit', fontSize: 13 }}>
                                   草稿预览: {msg.draft.workflowDsl.name}
                                 </Text>
                                 <Tag color={isLatestDraft ? 'processing' : 'default'} style={{ margin: 0 }}>
                                   {isLatestDraft ? '当前版本' : '历史版本'}
                                 </Tag>
                               </Space>
                               {msg.draft.description ? (
                                 <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                                   {msg.draft.description}
                                 </div>
                               ) : null}
                             </div>

                             <Space wrap size={[6, 6]}>
                               <Tag color="geekblue" style={{ margin: 0 }}>
                                 Task Queue: {msg.draft.taskQueue || 'SKILL_TASK_QUEUE'}
                               </Tag>
                               {msg.draft.sourceContext?.referenceUrl ? (
                                 <Tag color="blue" style={{ margin: 0 }}>
                                   参考 URL
                                 </Tag>
                               ) : null}
                               <Tag color="purple" style={{ margin: 0 }}>
                                 步骤数: {msg.draft.workflowDsl.steps.length}
                               </Tag>
                             </Space>

                             {msg.draft.sourceContext?.referenceUrl ? (
                               <div style={{ fontSize: 12, opacity: 0.85, wordBreak: 'break-all' }}>
                                 {msg.draft.sourceContext.referenceUrl}
                               </div>
                             ) : null}

                             {renderDraftDiffSummary(msg.draft, previousDraft)}

                             {isLatestDraft ? (
                               <>
                                 {renderDraftContractCard(msg.draft)}

                                 <div>
                                  <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit' }}>关键输入参数</Text>
                                   <div style={{ marginTop: 6 }}>
                                     {renderDraftInputParamSummary(msg.draft)}
                                   </div>
                                 </div>

                                 <div>
                                  <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit' }}>输出结构</Text>
                                   <div style={{ marginTop: 6 }}>
                                     {renderDraftOutputParamSummary(msg.draft)}
                                   </div>
                                 </div>

                                 <div>
                                  <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit' }}>步骤摘要</Text>
                                   <div style={{ marginTop: 6 }}>
                                     {renderDraftStepSummary(msg.draft)}
                                   </div>
                                 </div>
                               </>
                             ) : (
                               <Collapse size="small" ghost>
                                 <Panel header="展开查看该历史版本的完整草稿" key={`draft-history-${i}`}>
                                   <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                     {renderDraftContractCard(msg.draft)}
                                     <div>
                                       <Text strong>关键输入参数</Text>
                                       <div style={{ marginTop: 6 }}>
                                         {renderDraftInputParamSummary(msg.draft)}
                                       </div>
                                     </div>
                                     <div>
                                       <Text strong>输出结构</Text>
                                       <div style={{ marginTop: 6 }}>
                                         {renderDraftOutputParamSummary(msg.draft)}
                                       </div>
                                     </div>
                                     <div>
                                       <Text strong>步骤摘要</Text>
                                       <div style={{ marginTop: 6 }}>
                                         {renderDraftStepSummary(msg.draft)}
                                       </div>
                                     </div>
                                   </Space>
                                 </Panel>
                               </Collapse>
                             )}

                             {msg.draft.warnings?.length ? (
                               <Alert
                                 type="warning"
                                 showIcon
                                 message="草稿提示"
                                 description={msg.draft.warnings.join('；')}
                               />
                             ) : null}
                           </Space>
                         </div>
                      )}
                    </div>
                  );
                })}
                {refineAiDraftMutation.isLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 24 }}>
                    <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 12, border: '1px solid var(--border-color)' }}>
                      <Text type="secondary">AI 正在思考和修改草稿...</Text>
                    </div>
                  </div>
                )}
              </div>

              {/* 输入区 */}
              <div style={{ padding: 16, borderTop: '1px solid var(--bg-secondary)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <Input.TextArea
                    value={aiDraftInput}
                    onChange={(e) => setAiDraftInput(e.target.value)}
                    placeholder="告诉 AI 你想如何修改当前草稿...（例如：增加一个通知步骤、将某个参数改为必填）"
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    onPressEnter={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        handleRefineAiDraft();
                      }
                    }}
                    disabled={refineAiDraftMutation.isLoading}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleRefineAiDraft}
                    loading={refineAiDraftMutation.isLoading}
                    style={{ height: 'auto' }}
                  >
                    发送
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* 新建会话表单 */
            <div style={{ padding: 40, maxWidth: 600, margin: '0 auto', width: '100%' }}>
              <div style={{ textAlign: 'center', marginBottom: 32 }}>
                <ThunderboltOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
                <Typography.Title level={3}>新建工作流草稿</Typography.Title>
                <Text type="secondary">告诉 AI 你的需求，或者提供一个参考链接，AI 会为你生成完整的工作流定义。</Text>
              </div>

              <Card>
                <Space direction="vertical" size={24} style={{ width: '100%' }}>
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>需求说明</Text>
                    <Input.TextArea
                      rows={6}
                      placeholder="描述你想要实现的工作流功能，包括输入参数、输出结果、需要调用的系统等..."
                      value={aiDraftDescription}
                      onChange={(e) => setAiDraftDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>参考链接（可选）</Text>
                    <Input
                      placeholder="提供一个 API 文档或网页链接，AI 会尝试理解其中的接口定义"
                      value={aiDraftReferenceUrl}
                      onChange={(e) => setAiDraftReferenceUrl(e.target.value)}
                    />
                  </div>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<ThunderboltOutlined />}
                    onClick={handleGenerateAiDraft}
                    loading={generateAiDraftMutation.isLoading}
                  >
                    生成草稿
                  </Button>
                </Space>
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal
        title="确认应用草稿"
        open={applyDraftConfirmVisible}
        onOk={() => {
          if (currentAiDraft) {
            onApplyDraft(currentAiDraft);
            setApplyDraftConfirmVisible(false);
          }
        }}
        onCancel={() => setApplyDraftConfirmVisible(false)}
        width={800}
      >
        <Alert
          type="warning"
          showIcon
          message="应用草稿将覆盖当前编辑的工作流配置"
          description="应用后，当前表单中的所有配置（包含步骤、参数、代码等）都将被草稿内容替换。此操作不可撤销。"
          style={{ marginBottom: 16 }}
        />
        {currentAiDraft && currentDraftApplyDiff && (
          <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>即将应用的变更摘要</Text>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Text>工作流名称: {currentAiDraft.workflowDsl.name || currentAiDraft.name}</Text>
              <Text>新增输入参数: {currentDraftApplyDiff.addedInputs.length} 个</Text>
              <Text>新增输出字段: {currentDraftApplyDiff.addedOutputs.length} 个</Text>
              <Text>包含步骤: {currentAiDraft.workflowDsl.steps?.length || 0} 步</Text>
            </Space>
          </div>
        )}
      </Modal>
    </Drawer>
  );
};