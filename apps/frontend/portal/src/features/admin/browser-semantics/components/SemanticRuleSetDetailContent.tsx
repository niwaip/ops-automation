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
import {
  getActionHitMetadata,
  getActionLogMetadata,
  getActionLogReasonLabel,
  getActionLogStatusLabel,
  getActionProfileBadges,
  getActionProfileSections,
  getEmptyRuleStateCopy,
  getFieldFillHitMetadata,
  getFieldFillLogMetadata,
  getFieldFillProfileBadges,
  getFieldFillProfileSections,
  getLoginHitMetadata,
  getLoginLogMetadata,
  getLoginProfileInterruptPolicy,
  getLoginProfileSections,
  getNavigationHitMetadata,
  getNavigationLogMetadata,
  getNavigationLogReasonLabel,
  getNavigationLogStatusLabel,
  getNavigationProfileDestinations,
  getNavigationProfileSections,
  getReadHitMetadata,
  getReadLogMetadata,
  getReadLogReasonLabel,
  getReadLogStatusLabel,
  getReadProfileSections,
  getSearchHitMetadata,
  getSearchLogMetadata,
  getSearchProfileSections,
  getSemanticRuleCategoryLabel,
  getSemanticRuleKindColor,
  getSemanticRuleKindLabel,
  getSemanticRuleSummaryLines,
  getSemanticRuleTypeLabel,
  isActionProfileRule,
  isFieldFillProfileRule,
  isLoginProfileRule,
  isNavigationProfileRule,
  isReadProfileRule,
  isSearchProfileRule,
} from '../lib/semanticRulePresentation';

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
        {rule.category ? <Tag color="purple">{getSemanticRuleCategoryLabel(rule.category)}</Tag> : null}
        <Tag>{getSemanticRuleTypeLabel(rule.type)}</Tag>
        <Tag color={getSemanticRuleKindColor(rule)}>{getSemanticRuleKindLabel(rule)}</Tag>
        <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '启用' : '禁用'}</Tag>
      </Space>
    }
  >
    <Descriptions column={2} size="small">
      <Descriptions.Item label="优先级">{rule.priority}</Descriptions.Item>
      <Descriptions.Item label="停止匹配">{rule.stopOnMatch ? '是' : '否'}</Descriptions.Item>
      <Descriptions.Item label="能力类别">
        {rule.category ? getSemanticRuleCategoryLabel(rule.category) : '-'}
      </Descriptions.Item>
      <Descriptions.Item label="Flags">{rule.flags || '-'}</Descriptions.Item>
      <Descriptions.Item label="匹配规则数量">
        {Array.isArray(rule.patterns) ? rule.patterns.length : 0}
      </Descriptions.Item>
      <Descriptions.Item label="规则用途" span={2}>
        {getSemanticRuleSummaryLines(rule).join(' / ')}
      </Descriptions.Item>
    </Descriptions>
    <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
      <Text strong>匹配规则</Text>
    </Paragraph>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderJsonText(rule.patterns)}</pre>
    <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
      <Text strong>输出配置</Text>
    </Paragraph>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderJsonText(rule.outputs)}</pre>
    {isLoginProfileRule(rule) ? (
      <>
        <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
          <Text strong>登录画像规则摘要</Text>
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            {getLoginProfileInterruptPolicy(rule) ? (
              <Tag color="gold">interrupt_policy: {getLoginProfileInterruptPolicy(rule)}</Tag>
            ) : null}
          </Space>
          {getLoginProfileSections(rule).map((section) => (
            <div key={section.key}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 6 }}>
                <Space wrap>
                  {section.values.map((value) => (
                    <Tag key={`${section.key}-${value}`}>{value}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </>
    ) : null}
    {isNavigationProfileRule(rule) ? (
      <>
        <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
          <Text strong>导航画像规则摘要</Text>
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            {getNavigationProfileDestinations(rule).map((item) => (
              <Tag key={item.key} color="blue">
                {item.label}: {item.value}
              </Tag>
            ))}
          </Space>
          {getNavigationProfileSections(rule).map((section) => (
            <div key={section.key}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 6 }}>
                <Space wrap>
                  {section.values.map((value) => (
                    <Tag key={`${section.key}-${value}`}>{value}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </>
    ) : null}
    {isReadProfileRule(rule) ? (
      <>
        <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
          <Text strong>读取画像规则摘要</Text>
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {getReadProfileSections(rule).map((section) => (
            <div key={section.key}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 6 }}>
                <Space wrap>
                  {section.values.map((value) => (
                    <Tag key={`${section.key}-${value}`}>{value}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </>
    ) : null}
    {isActionProfileRule(rule) ? (
      <>
        <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
          <Text strong>动作画像规则摘要</Text>
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            {getActionProfileBadges(rule).map((item) => (
              <Tag key={item.key} color="volcano">
                {item.label}: {item.value}
              </Tag>
            ))}
          </Space>
          {getActionProfileSections(rule).map((section) => (
            <div key={section.key}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 6 }}>
                <Space wrap>
                  {section.values.map((value) => (
                    <Tag key={`${section.key}-${value}`}>{value}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </>
    ) : null}
    {isSearchProfileRule(rule) ? (
      <>
        <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
          <Text strong>搜索画像规则摘要</Text>
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {getSearchProfileSections(rule).map((section) => (
            <div key={section.key}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 6 }}>
                <Space wrap>
                  {section.values.map((value) => (
                    <Tag key={`${section.key}-${value}`}>{value}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </>
    ) : null}
    {isFieldFillProfileRule(rule) ? (
      <>
        <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
          <Text strong>填写画像规则摘要</Text>
        </Paragraph>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space wrap>
            {getFieldFillProfileBadges(rule).map((item) => (
              <Tag key={item.key} color="magenta">
                {item.label}: {item.value}
              </Tag>
            ))}
          </Space>
          {getFieldFillProfileSections(rule).map((section) => (
            <div key={section.key}>
              <Text strong>{section.label}</Text>
              <div style={{ marginTop: 6 }}>
                <Space wrap>
                  {section.values.map((value) => (
                    <Tag key={`${section.key}-${value}`}>{value}</Tag>
                  ))}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      </>
    ) : null}
  </Card>
);

const getRuleCategoryLabel = (rule: SemanticRule) =>
  rule.category ? getSemanticRuleCategoryLabel(rule.category) : '未分类';

const renderHitLogItem = (log: SemanticRuleHitLog) => {
  const loginMetadata = getLoginHitMetadata(log);
  const navigationMetadata = getNavigationHitMetadata(log);
  const searchMetadata = getSearchHitMetadata(log);
  const fieldFillMetadata = getFieldFillHitMetadata(log);
  const actionMetadata = getActionHitMetadata(log);
  const readMetadata = getReadHitMetadata(log);
  const parserSource =
    loginMetadata?.parserSource ||
    navigationMetadata?.parserSource ||
    readMetadata?.parserSource ||
    actionMetadata?.parserSource ||
    searchMetadata?.parserSource ||
    fieldFillMetadata?.parserSource;
  const status =
    loginMetadata?.status ||
    navigationMetadata?.status ||
    readMetadata?.status ||
    actionMetadata?.status ||
    searchMetadata?.status ||
    fieldFillMetadata?.status;
  const statusLabel = navigationMetadata
    ? getNavigationLogStatusLabel(status)
    : readMetadata
      ? getReadLogStatusLabel(status)
    : actionMetadata
      ? getActionLogStatusLabel(status)
      : status;

  return (
    <List.Item key={log.id}>
      <List.Item.Meta
        title={
          <Space wrap>
            <span>{new Date(log.createdAt).toLocaleString()}</span>
            <Tag color={log.usedAiFallback ? 'processing' : 'default'}>
              {log.usedAiFallback ? 'AI 兜底' : '规则命中'}
            </Tag>
            {parserSource ? <Tag color="blue">{parserSource}</Tag> : null}
            {status ? <Tag color="processing">{statusLabel}</Tag> : null}
            {log.finalExecutionSuccess !== undefined && log.finalExecutionSuccess !== null ? (
              <Tag color={log.finalExecutionSuccess ? 'success' : 'error'}>
                {log.finalExecutionSuccess ? '执行成功' : '执行失败'}
              </Tag>
            ) : null}
            {log.pageType ? <Tag>{log.pageType}</Tag> : null}
          </Space>
        }
        description={
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
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
            {loginMetadata ? (
              <Space wrap>
                {loginMetadata.reason ? <Tag color="gold">{loginMetadata.reason}</Tag> : null}
                {loginMetadata.effectiveLoginProfileVersion ? (
                  <Tag color="purple">
                    profile={loginMetadata.effectiveLoginProfileVersion}
                  </Tag>
                ) : null}
                {loginMetadata.filledFields.length
                  ? loginMetadata.filledFields.map((field) => (
                      <Tag key={`${log.id}-${field}`}>filled:{field}</Tag>
                    ))
                  : null}
              </Space>
            ) : null}
            {navigationMetadata ? (
              <Space wrap>
                {navigationMetadata.reason ? (
                  <Tag color="gold">
                    {getNavigationLogReasonLabel(navigationMetadata.reason)}
                  </Tag>
                ) : null}
                {navigationMetadata.effectiveNavigationProfileVersion ? (
                  <Tag color="purple">
                    profile={navigationMetadata.effectiveNavigationProfileVersion}
                  </Tag>
                ) : null}
                {navigationMetadata.resolvedTarget ? (
                  <Tag color="blue">target:{navigationMetadata.resolvedTarget}</Tag>
                ) : null}
                {navigationMetadata.resolvedUrl ? (
                  <Tag color="cyan">url:{navigationMetadata.resolvedUrl}</Tag>
                ) : null}
              </Space>
            ) : null}
            {readMetadata ? (
              <Space wrap>
                {readMetadata.reason ? (
                  <Tag color="gold">{getReadLogReasonLabel(readMetadata.reason)}</Tag>
                ) : null}
                {readMetadata.effectiveReadProfileVersion ? (
                  <Tag color="purple">profile={readMetadata.effectiveReadProfileVersion}</Tag>
                ) : null}
                {readMetadata.resolvedTarget ? (
                  <Tag color="cyan">target:{readMetadata.resolvedTarget}</Tag>
                ) : null}
                {readMetadata.resolvedField ? (
                  <Tag color="blue">field:{readMetadata.resolvedField}</Tag>
                ) : null}
                {readMetadata.resolvedRegion ? (
                  <Tag color="geekblue">region:{readMetadata.resolvedRegion}</Tag>
                ) : null}
              </Space>
            ) : null}
            {actionMetadata ? (
              <Space wrap>
                {actionMetadata.reason ? (
                  <Tag color="gold">{getActionLogReasonLabel(actionMetadata.reason)}</Tag>
                ) : null}
                {actionMetadata.effectiveActionProfileVersion ? (
                  <Tag color="purple">profile={actionMetadata.effectiveActionProfileVersion}</Tag>
                ) : null}
                {actionMetadata.resolvedTarget ? (
                  <Tag color="volcano">target:{actionMetadata.resolvedTarget}</Tag>
                ) : null}
                {actionMetadata.resolvedActionTerm ? (
                  <Tag color="orange">action:{actionMetadata.resolvedActionTerm}</Tag>
                ) : null}
                {actionMetadata.semanticHint ? (
                  <Tag color="purple">semantic:{actionMetadata.semanticHint}</Tag>
                ) : null}
                {actionMetadata.resolvedRegion ? (
                  <Tag color="cyan">region:{actionMetadata.resolvedRegion}</Tag>
                ) : null}
                {actionMetadata.resolvedRoleHint ? (
                  <Tag>role:{actionMetadata.resolvedRoleHint}</Tag>
                ) : null}
                {actionMetadata.categoryHint ? (
                  <Tag color="geekblue">category:{actionMetadata.categoryHint}</Tag>
                ) : null}
              </Space>
            ) : null}
            {searchMetadata ? (
              <Space wrap>
                {searchMetadata.reason ? <Tag color="gold">{searchMetadata.reason}</Tag> : null}
                {searchMetadata.effectiveSearchProfileVersion ? (
                  <Tag color="purple">profile={searchMetadata.effectiveSearchProfileVersion}</Tag>
                ) : null}
                {searchMetadata.intentType ? (
                  <Tag color="green">intent:{searchMetadata.intentType}</Tag>
                ) : null}
                {searchMetadata.query ? <Tag color="cyan">query:{searchMetadata.query}</Tag> : null}
                {searchMetadata.resultIndex ? (
                  <Tag color="blue">result:{searchMetadata.resultIndex}</Tag>
                ) : null}
                {searchMetadata.triggerTerm ? (
                  <Tag color="gold">term:{searchMetadata.triggerTerm}</Tag>
                ) : null}
              </Space>
            ) : null}
            {fieldFillMetadata ? (
              <Space wrap>
                {fieldFillMetadata.reason ? <Tag color="gold">{fieldFillMetadata.reason}</Tag> : null}
                {fieldFillMetadata.effectiveFieldFillProfileVersion ? (
                  <Tag color="purple">profile={fieldFillMetadata.effectiveFieldFillProfileVersion}</Tag>
                ) : null}
                {fieldFillMetadata.resolvedField ? (
                  <Tag color="magenta">field:{fieldFillMetadata.resolvedField}</Tag>
                ) : null}
                {fieldFillMetadata.resolvedCanonicalField ? (
                  <Tag color="purple">canonical:{fieldFillMetadata.resolvedCanonicalField}</Tag>
                ) : null}
                {fieldFillMetadata.resolvedRegion ? (
                  <Tag color="cyan">region:{fieldFillMetadata.resolvedRegion}</Tag>
                ) : null}
                {fieldFillMetadata.value ? (
                  <Tag color="gold">value:{fieldFillMetadata.value}</Tag>
                ) : null}
              </Space>
            ) : null}
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
};

const renderErrorLogItem = (log: SemanticRuleErrorLog) => {
  const loginMetadata = getLoginLogMetadata(log);
  const navigationMetadata = getNavigationLogMetadata(log);
  const searchMetadata = getSearchLogMetadata(log);
  const fieldFillMetadata = getFieldFillLogMetadata(log);
  const actionMetadata = getActionLogMetadata(log);
  const readMetadata = getReadLogMetadata(log);
  const status =
    loginMetadata?.status ||
    navigationMetadata?.status ||
    readMetadata?.status ||
    actionMetadata?.status ||
    searchMetadata?.status ||
    fieldFillMetadata?.status;
  const reason =
    loginMetadata?.reason ||
    navigationMetadata?.reason ||
    readMetadata?.reason ||
    actionMetadata?.reason ||
    searchMetadata?.reason ||
    fieldFillMetadata?.reason;
  const statusLabel = navigationMetadata
    ? getNavigationLogStatusLabel(status)
    : readMetadata
      ? getReadLogStatusLabel(status)
    : actionMetadata
      ? getActionLogStatusLabel(status)
      : status;
  const reasonLabel = navigationMetadata
    ? getNavigationLogReasonLabel(reason)
    : readMetadata
      ? getReadLogReasonLabel(reason)
    : actionMetadata
      ? getActionLogReasonLabel(reason)
      : reason;

  return (
    <List.Item key={log.id}>
      <List.Item.Meta
        title={
          <Space wrap>
            <span>{new Date(log.createdAt).toLocaleString()}</span>
            <Tag color="error">{log.errorType}</Tag>
            <Tag>{log.source}</Tag>
            {status ? <Tag color="processing">{statusLabel}</Tag> : null}
            {reason ? <Tag color="gold">{reasonLabel}</Tag> : null}
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
            {navigationMetadata ? (
              <Space wrap>
                {navigationMetadata.resolvedTarget ? (
                  <Tag color="blue">target:{navigationMetadata.resolvedTarget}</Tag>
                ) : null}
                {navigationMetadata.resolvedUrl ? (
                  <Tag color="cyan">url:{navigationMetadata.resolvedUrl}</Tag>
                ) : null}
              </Space>
            ) : null}
            {readMetadata ? (
              <Space wrap>
                {readMetadata.resolvedTarget ? (
                  <Tag color="cyan">target:{readMetadata.resolvedTarget}</Tag>
                ) : null}
                {readMetadata.resolvedField ? (
                  <Tag color="blue">field:{readMetadata.resolvedField}</Tag>
                ) : null}
                {readMetadata.resolvedRegion ? (
                  <Tag color="geekblue">region:{readMetadata.resolvedRegion}</Tag>
                ) : null}
              </Space>
            ) : null}
            {actionMetadata ? (
              <Space wrap>
                {actionMetadata.resolvedTarget ? (
                  <Tag color="volcano">target:{actionMetadata.resolvedTarget}</Tag>
                ) : null}
                {actionMetadata.resolvedActionTerm ? (
                  <Tag color="orange">action:{actionMetadata.resolvedActionTerm}</Tag>
                ) : null}
                {actionMetadata.semanticHint ? (
                  <Tag color="purple">semantic:{actionMetadata.semanticHint}</Tag>
                ) : null}
                {actionMetadata.resolvedRegion ? (
                  <Tag color="cyan">region:{actionMetadata.resolvedRegion}</Tag>
                ) : null}
                {actionMetadata.resolvedRoleHint ? (
                  <Tag>role:{actionMetadata.resolvedRoleHint}</Tag>
                ) : null}
                {actionMetadata.categoryHint ? (
                  <Tag color="geekblue">category:{actionMetadata.categoryHint}</Tag>
                ) : null}
              </Space>
            ) : null}
            {searchMetadata ? (
              <Space wrap>
                {searchMetadata.intentType ? (
                  <Tag color="green">intent:{searchMetadata.intentType}</Tag>
                ) : null}
                {searchMetadata.query ? (
                  <Tag color="cyan">query:{searchMetadata.query}</Tag>
                ) : null}
                {searchMetadata.resultIndex ? (
                  <Tag color="blue">result:{searchMetadata.resultIndex}</Tag>
                ) : null}
                {searchMetadata.triggerTerm ? (
                  <Tag color="gold">term:{searchMetadata.triggerTerm}</Tag>
                ) : null}
              </Space>
            ) : null}
            {fieldFillMetadata ? (
              <Space wrap>
                {fieldFillMetadata.resolvedField ? (
                  <Tag color="magenta">field:{fieldFillMetadata.resolvedField}</Tag>
                ) : null}
                {fieldFillMetadata.resolvedCanonicalField ? (
                  <Tag color="purple">canonical:{fieldFillMetadata.resolvedCanonicalField}</Tag>
                ) : null}
                {fieldFillMetadata.resolvedRegion ? (
                  <Tag color="cyan">region:{fieldFillMetadata.resolvedRegion}</Tag>
                ) : null}
                {fieldFillMetadata.value ? (
                  <Tag color="gold">value:{fieldFillMetadata.value}</Tag>
                ) : null}
              </Space>
            ) : null}
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
};

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
        return category === 'DETAIL_OPEN' || category === 'ROW_ACTION' || category === 'MENU_SELECTION';
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
