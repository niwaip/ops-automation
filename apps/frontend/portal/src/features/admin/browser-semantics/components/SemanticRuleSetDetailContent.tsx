import React, { useMemo } from 'react';
import { Button, Card, Descriptions, Empty, Input, List, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type {
  SemanticRuleErrorLog,
  SemanticRuleCategory,
  SemanticRule,
  SemanticRuleHitLog,
  SemanticRuleReleaseRecord,
  SemanticRuleSet,
} from '@/api/browser-semantics';
import { renderJsonText, renderTargetingSummary } from '../lib/ruleSetForm';

const { Paragraph, Text } = Typography;

interface SemanticRuleSetDetailContentProps {
  ruleSet: SemanticRuleSet;
  headerActions?: React.ReactNode;
  hitLogs: SemanticRuleHitLog[];
  hitLogsLoading: boolean;
  onRefreshHitLogs: () => void;
  hitLogTraceId: string;
  onHitLogTraceIdChange: (value: string) => void;
  onApplyHitLogFilter: () => void;
  onResetHitLogFilter: () => void;
  errorLogs: SemanticRuleErrorLog[];
  errorLogsLoading: boolean;
  onRefreshErrorLogs: () => void;
  releases: SemanticRuleReleaseRecord[];
  releasesLoading: boolean;
  onRefreshReleases: () => void;
  onGenerateCategoryDraft?: (category: SemanticRuleCategory) => void;
  generatingCategory?: SemanticRuleCategory | null;
  generateCategoryLoading?: boolean;
  onReplaceRuleCategory?: (category: SemanticRuleCategory) => void;
  replacingCategory?: SemanticRuleCategory | null;
  replaceCategoryLoading?: boolean;
}

const renderRuleItem = (rule: SemanticRule) => (
  <Card
    key={rule.id}
    size="small"
    style={{ marginBottom: 12, borderRadius: 10 }}
    title={
      <Space>
        <span>{rule.name}</span>
        {rule.category ? <Tag color="purple">{rule.category}</Tag> : null}
        <Tag>{rule.type}</Tag>
        <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '启用' : '禁用'}</Tag>
      </Space>
    }
  >
    <Descriptions column={2} size="small">
      <Descriptions.Item label="优先级">{rule.priority}</Descriptions.Item>
      <Descriptions.Item label="停止匹配">{rule.stopOnMatch ? '是' : '否'}</Descriptions.Item>
      <Descriptions.Item label="能力类别">{rule.category || '-'}</Descriptions.Item>
      <Descriptions.Item label="Flags">{rule.flags || '-'}</Descriptions.Item>
      <Descriptions.Item label="Pattern 数量">
        {Array.isArray(rule.patterns) ? rule.patterns.length : 0}
      </Descriptions.Item>
    </Descriptions>
    <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
      <Text strong>Patterns</Text>
    </Paragraph>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderJsonText(rule.patterns)}</pre>
    <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
      <Text strong>Outputs</Text>
    </Paragraph>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderJsonText(rule.outputs)}</pre>
  </Card>
);

const getRuleCategoryLabel = (rule: SemanticRule) => rule.category || 'UNCATEGORIZED';

const renderHitLogItem = (log: SemanticRuleHitLog) => (
  <List.Item key={log.id}>
    <List.Item.Meta
      title={
        <Space wrap>
          <span>{new Date(log.createdAt).toLocaleString()}</span>
          <Tag color={log.usedAiFallback ? 'processing' : 'default'}>
            {log.usedAiFallback ? 'AI 兜底' : '规则命中'}
          </Tag>
          {log.finalExecutionSuccess !== undefined && log.finalExecutionSuccess !== null ? (
            <Tag color={log.finalExecutionSuccess ? 'success' : 'error'}>
              {log.finalExecutionSuccess ? '执行成功' : '执行失败'}
            </Tag>
          ) : null}
          {log.pageType ? <Tag>{log.pageType}</Tag> : null}
        </Space>
      }
      description={
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text>
            <Text strong>原始输入：</Text>
            {log.inputText || '-'}
          </Text>
          <Text>
            <Text strong>归一化输入：</Text>
            {log.normalizedInput || '-'}
          </Text>
          <Text>
            <Text strong>Trace ID：</Text>
            {log.traceId || '-'}
          </Text>
          <Text>
            <Text strong>命中规则：</Text>
            {log.matchedRuleIds?.length ? log.matchedRuleIds.join(', ') : '-'}
          </Text>
          {log.normalizedSemantic ? (
            <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
              {renderJsonText(log.normalizedSemantic)}
            </pre>
          ) : null}
        </Space>
      }
    />
  </List.Item>
);

const renderErrorLogItem = (log: SemanticRuleErrorLog) => (
  <List.Item key={log.id}>
    <List.Item.Meta
      title={
        <Space wrap>
          <span>{new Date(log.createdAt).toLocaleString()}</span>
          <Tag color="error">{log.errorType}</Tag>
          <Tag>{log.source}</Tag>
          {log.pageType ? <Tag>{log.pageType}</Tag> : null}
          {log.host ? <Tag>{log.host}</Tag> : null}
        </Space>
      }
      description={
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text>
            <Text strong>错误信息：</Text>
            {log.errorMessage}
          </Text>
          <Text>
            <Text strong>原始输入：</Text>
            {log.inputText || '-'}
          </Text>
          <Text>
            <Text strong>Trace ID：</Text>
            {log.traceId || '-'}
          </Text>
          <Text>
            <Text strong>会话链路：</Text>
            {log.sessionId || '-'} / {log.taskId || '-'} / {log.stepId || '-'}
          </Text>
          {log.observationSummary ? (
            <Text>
              <Text strong>Observation：</Text>
              {log.observationSummary}
            </Text>
          ) : null}
        </Space>
      }
    />
  </List.Item>
);

const SemanticRuleSetDetailContent: React.FC<SemanticRuleSetDetailContentProps> = ({
  ruleSet,
  headerActions,
  hitLogs,
  hitLogsLoading,
  onRefreshHitLogs,
  hitLogTraceId,
  onHitLogTraceIdChange,
  onApplyHitLogFilter,
  onResetHitLogFilter,
  errorLogs,
  errorLogsLoading,
  onRefreshErrorLogs,
  releases,
  releasesLoading,
  onRefreshReleases,
  onGenerateCategoryDraft,
  generatingCategory,
  generateCategoryLoading,
  onReplaceRuleCategory,
  replacingCategory,
  replaceCategoryLoading,
}) => {
  const groupedRules = useMemo(() => {
    const groups = new Map<string, SemanticRule[]>();

    for (const rule of ruleSet.rules) {
      const category = getRuleCategoryLabel(rule);
      const currentGroup = groups.get(category) || [];
      currentGroup.push(rule);
      groups.set(category, currentGroup);
    }

    return Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [ruleSet.rules]);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" extra={headerActions}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Key">{ruleSet.key}</Descriptions.Item>
          <Descriptions.Item label="名称">{ruleSet.name}</Descriptions.Item>
          <Descriptions.Item label="版本">{ruleSet.version}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag>{ruleSet.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Domain">{ruleSet.domain?.code || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建人">{ruleSet.createdBy}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(ruleSet.createdAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {new Date(ruleSet.updatedAt).toLocaleString()}
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {ruleSet.description || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title={`规则列表 (${ruleSet.rules.length})`}>
        {ruleSet.rules.length ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {groupedRules.map(([category, rules]) => (
              <Card
                key={category}
                size="small"
                type="inner"
                title={
                  <Space wrap>
                    <span>{category}</span>
                    <Tag>{rules.length} 条</Tag>
                  </Space>
                }
                extra={
                  category !== 'UNCATEGORIZED' ? (
                    <Space>
                      {onGenerateCategoryDraft ? (
                        <Button
                          size="small"
                          onClick={() => onGenerateCategoryDraft(category as SemanticRuleCategory)}
                          loading={generateCategoryLoading && generatingCategory === category}
                        >
                          AI 草案
                        </Button>
                      ) : null}
                      {onReplaceRuleCategory ? (
                        <Button
                          size="small"
                          onClick={() => onReplaceRuleCategory(category as SemanticRuleCategory)}
                          loading={replaceCategoryLoading && replacingCategory === category}
                        >
                          替换该类
                        </Button>
                      ) : null}
                    </Space>
                  ) : null
                }
              >
                {rules.map(renderRuleItem)}
              </Card>
            ))}
          </Space>
        ) : (
          <Empty description="暂无规则" />
        )}
      </Card>

      <Card size="small" title={`Targeting 列表 (${ruleSet.targetings?.length || 0})`}>
        {ruleSet.targetings?.length ? (
          <List
            dataSource={ruleSet.targetings}
            renderItem={(targeting) => (
              <List.Item key={targeting.id}>
                <List.Item.Meta
                  title={
                    <Space>
                      <span>{renderTargetingSummary(targeting)}</span>
                      <Tag color={targeting.enabled ? 'success' : 'default'}>
                        {targeting.enabled ? '启用' : '禁用'}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Text type="secondary">
                        environments: {renderJsonText(targeting.environments)}
                      </Text>
                      <Text type="secondary">hosts: {renderJsonText(targeting.hosts)}</Text>
                      <Text type="secondary">
                        pageTypes: {renderJsonText(targeting.pageTypes)}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Paragraph style={{ marginBottom: 0 }}>
            未配置 targeting，当前规则集会作为全局 fallback 候选。
          </Paragraph>
        )}
      </Card>

      <Card
        size="small"
        title={`命中日志 (${hitLogs.length})`}
        extra={
          <Space wrap>
            <Input
              size="small"
              style={{ width: 220 }}
              value={hitLogTraceId}
              placeholder="按 traceId 过滤"
              onChange={(event) => onHitLogTraceIdChange(event.target.value)}
              onPressEnter={onApplyHitLogFilter}
            />
            <Button size="small" onClick={onApplyHitLogFilter}>
              应用过滤
            </Button>
            <Button size="small" onClick={onResetHitLogFilter}>
              清空
            </Button>
            <Button size="small" icon={<ReloadOutlined />} onClick={onRefreshHitLogs}>
              刷新日志
            </Button>
          </Space>
        }
      >
        {hitLogsLoading ? (
          <Card size="small" loading />
        ) : hitLogs.length ? (
          <List itemLayout="vertical" dataSource={hitLogs} renderItem={renderHitLogItem} />
        ) : (
          <Paragraph style={{ marginBottom: 0 }}>该规则集最近暂无命中日志。</Paragraph>
        )}
      </Card>

      <Card
        size="small"
        title={`错误日志 (${errorLogs.length})`}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefreshErrorLogs}>
            刷新错误
          </Button>
        }
      >
        {errorLogsLoading ? (
          <Card size="small" loading />
        ) : errorLogs.length ? (
          <List itemLayout="vertical" dataSource={errorLogs} renderItem={renderErrorLogItem} />
        ) : (
          <Paragraph style={{ marginBottom: 0 }}>该规则集最近暂无关联错误日志。</Paragraph>
        )}
      </Card>

      <Card
        size="small"
        title={`发布历史 (${releases.length})`}
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefreshReleases}>
            刷新历史
          </Button>
        }
      >
        {releasesLoading ? (
          <Card size="small" loading />
        ) : releases.length ? (
          <List
            dataSource={releases}
            renderItem={(release) => (
              <List.Item key={release.id}>
                <List.Item.Meta
                  title={
                    <Space wrap>
                      <span>{new Date(release.triggeredAt).toLocaleString()}</span>
                      <Tag color={release.releaseMode === 'ROLLBACK' ? 'warning' : 'processing'}>
                        {release.releaseMode}
                      </Tag>
                      <Tag>
                        {release.fromStatus} {'->'} {release.toStatus}
                      </Tag>
                      {release.ruleSet?.version ? <Tag>{release.ruleSet.version}</Tag> : null}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Text>
                        <Text strong>发布人：</Text>
                        {release.releasedBy}
                      </Text>
                      <Text>
                        <Text strong>说明：</Text>
                        {release.releaseNote || '-'}
                      </Text>
                      <Text>
                        <Text strong>规则集：</Text>
                        {release.ruleSet?.name || release.ruleSetId}
                      </Text>
                      {release.previousActiveRuleSetId ? (
                        <Text>
                          <Text strong>回滚目标：</Text>
                          {release.previousActiveRuleSetId}
                        </Text>
                      ) : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Paragraph style={{ marginBottom: 0 }}>当前规则集家族暂无发布历史。</Paragraph>
        )}
      </Card>
    </Space>
  );
};

export default SemanticRuleSetDetailContent;
