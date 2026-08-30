import React from 'react';
import {
  Card,
  Collapse,
  Descriptions,
  Empty,
  Space,
  Tag,
  Typography,
  theme as antdTheme,
} from 'antd';
import { BrowserRunOutputCard } from './BrowserRunOutputCard';

const { Text, Paragraph } = Typography;

type RecorderOutcomeKind = 'action' | 'answer' | 'question';
type RecorderOutcomeStatus = 'succeeded' | 'partial' | 'blocked' | 'failed' | 'unknown';

interface RecorderDebugObservation {
  currentPageUrl?: string;
  title?: string;
  text?: string;
  snapshotPath?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotContentHash?: string;
  observationFingerprint?: string;
  reuseEligibility?: 'fresh' | 'stale' | 'reobserve-required';
  staleReason?: string;
  capturedAt?: string;
}

interface MCPCommand {
  tool: string;
  params: Record<string, unknown>;
  description?: string;
  locator?: {
    strategy?: string;
    value?: string;
    expression?: string;
    role?: string;
    name?: string;
  };
}

interface BrowserExecuteResponse {
  success?: boolean;
  recovered?: boolean;
  recovery?: {
    code?: string;
    expectedUrl?: string;
    observedUrl?: string;
  };
  message?: string;
  results?: Array<Record<string, unknown>>;
  steps?: Array<Record<string, unknown>>;
  executedCommands?: MCPCommand[];
  browserRunOutput?: Record<string, unknown>;
}

interface RecorderVerificationCheck {
  code: string;
  passed: boolean | 'partial' | 'unknown';
  message: string;
  required?: boolean;
  weight?: number;
  evidencePath?: string;
}

interface RecorderVerification {
  verifier: string;
  routeReason: 'actionType' | 'goal-pattern' | 'command-family' | 'fallback';
  level: 'tool' | 'page' | 'goal';
  success: boolean | 'partial' | 'unknown';
  confidence: number;
  checks: RecorderVerificationCheck[];
  failureReason?: string;
}

interface RecorderOutcome {
  kind: RecorderOutcomeKind;
  status: RecorderOutcomeStatus;
  intent?: Record<string, unknown>;
  evidence?: {
    before?: RecorderDebugObservation;
    after?: RecorderDebugObservation;
    diff?: Record<string, unknown>;
    toolExecution?: Record<string, unknown>;
  };
  grounding?: Record<string, unknown>;
  verification: RecorderVerification;
  summary: {
    userVisible: string;
    compact: string;
    nextHint?: string;
  };
  artifacts?: {
    snapshotIdBefore?: string;
    snapshotIdAfter?: string;
    snapshotPathBefore?: string;
    snapshotPathAfter?: string;
    screenshotBefore?: string;
    screenshotAfter?: string;
  };
}

interface RecorderOutcomeRawData {
  reply?: string;
  observation?: RecorderDebugObservation;
  execution?: BrowserExecuteResponse;
  commands?: MCPCommand[];
}

interface RecorderOutcomeDetailCardProps {
  title: string;
  outcome: RecorderOutcome;
  raw?: RecorderOutcomeRawData;
}

const outcomeStatusMeta: Record<RecorderOutcomeStatus, { color: string; label: string }> = {
  succeeded: { color: 'success', label: '已成功' },
  partial: { color: 'processing', label: '部分成功' },
  blocked: { color: 'warning', label: '被阻塞' },
  failed: { color: 'error', label: '已失败' },
  unknown: { color: 'default', label: '待确认' },
};

const outcomeKindLabelMap: Record<RecorderOutcomeKind, string> = {
  action: '动作结果',
  answer: '观察回答',
  question: '追问澄清',
};

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

const formatTimestamp = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const formatConfidence = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value * 100)}%`;
};

const getVerificationMeta = (
  success?: RecorderVerification['success']
): { color: string; label: string } => {
  if (success === true) {
    return { color: 'success', label: '验证通过' };
  }
  if (success === false) {
    return { color: 'error', label: '验证失败' };
  }
  if (success === 'partial') {
    return { color: 'processing', label: '部分验证' };
  }
  return { color: 'default', label: '验证未知' };
};

const getCheckMeta = (
  passed: RecorderVerificationCheck['passed']
): { color: string; label: string } => {
  if (passed === true) {
    return { color: 'success', label: '通过' };
  }
  if (passed === false) {
    return { color: 'error', label: '失败' };
  }
  if (passed === 'partial') {
    return { color: 'processing', label: '部分通过' };
  }
  return { color: 'default', label: '待确认' };
};

const CodeBlock: React.FC<{ value: unknown }> = ({ value }) => {
  const { token } = antdTheme.useToken();

  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 8,
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorText,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {typeof value === 'string' ? value : formatJson(value)}
    </pre>
  );
};

const ObservationDigest: React.FC<{
  title: string;
  observation?: RecorderDebugObservation;
}> = ({ title, observation }) => {
  if (!observation) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 observation" />
      </Card>
    );
  }

  return (
    <Card size="small" title={title}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="页面 URL">{observation.currentPageUrl || '-'}</Descriptions.Item>
        <Descriptions.Item label="页面标题">{observation.title || '-'}</Descriptions.Item>
        <Descriptions.Item label="Snapshot ID">{observation.snapshotId || '-'}</Descriptions.Item>
        <Descriptions.Item label="Snapshot Version">
          {observation.snapshotVersion ?? '-'}
        </Descriptions.Item>
        <Descriptions.Item label="可复用状态">
          {observation.reuseEligibility || '-'}
        </Descriptions.Item>
        <Descriptions.Item label="失效原因">{observation.staleReason || '-'}</Descriptions.Item>
        <Descriptions.Item label="采样时间">
          {formatTimestamp(observation.capturedAt)}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

const RecorderOutcomeDetailCard: React.FC<RecorderOutcomeDetailCardProps> = ({
  title,
  outcome,
  raw,
}) => {
  const verificationMeta = getVerificationMeta(outcome.verification?.success);
  const checks = Array.isArray(outcome.verification?.checks) ? outcome.verification.checks : [];
  const failedChecks = checks.filter((check) => check.passed === false);
  const unknownChecks = checks.filter(
    (check) => check.passed === 'unknown' || check.passed === 'partial'
  );
  const grounding = outcome.grounding || {};
  const chosenTarget =
    grounding && typeof grounding === 'object' && 'chosenTarget' in grounding
      ? grounding.chosenTarget
      : undefined;
  const targetCandidates =
    grounding && typeof grounding === 'object' && 'targetCandidates' in grounding
      ? grounding.targetCandidates
      : undefined;
  const targetResolution =
    grounding && typeof grounding === 'object' && 'targetResolution' in grounding
      ? grounding.targetResolution
      : undefined;

  return (
    <Card size="small" title={title}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small" title="Outcome 概览">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={outcomeStatusMeta[outcome.status].color}>
                {outcomeStatusMeta[outcome.status].label}
              </Tag>
              <Tag>{outcomeKindLabelMap[outcome.kind]}</Tag>
              <Tag color={verificationMeta.color}>{verificationMeta.label}</Tag>
              {outcome.evidence?.toolExecution?.recovered === true ? (
                <Tag color="gold">已恢复（页面状态校准）</Tag>
              ) : null}
              <Tag color="blue">置信度 {formatConfidence(outcome.verification?.confidence)}</Tag>
              <Tag>Verifier: {outcome.verification?.verifier || '-'}</Tag>
            </Space>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="面向用户结果">
                {outcome.summary?.userVisible || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="紧凑摘要">
                {outcome.summary?.compact || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="下一步建议">
                {outcome.summary?.nextHint || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="失败原因">
                {outcome.verification?.failureReason || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="验证级别">
                {outcome.verification?.level || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="路由原因">
                {outcome.verification?.routeReason || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="用户目标">
                {typeof outcome.intent?.userGoal === 'string' ? outcome.intent.userGoal : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标提示">
                {typeof outcome.intent?.targetHint === 'string' ? outcome.intent.targetHint : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Space>
        </Card>

        <Card size="small" title="Evidence 面板">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Tag>Before: {outcome.evidence?.before ? '有' : '无'}</Tag>
              <Tag>After: {outcome.evidence?.after ? '有' : '无'}</Tag>
              <Tag>Diff: {outcome.evidence?.diff ? '有' : '无'}</Tag>
              <Tag>Tool: {outcome.evidence?.toolExecution ? '有' : '无'}</Tag>
            </Space>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <ObservationDigest title="Before Observation" observation={outcome.evidence?.before} />
              <ObservationDigest title="After Observation" observation={outcome.evidence?.after} />
            </Space>
            <Collapse
              size="small"
              items={[
                {
                  key: 'diff',
                  label: 'Observation Diff',
                  children: outcome.evidence?.diff ? (
                    <CodeBlock value={outcome.evidence.diff} />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 diff" />
                  ),
                },
                {
                  key: 'tool-execution',
                  label: 'Tool Execution',
                  children: outcome.evidence?.toolExecution ? (
                    <CodeBlock value={outcome.evidence.toolExecution} />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 tool execution" />
                  ),
                },
              ]}
            />
          </Space>
        </Card>

        <BrowserRunOutputCard
          value={raw?.execution?.browserRunOutput || outcome.evidence?.toolExecution}
        />

        <Card size="small" title="Checks 面板">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="default">总数 {checks.length}</Tag>
              <Tag color={failedChecks.length > 0 ? 'error' : 'default'}>
                失败 {failedChecks.length}
              </Tag>
              <Tag color={unknownChecks.length > 0 ? 'processing' : 'default'}>
                待确认/部分 {unknownChecks.length}
              </Tag>
            </Space>
            {checks.length > 0 ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {checks.map((check, index) => {
                  const meta = getCheckMeta(check.passed);
                  return (
                    <Card
                      key={`${check.code}-${index}`}
                      size="small"
                      type="inner"
                      title={
                        <Space wrap>
                          <Tag color={meta.color}>{meta.label}</Tag>
                          <Text strong>{check.code}</Text>
                          {check.required ? <Tag color="red">required</Tag> : null}
                          {typeof check.weight === 'number' ? <Tag>weight {check.weight}</Tag> : null}
                        </Space>
                      }
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Paragraph style={{ marginBottom: 0 }}>{check.message}</Paragraph>
                        <Text type="secondary">
                          Evidence Path: {check.evidencePath || '-'}
                        </Text>
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 checks" />
            )}
          </Space>
        </Card>

        <Card size="small" title="Grounding 面板">
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Target Resolution">
                {typeof targetResolution === 'string' ? targetResolution : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="候选数量">
                {Array.isArray(targetCandidates) ? targetCandidates.length : 0}
              </Descriptions.Item>
            </Descriptions>
            <Collapse
              size="small"
              items={[
                {
                  key: 'chosen-target',
                  label: 'Chosen Target',
                  children: chosenTarget ? (
                    <CodeBlock value={chosenTarget} />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 chosen target" />
                  ),
                },
                {
                  key: 'target-candidates',
                  label: 'Target Candidates',
                  children:
                    Array.isArray(targetCandidates) && targetCandidates.length > 0 ? (
                      <CodeBlock value={targetCandidates} />
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 target candidates" />
                    ),
                },
              ]}
            />
          </Space>
        </Card>

        <Card size="small" title="Raw 面板">
          <Collapse
            size="small"
            items={[
              {
                key: 'raw-reply',
                label: 'Reply',
                children: raw?.reply ? (
                  <CodeBlock value={raw.reply} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 reply" />
                ),
              },
              {
                key: 'raw-observation',
                label: 'Observation',
                children: raw?.observation ? (
                  <CodeBlock value={raw.observation} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 observation" />
                ),
              },
              {
                key: 'raw-execution',
                label: 'Execution',
                children: raw?.execution ? (
                  <CodeBlock value={raw.execution} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 execution" />
                ),
              },
              {
                key: 'raw-commands',
                label: 'Commands',
                children:
                  Array.isArray(raw?.commands) && raw.commands.length > 0 ? (
                    <CodeBlock value={raw.commands} />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 commands" />
                  ),
              },
              {
                key: 'raw-outcome',
                label: 'Outcome JSON',
                children: <CodeBlock value={outcome} />,
              },
            ]}
          />
        </Card>
      </Space>
    </Card>
  );
};

export default RecorderOutcomeDetailCard;
