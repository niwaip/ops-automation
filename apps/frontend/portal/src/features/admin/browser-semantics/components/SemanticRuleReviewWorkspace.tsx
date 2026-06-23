import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, List, Select, Space, Tag, Typography, theme } from 'antd';
import { HistoryOutlined, ReloadOutlined, RobotOutlined, RocketOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type {
  SemanticRule,
  SemanticRuleCategory,
  SemanticRuleErrorLog,
  SemanticRuleSet,
  SemanticRuleValidationResult,
} from '@/api/browser-semantics';
import { renderJsonText } from '../lib/ruleSetForm';
import {
  ACTION_LOG_REASON_OPTIONS,
  ACTION_LOG_STATUS_OPTIONS,
  getActionLogReasonLabel,
  getActionLogStatusLabel,
  FIELD_FILL_LOG_REASON_OPTIONS,
  FIELD_FILL_LOG_STATUS_OPTIONS,
  getActionLogMetadata,
  getFieldFillLogReasonLabel,
  getFieldFillLogStatusLabel,
  getActionProfileBadges,
  getActionProfileSections,
  getFieldFillLogMetadata,
  getFieldFillProfileBadges,
  getFieldFillProfileSections,
  getLoginLogMetadata,
  getLoginProfileInterruptPolicy,
  getNavigationLogReasonLabel,
  getNavigationLogStatusLabel,
  getLoginProfileSections,
  LOGIN_LOG_REASON_OPTIONS,
  LOGIN_LOG_STATUS_OPTIONS,
  NAVIGATION_LOG_REASON_OPTIONS,
  NAVIGATION_LOG_STATUS_OPTIONS,
  READ_LOG_REASON_OPTIONS,
  READ_LOG_STATUS_OPTIONS,
  getEmptyRuleStateCopy,
  getNavigationLogMetadata,
  getNavigationProfileDestinations,
  getNavigationProfileSections,
  getReadLogMetadata,
  getReadLogReasonLabel,
  getReadLogStatusLabel,
  getReadProfileSections,
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

const ABILITY_CATEGORIES: SemanticRuleCategory[] = [
  'LOGIN',
  'NAVIGATION',
  'FIELD_FILL',
  'MENU_SELECTION',
  'DETAIL_OPEN',
  'READ_VALUE',
  'ROW_ACTION',
  'SEARCH',
];

const SEMANTIC_CATEGORIES: SemanticRuleCategory[] = ['GENERIC_ALIAS'];

const sectionHeader = (title: string, subtitle: string) => (
  <Space direction="vertical" size={2}>
    <Text strong style={{ fontSize: 16 }}>
      {title}
    </Text>
    <Text type="secondary" style={{ fontSize: 12 }}>
      {subtitle}
    </Text>
  </Space>
);

interface SemanticRuleReviewWorkspaceProps {
  currentRuleSet?: SemanticRuleSet;
  selectedCategory: SemanticRuleCategory | null;
  onSelectCategory: (category: SemanticRuleCategory) => void;
  relatedErrorLogs: SemanticRuleErrorLog[];
  relatedErrorLogCount: number;
  loginStatusDistribution: Array<{ label: string; count: number }>;
  loginReasonDistribution: Array<{ label: string; count: number }>;
  readStatusDistribution: Array<{ label: string; count: number }>;
  readReasonDistribution: Array<{ label: string; count: number }>;
  actionStatusDistribution: Array<{ label: string; count: number }>;
  actionReasonDistribution: Array<{ label: string; count: number }>;
  navigationStatusDistribution: Array<{ label: string; count: number }>;
  navigationReasonDistribution: Array<{ label: string; count: number }>;
  fieldFillStatusDistribution: Array<{ label: string; count: number }>;
  fieldFillReasonDistribution: Array<{ label: string; count: number }>;
  relatedErrorLogsLoading: boolean;
  relatedErrorLogsSourceLabel: string;
  loginLogStatusFilter: string;
  loginLogReasonFilter: string;
  readLogStatusFilter: string;
  readLogReasonFilter: string;
  actionLogStatusFilter: string;
  actionLogReasonFilter: string;
  navigationLogStatusFilter: string;
  navigationLogReasonFilter: string;
  fieldFillLogStatusFilter: string;
  fieldFillLogReasonFilter: string;
  onLoginLogStatusFilterChange: (value: string) => void;
  onLoginLogReasonFilterChange: (value: string) => void;
  onReadLogStatusFilterChange: (value: string) => void;
  onReadLogReasonFilterChange: (value: string) => void;
  onActionLogStatusFilterChange: (value: string) => void;
  onActionLogReasonFilterChange: (value: string) => void;
  onNavigationLogStatusFilterChange: (value: string) => void;
  onNavigationLogReasonFilterChange: (value: string) => void;
  onFieldFillLogStatusFilterChange: (value: string) => void;
  onFieldFillLogReasonFilterChange: (value: string) => void;
  onRefreshErrorLogs: () => void;
  onGenerateCategoryDraft: (category: SemanticRuleCategory) => void;
  generateCategoryLoading: boolean;
  generatingCategory: SemanticRuleCategory | null;
  onReplaceRuleCategory: (category: SemanticRuleCategory) => void;
  replaceCategoryLoading: boolean;
  replacingCategory: SemanticRuleCategory | null;
  onValidateRuleSet: () => void;
  validateLoading: boolean;
  validationResult: SemanticRuleValidationResult | null;
  onPublishCanary: () => void;
  publishCanaryLoading: boolean;
  onPublishActive: () => void;
  publishActiveLoading: boolean;
  onOpenRollback: () => void;
  rollbackDisabled: boolean;
}

const getCategoryRules = (
  ruleSet: SemanticRuleSet | undefined,
  category: SemanticRuleCategory | null
): SemanticRule[] => {
  if (!ruleSet || !category) {
    return [];
  }

  return ruleSet.rules.filter((rule) => (rule.category || 'GENERIC_ALIAS') === category);
};

const renderRuleCard = (
  rule: SemanticRule,
  colors: {
    cardBackground: string;
    cardBorder: string;
    patternBackground: string;
    patternText: string;
    outputsBackground: string;
    outputsText: string;
  }
) => (
  <>
    <Space wrap style={{ marginBottom: 12 }}>
      <Text strong style={{ fontSize: 15 }}>{rule.name}</Text>
      {rule.category ? <Tag color="purple">{getSemanticRuleCategoryLabel(rule.category)}</Tag> : null}
      <Tag>{getSemanticRuleTypeLabel(rule.type)}</Tag>
      <Tag color={getSemanticRuleKindColor(rule)}>{getSemanticRuleKindLabel(rule)}</Tag>
      <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '启用' : '禁用'}</Tag>
      <Tag>优先级 {rule.priority}</Tag>
    </Space>
    <Paragraph style={{ marginBottom: 8 }}>
      <Text type="secondary">{getSemanticRuleSummaryLines(rule).join(' / ')}</Text>
    </Paragraph>
    <Paragraph style={{ marginBottom: 8 }}>
      <Text strong>匹配规则</Text>
    </Paragraph>
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        background: colors.patternBackground,
        color: colors.patternText,
        borderRadius: 12,
        padding: 12,
        fontSize: 12,
      }}
    >
      {renderJsonText(rule.patterns)}
    </pre>
    <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
      <Text strong>输出配置</Text>
    </Paragraph>
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        background: colors.outputsBackground,
        color: colors.outputsText,
        borderRadius: 12,
        padding: 12,
        border: `1px solid ${colors.cardBorder}`,
        fontSize: 12,
      }}
    >
      {renderJsonText(rule.outputs)}
    </pre>
    {isLoginProfileRule(rule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getLoginProfileInterruptPolicy(rule) ? (
            <Tag color="gold">interrupt_policy: {getLoginProfileInterruptPolicy(rule)}</Tag>
          ) : null}
          <Tag color="blue">仅作用于 command-login 运行时 profile</Tag>
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
    ) : null}
    {isNavigationProfileRule(rule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getNavigationProfileDestinations(rule).map((item) => (
            <Tag key={item.key} color="blue">
              {item.label}: {item.value}
            </Tag>
          ))}
          <Tag color="blue">仅作用于页面导航运行时 profile</Tag>
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
    ) : null}
    {isReadProfileRule(rule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          <Tag color="cyan">仅作用于读取值运行时 profile</Tag>
        </Space>
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
    ) : null}
    {isActionProfileRule(rule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getActionProfileBadges(rule).map((item) => (
            <Tag key={item.key} color="volcano">
              {item.label}: {item.value}
            </Tag>
          ))}
          <Tag color="volcano">仅作用于动作执行运行时 profile</Tag>
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
    ) : null}
    {isSearchProfileRule(rule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          <Tag color="green">仅作用于搜索运行时 profile</Tag>
        </Space>
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
    ) : null}
    {isFieldFillProfileRule(rule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getFieldFillProfileBadges(rule).map((item) => (
            <Tag key={item.key} color="magenta">
              {item.label}: {item.value}
            </Tag>
          ))}
          <Tag color="magenta">仅作用于填写运行时 profile</Tag>
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
    ) : null}
  </>
);

const renderLogItem = (log: SemanticRuleErrorLog) => {
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
    : fieldFillMetadata
      ? getFieldFillLogStatusLabel(status)
      : status;
  const reasonLabel = navigationMetadata
    ? getNavigationLogReasonLabel(reason)
    : readMetadata
      ? getReadLogReasonLabel(reason)
    : actionMetadata
      ? getActionLogReasonLabel(reason)
    : fieldFillMetadata
      ? getFieldFillLogReasonLabel(reason)
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
            <Text>{log.errorMessage}</Text>
            <Text type="secondary">输入：{log.inputText || log.normalizedInput || '-'}</Text>
            <Text type="secondary">Trace ID：{log.traceId || '-'}</Text>
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
          </Space>
        }
      />
    </List.Item>
  );
};

const renderCategoryButtons = (
  categories: SemanticRuleCategory[],
  currentRuleSet: SemanticRuleSet | undefined,
  selectedCategory: SemanticRuleCategory | null,
  onSelectCategory: (category: SemanticRuleCategory) => void
) => (
  <Space direction="vertical" size={8} style={{ width: '100%' }}>
    {categories.map((category) => {
      const count = getCategoryRules(currentRuleSet, category).length;
      return (
        <Button
          key={category}
          type={selectedCategory === category ? 'primary' : 'default'}
          style={{
            borderRadius: 12,
            height: 40,
            width: '100%',
            justifyContent: 'space-between',
            boxShadow:
              selectedCategory === category ? '0 10px 20px rgba(59, 130, 246, 0.18)' : 'none',
          }}
          onClick={() => onSelectCategory(category)}
        >
          {getSemanticRuleCategoryLabel(category)} {count ? `(${count})` : ''}
        </Button>
      );
    })}
  </Space>
);

const SemanticRuleReviewWorkspace: React.FC<SemanticRuleReviewWorkspaceProps> = ({
  currentRuleSet,
  selectedCategory,
  onSelectCategory,
  relatedErrorLogs,
  relatedErrorLogCount,
  loginStatusDistribution,
  loginReasonDistribution,
  readStatusDistribution,
  readReasonDistribution,
  actionStatusDistribution,
  actionReasonDistribution,
  navigationStatusDistribution,
  navigationReasonDistribution,
  fieldFillStatusDistribution,
  fieldFillReasonDistribution,
  relatedErrorLogsLoading,
  relatedErrorLogsSourceLabel,
  loginLogStatusFilter,
  loginLogReasonFilter,
  readLogStatusFilter,
  readLogReasonFilter,
  actionLogStatusFilter,
  actionLogReasonFilter,
  navigationLogStatusFilter,
  navigationLogReasonFilter,
  fieldFillLogStatusFilter,
  fieldFillLogReasonFilter,
  onLoginLogStatusFilterChange,
  onLoginLogReasonFilterChange,
  onReadLogStatusFilterChange,
  onReadLogReasonFilterChange,
  onActionLogStatusFilterChange,
  onActionLogReasonFilterChange,
  onNavigationLogStatusFilterChange,
  onNavigationLogReasonFilterChange,
  onFieldFillLogStatusFilterChange,
  onFieldFillLogReasonFilterChange,
  onRefreshErrorLogs,
  onGenerateCategoryDraft,
  generateCategoryLoading,
  generatingCategory,
  onReplaceRuleCategory,
  replaceCategoryLoading,
  replacingCategory,
  onValidateRuleSet,
  validateLoading,
  validationResult,
  onPublishCanary,
  publishCanaryLoading,
  onPublishActive,
  publishActiveLoading,
  onOpenRollback,
  rollbackDisabled,
}) => {
  const { token } = theme.useToken();
  const selectedCategoryRules = getCategoryRules(currentRuleSet, selectedCategory);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const publishReady = Boolean(
    currentRuleSet &&
      validationResult?.rule_set_id === currentRuleSet.id &&
      validationResult.valid
  );
  const selectedRule = useMemo(
    () =>
      selectedCategoryRules.find((rule) => rule.id === selectedRuleId) || selectedCategoryRules[0] || null,
    [selectedCategoryRules, selectedRuleId]
  );
  useEffect(() => {
    if (!selectedCategoryRules.length) {
      setSelectedRuleId(null);
      return;
    }

    if (!selectedRuleId || !selectedCategoryRules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(selectedCategoryRules[0].id);
    }
  }, [selectedCategoryRules, selectedRuleId]);
  const sectionCardStyle: React.CSSProperties = {
    borderRadius: 20,
    border: `1px solid ${token.colorBorderSecondary}`,
    boxShadow: token.boxShadowSecondary,
    overflow: 'hidden',
    background: token.colorBgContainer,
  };
  const ruleCardColors = {
    cardBackground: `linear-gradient(180deg, ${token.colorBgContainer} 0%, ${token.colorFillAlter} 100%)`,
    cardBorder: token.colorBorderSecondary,
    patternBackground: token.colorBgElevated,
    patternText: token.colorText,
    outputsBackground: token.colorFillAlter,
    outputsText: token.colorText,
  };

  const isActionCategory =
    selectedCategory === 'DETAIL_OPEN' ||
    selectedCategory === 'ROW_ACTION' ||
    selectedCategory === 'MENU_SELECTION';

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        size="small"
        style={sectionCardStyle}
        styles={{ body: { padding: 20 } }}
      >
        {!currentRuleSet ? (
          <Empty description="当前没有可查看的规则集" />
        ) : !selectedCategory ? (
          <Empty description="请选择上方规则类别" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 280px minmax(0, 1fr)',
                gap: 16,
                alignItems: 'start',
              }}
            >
              <Card
                size="small"
                title="规则分类"
                style={{
                  borderRadius: 16,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  background: token.colorFillAlter,
                }}
                styles={{ body: { padding: 12 } }}
              >
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div>
                    <Text strong style={{ fontSize: 13 }}>能力规则</Text>
                    <div style={{ marginTop: 8 }}>
                      {renderCategoryButtons(ABILITY_CATEGORIES, currentRuleSet, selectedCategory, onSelectCategory)}
                    </div>
                  </div>
                  <div>
                    <Text strong style={{ fontSize: 13 }}>语义规则</Text>
                    <div style={{ marginTop: 8 }}>
                      {renderCategoryButtons(SEMANTIC_CATEGORIES, currentRuleSet, selectedCategory, onSelectCategory)}
                    </div>
                  </div>
                </Space>
              </Card>
              {selectedCategoryRules.length ? (
                <>
                <Card
                  size="small"
                  title="规则列表"
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorFillAlter,
                  }}
                  styles={{ body: { padding: 12 } }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {selectedCategoryRules.map((rule) => {
                      const active = selectedRule?.id === rule.id;
                      return (
                        <Card
                          key={rule.id}
                          size="small"
                          hoverable
                          onClick={() => setSelectedRuleId(rule.id)}
                          style={{
                            borderRadius: 14,
                            cursor: 'pointer',
                            border: active
                              ? `1px solid ${token.colorPrimary}`
                              : `1px solid ${token.colorBorderSecondary}`,
                            background: active ? token.colorPrimaryBg : token.colorBgContainer,
                            boxShadow: active ? token.boxShadow : 'none',
                          }}
                          styles={{ body: { padding: 12 } }}
                        >
                          <Space direction="vertical" size={6} style={{ width: '100%' }}>
                            <Space wrap>
                              <Text strong>{rule.name}</Text>
                              <Tag>{getSemanticRuleTypeLabel(rule.type)}</Tag>
                              <Tag color={getSemanticRuleKindColor(rule)}>
                                {getSemanticRuleKindLabel(rule)}
                              </Tag>
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {getSemanticRuleSummaryLines(rule).join(' / ')}
                            </Text>
                          </Space>
                        </Card>
                      );
                    })}
                  </Space>
                </Card>
                <Card
                  size="small"
                  title="规则详情"
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgContainer,
                  }}
                  styles={{ body: { padding: 16 } }}
                >
                  {selectedRule ? renderRuleCard(selectedRule, ruleCardColors) : <Empty description="请选择左侧规则" />}
                </Card>
                </>
              ) : (
                <Card
                  size="small"
                  style={{
                    gridColumn: 'span 2',
                    borderRadius: 16,
                    border: `1px dashed ${token.colorBorder}`,
                    background: token.colorFillTertiary,
                  }}
                >
                  <Empty
                    description={
                      <Space direction="vertical" size={8}>
                        <Text strong>{getEmptyRuleStateCopy(selectedCategory).title}</Text>
                        <Text type="secondary">
                          {getEmptyRuleStateCopy(selectedCategory).description}
                        </Text>
                      </Space>
                    }
                  >
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<RobotOutlined />}
                        onClick={() => onGenerateCategoryDraft(selectedCategory)}
                        loading={generateCategoryLoading && generatingCategory === selectedCategory}
                      >
                        AI 审查生成该类
                      </Button>
                      <Button
                        onClick={() => onReplaceRuleCategory(selectedCategory)}
                        loading={replaceCategoryLoading && replacingCategory === selectedCategory}
                      >
                        手工替换该类
                      </Button>
                    </Space>
                  </Empty>
                </Card>
              )}
            </div>
          </Space>
        )}
      </Card>

      <Card
        size="small"
        title={sectionHeader('审查与样本', '查看相关错误样本，触发 AI 审查或替换当前类别')}
        style={sectionCardStyle}
        styles={{ body: { padding: 20 } }}
        extra={
          <Space wrap>
            {selectedCategory ? (
              <>
                <Button
                  icon={<RobotOutlined />}
                  onClick={() => onGenerateCategoryDraft(selectedCategory)}
                  loading={generateCategoryLoading && generatingCategory === selectedCategory}
                >
                  AI 审查
                </Button>
                <Button
                  onClick={() => onReplaceRuleCategory(selectedCategory)}
                  loading={replaceCategoryLoading && replacingCategory === selectedCategory}
                >
                  替换该类
                </Button>
              </>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={onRefreshErrorLogs}>
              刷新错误日志
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            style={{ borderRadius: 14 }}
            message={
              selectedCategory === 'LOGIN'
                ? '登录类规则分为输入改写规则与登录画像规则两类，AI 审查会保留这种区分并在预览中展示。'
                : selectedCategory === 'NAVIGATION'
                  ? '导航类规则会优先生成导航画像规则；当错误样本无法推断目标地址时，AI 审查仍可能保留通用导航别名。'
                : 'AI 审查会基于当前类别的相关错误样本生成候选规则，并在弹窗中左右对比当前规则与候选规则。'
            }
          />
          <Space
            wrap
            style={{
              justifyContent: 'space-between',
              width: '100%',
              padding: 12,
              borderRadius: 14,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <Text type="secondary">错误样本来源：{relatedErrorLogsSourceLabel}</Text>
            {selectedCategory ? (
              <Tag color="processing">{getSemanticRuleCategoryLabel(selectedCategory)}</Tag>
            ) : null}
            {selectedCategory === 'LOGIN' ||
            selectedCategory === 'READ_VALUE' ||
            isActionCategory ||
            selectedCategory === 'NAVIGATION' ||
            selectedCategory === 'FIELD_FILL' ? (
              <Tag color="blue">共 {relatedErrorLogCount} 条命中样本</Tag>
            ) : null}
          </Space>
          {selectedCategory === 'LOGIN' ||
          selectedCategory === 'READ_VALUE' ||
          isActionCategory ||
          selectedCategory === 'NAVIGATION' ||
          selectedCategory === 'FIELD_FILL' ? (
            <Card
              size="small"
              style={{
                borderRadius: 14,
                background: token.colorBgElevated,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap>
                  <Select
                    size="small"
                    style={{ minWidth: 180 }}
                    value={
                      selectedCategory === 'LOGIN'
                        ? loginLogStatusFilter
                        : selectedCategory === 'READ_VALUE'
                          ? readLogStatusFilter
                        : isActionCategory
                          ? actionLogStatusFilter
                        : selectedCategory === 'NAVIGATION'
                          ? navigationLogStatusFilter
                          : fieldFillLogStatusFilter
                    }
                    options={(
                      selectedCategory === 'LOGIN'
                        ? LOGIN_LOG_STATUS_OPTIONS
                        : selectedCategory === 'READ_VALUE'
                          ? READ_LOG_STATUS_OPTIONS
                        : isActionCategory
                          ? ACTION_LOG_STATUS_OPTIONS
                        : selectedCategory === 'NAVIGATION'
                          ? NAVIGATION_LOG_STATUS_OPTIONS
                          : FIELD_FILL_LOG_STATUS_OPTIONS
                    ).map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))}
                    onChange={
                      selectedCategory === 'LOGIN'
                        ? onLoginLogStatusFilterChange
                        : selectedCategory === 'READ_VALUE'
                          ? onReadLogStatusFilterChange
                        : isActionCategory
                          ? onActionLogStatusFilterChange
                        : selectedCategory === 'NAVIGATION'
                          ? onNavigationLogStatusFilterChange
                          : onFieldFillLogStatusFilterChange
                    }
                  />
                  <Select
                    size="small"
                    style={{ minWidth: 260 }}
                    value={
                      selectedCategory === 'LOGIN'
                        ? loginLogReasonFilter
                        : selectedCategory === 'READ_VALUE'
                          ? readLogReasonFilter
                        : isActionCategory
                          ? actionLogReasonFilter
                        : selectedCategory === 'NAVIGATION'
                          ? navigationLogReasonFilter
                          : fieldFillLogReasonFilter
                    }
                    options={(
                      selectedCategory === 'LOGIN'
                        ? LOGIN_LOG_REASON_OPTIONS
                        : selectedCategory === 'READ_VALUE'
                          ? READ_LOG_REASON_OPTIONS
                        : isActionCategory
                          ? ACTION_LOG_REASON_OPTIONS
                        : selectedCategory === 'NAVIGATION'
                          ? NAVIGATION_LOG_REASON_OPTIONS
                          : FIELD_FILL_LOG_REASON_OPTIONS
                    ).map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))}
                    onChange={
                      selectedCategory === 'LOGIN'
                        ? onLoginLogReasonFilterChange
                        : selectedCategory === 'READ_VALUE'
                          ? onReadLogReasonFilterChange
                        : isActionCategory
                          ? onActionLogReasonFilterChange
                        : selectedCategory === 'NAVIGATION'
                          ? onNavigationLogReasonFilterChange
                          : onFieldFillLogReasonFilterChange
                    }
                  />
                </Space>
                <div>
                  <Text strong>状态分布</Text>
                  <div style={{ marginTop: 8 }}>
                    <Space wrap>
                      {(selectedCategory === 'LOGIN'
                        ? loginStatusDistribution
                        : selectedCategory === 'READ_VALUE'
                          ? readStatusDistribution
                        : isActionCategory
                          ? actionStatusDistribution
                        : selectedCategory === 'NAVIGATION'
                          ? navigationStatusDistribution
                          : fieldFillStatusDistribution
                      ).length ? (
                        (selectedCategory === 'LOGIN'
                          ? loginStatusDistribution
                          : selectedCategory === 'READ_VALUE'
                            ? readStatusDistribution
                          : isActionCategory
                            ? actionStatusDistribution
                          : selectedCategory === 'NAVIGATION'
                            ? navigationStatusDistribution
                            : fieldFillStatusDistribution
                        ).map((item) => (
                          <Tag key={item.label} color="processing">
                            {`${
                              selectedCategory === 'LOGIN'
                                ? item.label
                                : selectedCategory === 'READ_VALUE'
                                  ? getReadLogStatusLabel(item.label)
                                : isActionCategory
                                  ? getActionLogStatusLabel(item.label)
                                : selectedCategory === 'NAVIGATION'
                                  ? getNavigationLogStatusLabel(item.label)
                                  : getFieldFillLogStatusLabel(item.label)
                            } (${item.count})`}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary">当前筛选下暂无状态分布</Text>
                      )}
                    </Space>
                  </div>
                </div>
                <div>
                  <Text strong>原因分布</Text>
                  <div style={{ marginTop: 8 }}>
                    <Space wrap>
                      {(selectedCategory === 'LOGIN'
                        ? loginReasonDistribution
                        : selectedCategory === 'READ_VALUE'
                          ? readReasonDistribution
                        : isActionCategory
                          ? actionReasonDistribution
                        : selectedCategory === 'NAVIGATION'
                          ? navigationReasonDistribution
                          : fieldFillReasonDistribution
                      ).length ? (
                        (selectedCategory === 'LOGIN'
                          ? loginReasonDistribution
                          : selectedCategory === 'READ_VALUE'
                            ? readReasonDistribution
                          : isActionCategory
                            ? actionReasonDistribution
                          : selectedCategory === 'NAVIGATION'
                            ? navigationReasonDistribution
                            : fieldFillReasonDistribution
                        ).map((item) => (
                          <Tag key={item.label} color="gold">
                            {`${
                              selectedCategory === 'LOGIN'
                                ? item.label
                                : selectedCategory === 'READ_VALUE'
                                  ? getReadLogReasonLabel(item.label)
                                : isActionCategory
                                  ? getActionLogReasonLabel(item.label)
                                : selectedCategory === 'NAVIGATION'
                                  ? getNavigationLogReasonLabel(item.label)
                                  : getFieldFillLogReasonLabel(item.label)
                            } (${item.count})`}
                          </Tag>
                        ))
                      ) : (
                        <Text type="secondary">当前筛选下暂无原因分布</Text>
                      )}
                    </Space>
                  </div>
                </div>
              </Space>
            </Card>
          ) : null}
          {relatedErrorLogsLoading ? (
            <Card size="small" loading />
          ) : relatedErrorLogs.length ? (
            <List itemLayout="vertical" dataSource={relatedErrorLogs} renderItem={renderLogItem} />
          ) : (
            <Empty description="当前类别暂无相关错误样本" />
          )}
        </Space>
      </Card>

      <Card
        size="small"
        title={sectionHeader('验证与发布', '验证通过后才能发布，回退入口始终保留')}
        style={sectionCardStyle}
        styles={{ body: { padding: 20 } }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SafetyCertificateOutlined />}
              onClick={onValidateRuleSet}
              loading={validateLoading}
              disabled={!currentRuleSet}
            >
              验证规则
            </Button>
            <Button
              icon={<RocketOutlined />}
              onClick={onPublishCanary}
              loading={publishCanaryLoading}
              disabled={!currentRuleSet || !publishReady || currentRuleSet.status === 'CANARY'}
            >
              发布 Canary
            </Button>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              onClick={onPublishActive}
              loading={publishActiveLoading}
              disabled={
                !currentRuleSet ||
                !publishReady ||
                currentRuleSet.status === 'ACTIVE' ||
                currentRuleSet.status === 'DRAFT'
              }
            >
              发布 Active
            </Button>
            <Button
              icon={<HistoryOutlined />}
              onClick={onOpenRollback}
              disabled={rollbackDisabled}
            >
              回退版本
            </Button>
          </Space>

          {validationResult ? (
            <Alert
              type={validationResult.valid ? 'success' : 'error'}
              showIcon
              style={{ borderRadius: 14 }}
              message={
                validationResult.valid
                  ? `验证通过：${validationResult.rule_count} 条规则，${validationResult.category_count} 个类别`
                  : '验证失败，当前规则集不能发布'
              }
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text>校验时间：{new Date(validationResult.validated_at).toLocaleString()}</Text>
                  {validationResult.errors.length ? (
                    <Text>错误：{validationResult.errors.join(' / ')}</Text>
                  ) : null}
                  {validationResult.warnings.length ? (
                    <Text>提示：{validationResult.warnings.join(' / ')}</Text>
                  ) : null}
                </Space>
              }
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              style={{ borderRadius: 14 }}
              message="发布前需要先点击“验证规则”，只有验证通过后才允许发布。"
            />
          )}
        </Space>
      </Card>
    </Space>
  );
};

export default SemanticRuleReviewWorkspace;
