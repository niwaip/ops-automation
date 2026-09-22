import type {
  SemanticRule,
  SemanticRuleCategory,
  SemanticRuleErrorLog,
  SemanticRuleHitLog,
  SemanticRuleReleaseRecord,
  SemanticRuleSet,
} from '@/api/browser-semantics';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Empty, Input, List, Space, Tag, Typography } from 'antd';
import React, { useMemo } from 'react';
import { renderJsonText, renderTargetingSummary } from '../lib/ruleSetForm';
import {
  getActionHitMetadata,
  getActionLogReasonLabel,
  getActionLogStatusLabel,
  getEmptyRuleStateCopy,
  getLoginLogMetadata,
  getNavigationHitMetadata,
  getNavigationLogReasonLabel,
  getNavigationLogStatusLabel,
  getReadHitMetadata,
  getReadLogReasonLabel,
  getReadLogStatusLabel,
  getSemanticRuleCategoryLabel,
} from '../lib/semanticRulePresentation';
import {
  renderErrorLogItem,
  renderHitLogItem,
  renderRuleItem,
} from './SemanticRuleSetDetailRenderers';

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

const getRuleCategoryLabel = (rule: SemanticRule) =>
  rule.category ? getSemanticRuleCategoryLabel(rule.category) : '未分类';

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
  const hasLoginRules = useMemo(
    () => ruleSet.rules.some((rule) => (rule.category || 'GENERIC_ALIAS') === 'LOGIN'),
    [ruleSet.rules]
  );
  const hasNavigationRules = useMemo(
    () => ruleSet.rules.some((rule) => (rule.category || 'GENERIC_ALIAS') === 'NAVIGATION'),
    [ruleSet.rules]
  );
  const hasReadRules = useMemo(
    () => ruleSet.rules.some((rule) => (rule.category || 'GENERIC_ALIAS') === 'READ_VALUE'),
    [ruleSet.rules]
  );
  const hasActionRules = useMemo(
    () =>
      ruleSet.rules.some((rule) => {
        const category = rule.category || 'GENERIC_ALIAS';
        return (
          category === 'DETAIL_OPEN' || category === 'ROW_ACTION' || category === 'MENU_SELECTION'
        );
      }),
    [ruleSet.rules]
  );
  const navigationHitStatusDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const status = getNavigationHitMetadata(log)?.status;
      if (!status) {
        continue;
      }
      counts.set(status, (counts.get(status) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const navigationHitReasonDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const reason = getNavigationHitMetadata(log)?.reason;
      if (!reason) {
        continue;
      }
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const navigationHitTargetDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const resolvedTarget = getNavigationHitMetadata(log)?.resolvedTarget;
      if (!resolvedTarget) {
        continue;
      }
      counts.set(resolvedTarget, (counts.get(resolvedTarget) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [hitLogs]);
  const readHitStatusDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const status = getReadHitMetadata(log)?.status;
      if (!status) {
        continue;
      }
      counts.set(status, (counts.get(status) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const readHitReasonDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const reason = getReadHitMetadata(log)?.reason;
      if (!reason) {
        continue;
      }
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const readHitTargetDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const resolvedTarget = getReadHitMetadata(log)?.resolvedTarget;
      if (!resolvedTarget) {
        continue;
      }
      counts.set(resolvedTarget, (counts.get(resolvedTarget) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [hitLogs]);
  const actionHitStatusDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const status = getActionHitMetadata(log)?.status;
      if (!status) {
        continue;
      }
      counts.set(status, (counts.get(status) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const actionHitReasonDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const reason = getActionHitMetadata(log)?.reason;
      if (!reason) {
        continue;
      }
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const actionHitTargetDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const resolvedTarget = getActionHitMetadata(log)?.resolvedTarget;
      if (!resolvedTarget) {
        continue;
      }
      counts.set(resolvedTarget, (counts.get(resolvedTarget) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8);
  }, [hitLogs]);
  const actionHitCategoryDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of hitLogs) {
      const categoryHint = getActionHitMetadata(log)?.categoryHint;
      if (!categoryHint) {
        continue;
      }
      counts.set(categoryHint, (counts.get(categoryHint) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [hitLogs]);
  const loginErrorStatusDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of errorLogs) {
      const status = getLoginLogMetadata(log)?.status;
      if (!status) {
        continue;
      }
      counts.set(status, (counts.get(status) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [errorLogs]);
  const loginErrorReasonDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of errorLogs) {
      const reason = getLoginLogMetadata(log)?.reason;
      if (!reason) {
        continue;
      }
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
  }, [errorLogs]);

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
          <Empty
            description={
              <Space direction="vertical" size={8}>
                <Text strong>{getEmptyRuleStateCopy().title}</Text>
                <Text type="secondary">{getEmptyRuleStateCopy().description}</Text>
              </Space>
            }
          />
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
                      <Text type="secondary">pageTypes: {renderJsonText(targeting.pageTypes)}</Text>
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
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {hasNavigationRules ? (
              <Card size="small" style={{ borderRadius: 10 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text strong>NAVIGATION 命中分布摘要</Text>
                  <div>
                    <Text type="secondary">状态分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {navigationHitStatusDistribution.length ? (
                          navigationHitStatusDistribution.map((item) => (
                            <Tag key={`nav-hit-status-${item.label}`} color="processing">
                              {getNavigationLogStatusLabel(item.label)} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 NAVIGATION 命中状态分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">原因分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {navigationHitReasonDistribution.length ? (
                          navigationHitReasonDistribution.map((item) => (
                            <Tag key={`nav-hit-reason-${item.label}`} color="gold">
                              {getNavigationLogReasonLabel(item.label)} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 NAVIGATION 命中原因分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">目标分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {navigationHitTargetDistribution.length ? (
                          navigationHitTargetDistribution.map((item) => (
                            <Tag key={`nav-hit-target-${item.label}`} color="blue">
                              {item.label} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 NAVIGATION 目标分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </Space>
              </Card>
            ) : null}
            {hasReadRules ? (
              <Card size="small" style={{ borderRadius: 10 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text strong>READ 命中分布摘要</Text>
                  <div>
                    <Text type="secondary">状态分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {readHitStatusDistribution.length ? (
                          readHitStatusDistribution.map((item) => (
                            <Tag key={`read-hit-status-${item.label}`} color="processing">
                              {getReadLogStatusLabel(item.label)} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 READ 命中状态分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">原因分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {readHitReasonDistribution.length ? (
                          readHitReasonDistribution.map((item) => (
                            <Tag key={`read-hit-reason-${item.label}`} color="gold">
                              {getReadLogReasonLabel(item.label)} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 READ 命中原因分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">目标分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {readHitTargetDistribution.length ? (
                          readHitTargetDistribution.map((item) => (
                            <Tag key={`read-hit-target-${item.label}`} color="cyan">
                              {item.label} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 READ 目标分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </Space>
              </Card>
            ) : null}
            {hasActionRules ? (
              <Card size="small" style={{ borderRadius: 10 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text strong>ACTION 命中分布摘要</Text>
                  <div>
                    <Text type="secondary">状态分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {actionHitStatusDistribution.length ? (
                          actionHitStatusDistribution.map((item) => (
                            <Tag key={`action-hit-status-${item.label}`} color="processing">
                              {getActionLogStatusLabel(item.label)} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 ACTION 命中状态分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">原因分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {actionHitReasonDistribution.length ? (
                          actionHitReasonDistribution.map((item) => (
                            <Tag key={`action-hit-reason-${item.label}`} color="gold">
                              {getActionLogReasonLabel(item.label)} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 ACTION 命中原因分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">目标分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {actionHitTargetDistribution.length ? (
                          actionHitTargetDistribution.map((item) => (
                            <Tag key={`action-hit-target-${item.label}`} color="volcano">
                              {item.label} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 ACTION 目标分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">类别分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {actionHitCategoryDistribution.length ? (
                          actionHitCategoryDistribution.map((item) => (
                            <Tag key={`action-hit-category-${item.label}`} color="geekblue">
                              {item.label} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 ACTION 类别分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </Space>
              </Card>
            ) : null}
            <List itemLayout="vertical" dataSource={hitLogs} renderItem={renderHitLogItem} />
          </Space>
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
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {hasLoginRules ? (
              <Card size="small" style={{ borderRadius: 10 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Text strong>LOGIN 样本分布摘要</Text>
                  <div>
                    <Text type="secondary">状态分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {loginErrorStatusDistribution.length ? (
                          loginErrorStatusDistribution.map((item) => (
                            <Tag key={`status-${item.label}`} color="processing">
                              {item.label} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 LOGIN 状态分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">原因分布</Text>
                    <div style={{ marginTop: 6 }}>
                      <Space wrap>
                        {loginErrorReasonDistribution.length ? (
                          loginErrorReasonDistribution.map((item) => (
                            <Tag key={`reason-${item.label}`} color="gold">
                              {item.label} ({item.count})
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无 LOGIN reason 分布</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </Space>
              </Card>
            ) : null}
            <List itemLayout="vertical" dataSource={errorLogs} renderItem={renderErrorLogItem} />
          </Space>
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
