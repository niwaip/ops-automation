import type {
  SemanticRule,
  SemanticRuleErrorLog,
  SemanticRuleHitLog,
} from '@/api/browser-semantics';
import { Card, Descriptions, List, Space, Tag, Typography } from 'antd';
import { renderJsonText } from '../lib/ruleSetForm';
import {
  getActionHitMetadata,
  getActionLogMetadata,
  getActionLogReasonLabel,
  getActionLogStatusLabel,
  getActionProfileBadges,
  getActionProfileSections,
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

export const renderRuleItem = (rule: SemanticRule) => (
  <Card
    key={rule.id}
    size="small"
    style={{ marginBottom: 12, borderRadius: 10 }}
    title={
      <Space>
        <span>{rule.name}</span>
        {rule.category ? (
          <Tag color="purple">{getSemanticRuleCategoryLabel(rule.category)}</Tag>
        ) : null}
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

export const renderHitLogItem = (log: SemanticRuleHitLog) => {
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
                  <Tag color="purple">profile={loginMetadata.effectiveLoginProfileVersion}</Tag>
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
                  <Tag color="gold">{getNavigationLogReasonLabel(navigationMetadata.reason)}</Tag>
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
                {fieldFillMetadata.reason ? (
                  <Tag color="gold">{fieldFillMetadata.reason}</Tag>
                ) : null}
                {fieldFillMetadata.effectiveFieldFillProfileVersion ? (
                  <Tag color="purple">
                    profile={fieldFillMetadata.effectiveFieldFillProfileVersion}
                  </Tag>
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

export const renderErrorLogItem = (log: SemanticRuleErrorLog) => {
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
