import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, List, Space, Tag, Typography, theme } from 'antd';
import { HistoryOutlined, ReloadOutlined, RobotOutlined, RocketOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type {
  SemanticRule,
  SemanticRuleCategory,
  SemanticRuleErrorLog,
  SemanticRuleSet,
  SemanticRuleValidationResult,
} from '@/api/browser-semantics';
import { renderJsonText } from '../lib/ruleSetForm';

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
  relatedErrorLogsLoading: boolean;
  relatedErrorLogsSourceLabel: string;
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
      {rule.category ? <Tag color="purple">{rule.category}</Tag> : null}
      <Tag>{rule.type}</Tag>
      <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '启用' : '禁用'}</Tag>
      <Tag>priority {rule.priority}</Tag>
    </Space>
    <Paragraph style={{ marginBottom: 8 }}>
      <Text strong>Patterns</Text>
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
      <Text strong>Outputs</Text>
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
  </>
);

const renderLogItem = (log: SemanticRuleErrorLog) => (
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
          <Text>{log.errorMessage}</Text>
          <Text type="secondary">输入：{log.inputText || log.normalizedInput || '-'}</Text>
          <Text type="secondary">Trace ID：{log.traceId || '-'}</Text>
        </Space>
      }
    />
  </List.Item>
);

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
          {category} {count ? `(${count})` : ''}
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
  relatedErrorLogsLoading,
  relatedErrorLogsSourceLabel,
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
                              <Tag>{rule.type}</Tag>
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {Array.isArray(rule.patterns) && rule.patterns.length
                                ? rule.patterns.slice(0, 1).join(' | ')
                                : '无 pattern'}
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
                        <Text strong>{`当前版本下 ${selectedCategory} 暂无规则`}</Text>
                        <Text type="secondary">
                          可以直接基于相关错误样本生成该类规则，或者手工替换这一类。
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
            message="AI 审查会基于当前类别的相关错误样本生成候选规则，并在弹窗中左右对比当前规则与候选规则。"
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
            {selectedCategory ? <Tag color="processing">{selectedCategory}</Tag> : null}
          </Space>
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
