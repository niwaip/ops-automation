import React, { useMemo } from 'react';
import { Card, Space, Tag, Typography, Button, Alert, Collapse, message } from 'antd';
import {
  RobotOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { ExecutionStepDto } from '@/api/execution';

const { Text } = Typography;
const { Panel } = Collapse;

export interface ExtractedLLMCall {
  id: string;
  source: 'planner' | 'step';
  stage: string;
  label: string;
  modelId?: string;
  systemPrompt?: string;
  userPrompt?: string;
  responseText?: string;
  requestMessages?: Array<{ role: string; content: string }>;
}

interface PromptLLMCallsViewProps {
  promptDebug?: Record<string, any>;
  normalizedInput?: Record<string, any>;
  steps?: ExecutionStepDto[];
  skillId?: string;
  rawUserPrompt?: string;
  onCopyPrompt?: (prompt: string) => void;
}

export const PromptLLMCallsView: React.FC<PromptLLMCallsViewProps> = ({
  promptDebug,
  normalizedInput,
  steps = [],
  skillId,
  rawUserPrompt,
  onCopyPrompt,
}) => {
  // 1. Collect all real LLM calls from planning, recognizer, and execution steps
  const actualLlmCalls = useMemo(() => {
    const list: ExtractedLLMCall[] = [];

    // From promptDebug.llmCalls
    if (Array.isArray(promptDebug?.llmCalls) && promptDebug.llmCalls.length > 0) {
      promptDebug.llmCalls.forEach((call: any, idx: number) => {
        const reqMsgs: Array<{ role: string; content: string }> = Array.isArray(call.requestMessages)
          ? call.requestMessages
          : [];
        const sysMsg = reqMsgs.find((m) => m.role === 'system')?.content;
        const userMsgs = reqMsgs.filter((m) => m.role !== 'system');
        const userText = userMsgs.map((m) => m.content).join('\n\n') || call.userPrompt || '';

        list.push({
          id: `planner-call-${idx}`,
          source: 'planner',
          label: call.label || call.stage || `LLM 规划调用 #${idx + 1}`,
          stage: call.stage || 'planner',
          modelId: call.modelId || promptDebug?.modelId,
          systemPrompt:
            sysMsg ||
            (call.systemPrompt && !call.systemPrompt.includes('Planner Debug Snapshot')
              ? call.systemPrompt
              : undefined),
          userPrompt: userText,
          responseText: call.responseText || call.note,
          requestMessages: reqMsgs,
        });
      });
    } else if (
      Array.isArray(promptDebug?.llmRequestMessages) &&
      promptDebug.llmRequestMessages.length > 0
    ) {
      const reqMsgs: Array<{ role: string; content: string }> = promptDebug.llmRequestMessages;
      const sysMsg = reqMsgs.find((m) => m.role === 'system')?.content;
      const userMsgs = reqMsgs.filter((m) => m.role !== 'system');

      list.push({
        id: 'planner-request-msgs',
        source: 'planner',
        label: '规划阶段模型请求',
        stage: promptDebug?.debugSource || 'planner',
        modelId: promptDebug?.modelId,
        systemPrompt: sysMsg,
        userPrompt: userMsgs.map((m) => m.content).join('\n\n') || promptDebug?.userPrompt || '',
        responseText: promptDebug?.llmResponseText,
        requestMessages: reqMsgs,
      });
    }

    // From steps (llm_operation or __promptDebug)
    steps.forEach((step, idx) => {
      const stepOutputObj =
        step.output && typeof step.output === 'object' && !Array.isArray(step.output)
          ? (step.output as Record<string, any>)
          : {};
      const stepPromptDebug = stepOutputObj.__promptDebug || stepOutputObj.promptDebug;
      if (step.type === 'llm_operation' || stepPromptDebug) {
        list.push({
          id: `step-llm-${idx}`,
          source: 'step',
          label: `步骤 ${idx + 1}: ${step.name || step.type} (算子执行)`,
          stage: 'step_execution',
          modelId: stepPromptDebug?.modelId || promptDebug?.modelId,
          systemPrompt: stepPromptDebug?.systemPrompt,
          userPrompt:
            stepPromptDebug?.userPrompt ||
            (typeof step.input === 'string' ? step.input : JSON.stringify(step.input, null, 2)),
          responseText:
            stepPromptDebug?.llmResponseText ||
            (typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)),
        });
      }
    });

    return list;
  }, [promptDebug, steps]);

  // 2. Identify planner snapshot (internal process flow, NOT LLM prompt)
  const rawSystemPrompt = promptDebug?.systemPrompt || normalizedInput?.systemPrompt || '';
  const isSnapshotString =
    rawSystemPrompt.includes('Planner Debug Snapshot') || rawSystemPrompt.includes('planner_mode:');
  const plannerSnapshotText =
    promptDebug?.plannerSnapshot || (isSnapshotString ? rawSystemPrompt : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. 原始用户输入 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Space size={6}>
            <Tag color="cyan">用户原始诉求输入 (User Request)</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>发起此任务时的直接输入文本</Text>
          </Space>
          {onCopyPrompt && rawUserPrompt && (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => onCopyPrompt(rawUserPrompt)}
            >
              复制
            </Button>
          )}
        </div>
        <div
          style={{
            background: 'var(--bg-secondary, #f8fafc)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
          }}
        >
          {rawUserPrompt || <Text type="secondary">（无原始文本提示词输入）</Text>}
        </div>
      </div>

      {/* 2. 真实 LLM 调用与提示词明细 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space size={8}>
            <RobotOutlined style={{ color: '#1677ff' }} />
            <Text strong style={{ fontSize: 13 }}>
              大模型 (LLM) 真实提示词与调用交互
            </Text>
            {actualLlmCalls.length > 0 ? (
              <Tag color="green">已捕获 {actualLlmCalls.length} 次真实大模型调用</Tag>
            ) : (
              <Tag color="orange">未发生大模型推演调用</Tag>
            )}
          </Space>
        </div>

        {actualLlmCalls.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actualLlmCalls.map((call) => (
              <Card
                key={call.id}
                size="small"
                style={{
                  borderRadius: 10,
                  border: '1px solid rgba(22, 119, 255, 0.25)',
                  background: 'rgba(22, 119, 255, 0.02)',
                }}
                title={
                  <Space size={8} wrap>
                    <ThunderboltOutlined style={{ color: '#1677ff' }} />
                    <Text strong style={{ fontSize: 13 }}>
                      {call.label}
                    </Text>
                    <Tag color="blue" style={{ fontSize: 11 }}>
                      {call.stage}
                    </Tag>
                    {call.modelId && (
                      <Tag color="purple" style={{ fontSize: 11 }}>
                        模型: {call.modelId}
                      </Tag>
                    )}
                  </Space>
                }
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  {/* 给到 LLM 的真实 System Prompt */}
                  {call.systemPrompt ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Space size={6}>
                          <Tag color="purple" style={{ margin: 0 }}>真实 System Prompt (系统提示词)</Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>发送给该大模型的全局角色规范与输出限制</Text>
                        </Space>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(call.systemPrompt!);
                            message.success('System Prompt 已复制');
                          }}
                        >
                          复制
                        </Button>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '10px 12px',
                          background: 'var(--bg-secondary, #f8fafc)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.55,
                          maxHeight: 220,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                        }}
                      >
                        {call.systemPrompt}
                      </pre>
                    </div>
                  ) : null}

                  {/* 给到 LLM 的真实 User Prompt */}
                  {call.userPrompt ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Space size={6}>
                          <Tag color="cyan" style={{ margin: 0 }}>真实 User Prompt / 组装输入体</Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>发送给该模型的入参规范、上下文与用户诉求</Text>
                        </Space>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(call.userPrompt!);
                            message.success('User Prompt 已复制');
                          }}
                        >
                          复制
                        </Button>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '10px 12px',
                          background: 'var(--bg-secondary, #f8fafc)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.55,
                          maxHeight: 240,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                        }}
                      >
                        {call.userPrompt}
                      </pre>
                    </div>
                  ) : null}

                  {/* 大模型真实原始回复 */}
                  {call.responseText ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Space size={6}>
                          <Tag color="green" style={{ margin: 0 }}>大模型真实原始回复 (LLM Response)</Tag>
                          <Text type="secondary" style={{ fontSize: 11 }}>大模型直接生成的原始内容</Text>
                        </Space>
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            navigator.clipboard.writeText(call.responseText!);
                            message.success('模型原始回复已复制');
                          }}
                        >
                          复制
                        </Button>
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '10px 12px',
                          background: 'var(--bg-secondary, #f8fafc)',
                          border: '1px solid var(--border-color, #e2e8f0)',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.5,
                          maxHeight: 200,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                        }}
                      >
                        {call.responseText}
                      </pre>
                    </div>
                  ) : null}
                </Space>
              </Card>
            ))}
          </div>
        ) : (
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            style={{ borderRadius: 8 }}
            message="【确定性规则直连】本工单未发起大模型 (LLM) 调用"
            description={
              <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 4 }}>
                <div>• 本次工单（技能：<b>{skillId || 'Bark推送'}</b>）由系统基于精准关键词别名或确定性规则直接完成匹配与调度，<b>不需要大模型进行模糊推理或语义抽取</b>。</div>
                <div>• 全程<b>未向任何大模型发送 Prompt，Token 消耗为 0</b>。因此此处无发给 LLM 的提示词产生。</div>
              </div>
            }
          />
        )}
      </div>

      {/* 3. 编排器内部规划决策快照 (区分于 LLM 提示词) */}
      {plannerSnapshotText && (
        <Collapse ghost size="small">
          <Panel
            key="snapshot"
            header={
              <Space size={6}>
                <Tag color="default">内部状态</Tag>
                <Text strong style={{ fontSize: 12.5 }}>
                  编排器内部计划决策推演快照 (Planner Flow Summary，非 LLM 提示词)
                </Text>
              </Space>
            }
          >
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #8c8c8c)', marginBottom: 6 }}>
              ℹ️ 说明：此内容是系统内部状态机规划器（Planner）对模式识别、技能匹配及参数完备性的推演状态摘要，用于排查调度流程，并不是发给大模型的 Prompt 文本。
            </div>
            <pre
              style={{
                margin: 0,
                padding: '10px 12px',
                background: 'rgba(0, 0, 0, 0.03)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
              }}
            >
              {plannerSnapshotText}
            </pre>
          </Panel>
        </Collapse>
      )}
    </div>
  );
};
