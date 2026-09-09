import React, { useState } from 'react';
import {
  Card,
  Space,
  Tag,
  Typography,
  Button,
  Alert,
  Collapse,
  Badge,
  Descriptions,
  message,
  Tooltip,
} from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  ShareAltOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { ExecutionDto, ExecutionStepDto } from '@/api/execution';
import { AIModel } from '@/api/ai';
import { PromptLLMCallsView } from './PromptLLMCallsView';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface PromptTraceFlowViewProps {
  execution: ExecutionDto;
  steps: ExecutionStepDto[];
  loadingSteps?: boolean;
  models?: AIModel[];
  onSelectPromptForTest?: (prompt: string) => void;
}

export const PromptTraceFlowView: React.FC<PromptTraceFlowViewProps> = ({
  execution,
  steps,
  loadingSteps,
  models = [],
  onSelectPromptForTest,
}) => {
  const [activePanels, setActivePanels] = useState<string[]>(['stage-1', 'stage-2', 'stage-3']);

  // Extract Prompt Info
  const normalizedInput = execution.normalizedInput as Record<string, any> | undefined;
  const promptDebug = normalizedInput?.promptDebug as Record<string, any> | undefined;

  const rawUserPrompt: string =
    promptDebug?.userPrompt ||
    (typeof (execution as any).input === 'string' ? (execution as any).input : '') ||
    (execution.input as Record<string, any>)?.prompt ||
    (execution.input as Record<string, any>)?.instruction ||
    (execution.input as Record<string, any>)?.text ||
    (execution.semantic as any)?.targetEntity ||
    '';

  const modelId: string =
    promptDebug?.modelId ||
    (execution as any).modelId ||
    normalizedInput?.modelId ||
    '自动路由模型';

  const matchedModel = models.find((m) => m.id === modelId);
  const modelDisplayName = matchedModel ? matchedModel.name : modelId;

  // Calculate duration
  const startTime = execution.startedAt ? new Date(execution.startedAt).getTime() : null;
  const endTime = execution.endedAt
    ? new Date(execution.endedAt).getTime()
    : execution.updatedAt
      ? new Date(execution.updatedAt).getTime()
      : null;
  const durationSec = startTime && endTime ? ((endTime - startTime) / 1000).toFixed(1) : '-';

  // Export full diagnostic incident report as markdown
  const handleCopyIncidentReport = () => {
    const report = [
      `# 工单故障与调用链审计报告 [${execution.id}]`,
      `- 状态: ${execution.status.toUpperCase()}`,
      `- 触发时间: ${execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '-'}`,
      `- 耗时: ${durationSec}s`,
      `- 模型: ${modelDisplayName} (${modelId})`,
      `- 所属技能/流程: ${execution.skillId || '通用流程'}`,
      '',
      `## 1. 提示词与大模型调用现场 (Prompt Context)`,
      `### 用户原始诉求/指令:`,
      '```text',
      rawUserPrompt || '(无原始文本输入)',
      '```',
      (promptDebug?.llmCalls?.length ?? 0) > 0
        ? `### 真实 LLM 调用记录 (${promptDebug!.llmCalls!.length} 次):`
        : '- 大模型调用状态: 本工单未发起大模型推演（由确定性规则/别名引擎直接命中）',
      ...(promptDebug?.llmCalls || []).map((c: any, i: number) => {
        const sysMsg = c.requestMessages?.find((m: any) => m.role === 'system')?.content;
        const userMsg = c.requestMessages?.find((m: any) => m.role === 'user')?.content;
        return [
          `#### [调用 ${i + 1}] ${c.label || c.stage} (模型: ${c.modelId || '默认'})`,
          sysMsg ? `**System Prompt:**\n\`\`\`text\n${sysMsg}\n\`\`\`` : '',
          userMsg ? `**User Prompt:**\n\`\`\`text\n${userMsg}\n\`\`\`` : '',
          c.responseText ? `**Response:**\n\`\`\`text\n${c.responseText}\n\`\`\`` : '',
        ].filter(Boolean).join('\n');
      }),
      '',
      `## 2. 工单执行步骤 (${steps.length} 步)`,
      ...steps.map((s, idx) => [
        `### 步骤 ${idx + 1}: ${s.name || s.type} [${s.status}]`,
        `- 类型: ${s.type}`,
        `- 耗时: ${s.startedAt && s.endedAt ? ((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000).toFixed(1) + 's' : '-'}`,
        s.errorMessage ? `- 错误信息: ${s.errorMessage}` : '',
        s.input ? `- 输入: ${JSON.stringify(s.input)}` : '',
        s.output ? `- 输出: ${JSON.stringify(s.output)}` : '',
      ].filter(Boolean).join('\n')),
      '',
      `## 3. 最终结果与异常定位 (Result & Error)`,
      execution.failureCode ? `- 故障码: ${execution.failureCode}` : '',
      execution.failureReason ? `- 故障原因: ${execution.failureReason}` : '',
      `- 最终结果:`,
      '```json',
      typeof execution.result === 'string'
        ? execution.result
        : JSON.stringify(execution.result || execution.resultJson, null, 2),
      '```',
    ].join('\n');

    navigator.clipboard.writeText(report);
    message.success('完整工单调用链故障报告已复制到剪贴板');
  };

  const handleCopyPrompt = (textToCopy?: string) => {
    const text = typeof textToCopy === 'string' ? textToCopy : rawUserPrompt;
    if (!text) {
      message.info('无可用用户提示词');
      return;
    }
    navigator.clipboard.writeText(text);
    message.success('提示词已复制');
  };

  const isFailed = execution.status === 'failed';
  const isSucceeded = execution.status === 'succeeded';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header Card */}
      <Card
        size="small"
        style={{
          borderRadius: 12,
          border: isFailed ? '1px solid rgba(255, 77, 79, 0.35)' : undefined,
          background: isFailed ? 'rgba(255, 77, 79, 0.03)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Space size={8} align="center" wrap>
              <Badge status={isFailed ? 'error' : isSucceeded ? 'success' : 'processing'} />
              <Title level={5} style={{ margin: 0 }}>
                工单调用链跟踪: <Text code>{execution.id}</Text>
              </Title>
              <Tag color={isFailed ? 'error' : isSucceeded ? 'success' : 'processing'} style={{ borderRadius: 8 }}>
                {execution.status.toUpperCase()}
              </Tag>
              {execution.skillId && <Tag color="purple">{execution.skillId}</Tag>}
            </Space>

            <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--text-secondary, #8c8c8c)', fontSize: 12 }}>
              <span>创建: {execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '-'}</span>
              <span>执行耗时: <b>{durationSec}s</b></span>
              <span>AI模型: <Text strong>{modelDisplayName}</Text></span>
              {execution.createdBy && <span>发起用户: {execution.createdByName || execution.createdBy}</span>}
            </div>
          </div>

          <Space size={8}>
            <Tooltip title="复制包含提示词、全部执行步骤与异常报错的 Markdown 格式报告">
              <Button icon={<CopyOutlined />} onClick={handleCopyIncidentReport} style={{ borderRadius: 6 }}>
                复制完整故障报告
              </Button>
            </Tooltip>
            {onSelectPromptForTest && rawUserPrompt && (
              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                onClick={() => onSelectPromptForTest(rawUserPrompt)}
                style={{ borderRadius: 6 }}
              >
                提取提示词测试
              </Button>
            )}
          </Space>
        </div>

        {/* If Execution Failed, show prominent incident banner */}
        {isFailed && (
          <Alert
            type="error"
            showIcon
            icon={<CloseCircleOutlined />}
            style={{ marginTop: 12, borderRadius: 8 }}
            message={
              <Space>
                <Text strong>工单执行中断 / 异常报错</Text>
                {execution.failureCode && <Tag color="red">{execution.failureCode}</Tag>}
              </Space>
            }
            description={
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {execution.failureReason || '未捕获的具体异常信息，请查看下方步骤现场'}
              </div>
            }
          />
        )}
      </Card>

      {/* Main 3-Stage Call Flow Collapse */}
      <Collapse
        activeKey={activePanels}
        onChange={(keys) => setActivePanels(Array.isArray(keys) ? keys : [keys])}
        style={{ borderRadius: 12 }}
      >
        {/* Stage 1: 提示词与模型调用上下文 */}
        <Panel
          key="stage-1"
          header={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '96%', alignItems: 'center' }}>
              <Space size={8}>
                <RobotOutlined style={{ color: '#1677ff', fontSize: 16 }} />
                <Text strong style={{ fontSize: 14 }}>
                  阶段 1: 提示词与模型调用上下文 (Prompt & Model)
                </Text>
              </Space>
              <Tag color="blue">{modelDisplayName}</Tag>
            </div>
          }
        >
          <PromptLLMCallsView
            promptDebug={promptDebug}
            normalizedInput={normalizedInput}
            steps={steps}
            skillId={execution.skillId}
            rawUserPrompt={rawUserPrompt}
            onCopyPrompt={handleCopyPrompt}
          />
        </Panel>

        {/* Stage 2: 工单执行步骤与工具调用 */}
        <Panel
          key="stage-2"
          header={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '96%', alignItems: 'center' }}>
              <Space size={8}>
                <BranchesOutlined style={{ color: '#fa8c16', fontSize: 16 }} />
                <Text strong style={{ fontSize: 14 }}>
                  阶段 2: 工单执行步骤链与工具调用 (Execution Steps)
                </Text>
              </Space>
              <Tag color={steps.some((s) => s.status === 'failed') ? 'red' : 'green'}>
                共 {steps.length} 个步骤
              </Tag>
            </div>
          }
        >
          {loadingSteps ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Text type="secondary">正在读取步骤执行链路...</Text>
            </div>
          ) : steps.length === 0 ? (
            <Alert
              type="info"
              message="暂无独立步骤记录"
              description="该工单可能在调度或参数预校验阶段即退出，未生成更细粒度的 Step 节点。"
              showIcon
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {steps.map((step, idx) => {
                const stepFailed = step.status === 'failed';
                const stepSucceeded = step.status === 'succeeded';
                const stepTime =
                  step.startedAt && step.endedAt
                    ? ((new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1) + 's'
                    : '-';

                return (
                  <Card
                    key={step.id || idx}
                    size="small"
                    style={{
                      borderRadius: 8,
                      border: stepFailed ? '1.5px solid #ff4d4f' : '1px solid var(--border-color, #f0f0f0)',
                      background: stepFailed ? 'rgba(255, 77, 79, 0.04)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Space size={8}>
                        <Tag color={stepFailed ? 'red' : stepSucceeded ? 'green' : 'blue'} style={{ borderRadius: 6 }}>
                          Step {idx + 1}
                        </Tag>
                        <Text strong style={{ fontSize: 13 }}>
                          {step.name || step.type}
                        </Text>
                        <Tag>{step.type}</Tag>
                      </Space>

                      <Space size={8}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary, #8c8c8c)' }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          {stepTime}
                        </span>
                        <Tag color={stepFailed ? 'error' : stepSucceeded ? 'success' : 'processing'}>
                          {step.status}
                        </Tag>
                      </Space>
                    </div>

                    {/* If step has error message */}
                    {step.errorMessage && (
                      <div
                        style={{
                          margin: '8px 0',
                          padding: '8px 12px',
                          background: 'rgba(255, 77, 79, 0.08)',
                          borderLeft: '3px solid #ff4d4f',
                          borderRadius: 4,
                          color: '#cf1322',
                          fontSize: 12.5,
                          fontFamily: 'monospace',
                        }}
                      >
                        <b>报错现场:</b> {step.errorMessage}
                      </div>
                    )}

                    {/* Step input / output details (collapsible) */}
                    {(step.input || step.output) && (
                      <Collapse ghost size="small" style={{ marginTop: 4 }}>
                        <Panel header={<span style={{ fontSize: 11, color: '#8c8c8c' }}>展开输入与输出 Payload</span>} key="payload">
                          {step.input && (
                            <div style={{ marginBottom: 6 }}>
                              <Text type="secondary" style={{ fontSize: 11 }}>Input:</Text>
                              <pre style={{ margin: 0, fontSize: 11, padding: 8, background: 'rgba(0,0,0,0.03)', borderRadius: 4 }}>
                                {typeof step.input === 'string' ? step.input : JSON.stringify(step.input, null, 2)}
                              </pre>
                            </div>
                          )}
                          {step.output && (
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>Output:</Text>
                              <pre style={{ margin: 0, fontSize: 11, padding: 8, background: 'rgba(0,0,0,0.03)', borderRadius: 4 }}>
                                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                              </pre>
                            </div>
                          )}
                        </Panel>
                      </Collapse>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Stage 3: 执行结果与故障现场 */}
        <Panel
          key="stage-3"
          header={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '96%', alignItems: 'center' }}>
              <Space size={8}>
                <ThunderboltOutlined style={{ color: isFailed ? '#ff4d4f' : '#52c41a', fontSize: 16 }} />
                <Text strong style={{ fontSize: 14 }}>
                  阶段 3: 执行结果与故障现场 (Result & Error Diagnostics)
                </Text>
              </Space>
              <Tag color={isFailed ? 'red' : isSucceeded ? 'green' : 'blue'}>
                {isFailed ? '失败现场' : '成功返回'}
              </Tag>
            </div>
          }
        >
          {isFailed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Descriptions size="small" bordered column={1}>
                <Descriptions.Item label="故障代码 (Failure Code)">
                  <Text code style={{ color: '#cf1322' }}>{execution.failureCode || 'EXECUTION_FAILED'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="故障归因 (Failure Reason)">
                  <Text type="danger" strong>{execution.failureReason || '未知故障原因'}</Text>
                </Descriptions.Item>
              </Descriptions>

              {execution.result && (
                <div>
                  <Text strong style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>原始结果/异常 Payload:</Text>
                  <pre
                    style={{
                      background: '#0d1117',
                      color: '#ff7b72',
                      padding: 12,
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.5,
                      maxHeight: 280,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {typeof execution.result === 'string'
                      ? execution.result
                      : JSON.stringify(execution.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="工单执行顺利完成"
                description="调用链各项步骤均返回预期数据。"
                style={{ marginBottom: 12, borderRadius: 8 }}
              />
              <pre
                style={{
                  background: 'var(--bg-secondary, #f8fafc)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.5,
                  maxHeight: 280,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {typeof execution.result === 'string'
                  ? execution.result
                  : JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          )}
        </Panel>
      </Collapse>
    </div>
  );
};
