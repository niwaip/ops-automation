import React from 'react';
import { Alert, Button, Card, Empty, List, Modal, Space, Tag, Typography } from 'antd';
import type {
  GenerateSemanticRuleSetDraftResponse,
  SemanticRule,
  SemanticRuleCategory,
} from '@/api/browser-semantics';
import { renderJsonText } from '../lib/ruleSetForm';
import {
  getActionProfileBadges,
  getActionProfileSections,
  getEmptyRuleStateCopy,
  getFieldFillProfileBadges,
  getFieldFillProfileSections,
  getLoginProfileInterruptPolicy,
  getLoginProfileSections,
  getNavigationProfileDestinations,
  getNavigationProfileSections,
  getReadProfileSections,
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

const renderRulePreview = (rule: SemanticRule | GenerateSemanticRuleSetDraftResponse['draft_rule_set']['rules'][number]) => (
  <>
    <Space wrap style={{ marginBottom: 8 }}>
      <Text strong>{rule.name}</Text>
      {'category' in rule && rule.category ? (
        <Tag color="purple">{getSemanticRuleCategoryLabel(rule.category)}</Tag>
      ) : null}
      <Tag>{getSemanticRuleTypeLabel(rule.type)}</Tag>
      <Tag color={getSemanticRuleKindColor(rule as SemanticRule)}>{getSemanticRuleKindLabel(rule as SemanticRule)}</Tag>
      <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '启用' : '禁用'}</Tag>
      <Tag>优先级 {rule.priority}</Tag>
    </Space>
    <Paragraph style={{ marginBottom: 8 }}>
      <Text type="secondary">{getSemanticRuleSummaryLines(rule as SemanticRule).join(' / ')}</Text>
    </Paragraph>
    <Paragraph style={{ marginBottom: 8 }}>
      <Text strong>匹配规则</Text>
    </Paragraph>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderJsonText(rule.patterns)}</pre>
    <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
      <Text strong>输出配置</Text>
    </Paragraph>
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{renderJsonText(rule.outputs)}</pre>
    {isLoginProfileRule(rule as SemanticRule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getLoginProfileInterruptPolicy(rule as SemanticRule) ? (
            <Tag color="gold">
              interrupt_policy: {getLoginProfileInterruptPolicy(rule as SemanticRule)}
            </Tag>
          ) : null}
        </Space>
        {getLoginProfileSections(rule as SemanticRule).map((section) => (
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
    {isNavigationProfileRule(rule as SemanticRule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getNavigationProfileDestinations(rule as SemanticRule).map((item) => (
            <Tag key={item.key} color="blue">
              {item.label}: {item.value}
            </Tag>
          ))}
        </Space>
        {getNavigationProfileSections(rule as SemanticRule).map((section) => (
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
    {isReadProfileRule(rule as SemanticRule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        {getReadProfileSections(rule as SemanticRule).map((section) => (
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
    {isActionProfileRule(rule as SemanticRule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getActionProfileBadges(rule as SemanticRule).map((item) => (
            <Tag key={item.key} color="volcano">
              {item.label}: {item.value}
            </Tag>
          ))}
        </Space>
        {getActionProfileSections(rule as SemanticRule).map((section) => (
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
    {isSearchProfileRule(rule as SemanticRule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        {getSearchProfileSections(rule as SemanticRule).map((section) => (
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
    {isFieldFillProfileRule(rule as SemanticRule) ? (
      <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
        <Space wrap>
          {getFieldFillProfileBadges(rule as SemanticRule).map((item) => (
            <Tag key={item.key} color="magenta">
              {item.label}: {item.value}
            </Tag>
          ))}
        </Space>
        {getFieldFillProfileSections(rule as SemanticRule).map((section) => (
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

interface SemanticRuleGenerationPreviewModalProps {
  open: boolean;
  loading: boolean;
  confirmLoading?: boolean;
  applyLoading?: boolean;
  draft?: GenerateSemanticRuleSetDraftResponse;
  currentCategory?: SemanticRuleCategory | null;
  currentCategoryRules?: SemanticRule[];
  applyActionLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onApply?: () => void;
}

const SemanticRuleGenerationPreviewModal: React.FC<SemanticRuleGenerationPreviewModalProps> = ({
  open,
  loading,
  confirmLoading,
  applyLoading,
  draft,
  currentCategory,
  currentCategoryRules = [],
  applyActionLabel,
  onCancel,
  onConfirm,
  onApply,
}) => {
  const candidateNames = new Set((draft?.draft_rule_set.rules || []).map((rule) => rule.name));
  const currentNames = new Set(currentCategoryRules.map((rule) => rule.name));
  const addedNames = Array.from(candidateNames).filter((name) => !currentNames.has(name));
  const removedNames = Array.from(currentNames).filter((name) => !candidateNames.has(name));
  const retainedNames = Array.from(candidateNames).filter((name) => currentNames.has(name));

  return (
    <Modal
      title="AI 候选规则草案"
      open={open}
      width={900}
      onCancel={onCancel}
      footer={
        <Space>
          <Button onClick={onCancel}>关闭</Button>
          {onApply ? (
            <Button
              loading={applyLoading}
              disabled={!draft?.generated}
              onClick={onApply}
            >
              {applyActionLabel || '直接应用'}
            </Button>
          ) : null}
          <Button
            type="primary"
            loading={confirmLoading}
            disabled={!draft?.generated}
            onClick={onConfirm}
          >
            审核通过并创建 DRAFT
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      {loading ? (
        <Card loading />
      ) : !draft ? (
        <Empty description="暂无草案结果" />
      ) : !draft.generated ? (
        <Alert type="warning" showIcon message={draft.reason || '未生成候选草案'} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`已生成 ${draft.summary.rule_count} 条候选规则，基于 ${draft.summary.sample_count} 条错误样本`}
            description={
              currentCategory === 'LOGIN'
                ? `生成追踪 ID：${draft.generation_trace_id}。登录类候选会区分输入改写规则与登录画像规则。`
                : currentCategory === 'NAVIGATION'
                  ? `生成追踪 ID：${draft.generation_trace_id}。导航类候选会优先生成导航画像规则；无法推断目标时仍可能保留通用导航别名。`
                : `生成追踪 ID：${draft.generation_trace_id}`
            }
          />

          {currentCategory ? (
            <Card size="small" title={`当前${getSemanticRuleCategoryLabel(currentCategory)}规则对比`}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space wrap>
                  <Tag>当前 {currentCategoryRules.length} 条</Tag>
                  <Tag color="processing">候选 {draft.draft_rule_set.rules.length} 条</Tag>
                  <Tag color="success">保留 {retainedNames.length} 条</Tag>
                  <Tag color="warning">新增 {addedNames.length} 条</Tag>
                  <Tag color="error">移除 {removedNames.length} 条</Tag>
                </Space>
                <div>
                  <Text strong>新增规则：</Text>
                  <Text style={{ marginLeft: 8 }}>{addedNames.length ? addedNames.join(' / ') : '-'}</Text>
                </div>
                <div>
                  <Text strong>移除规则：</Text>
                  <Text style={{ marginLeft: 8 }}>{removedNames.length ? removedNames.join(' / ') : '-'}</Text>
                </div>
                <div>
                  <Text strong>保留规则：</Text>
                  <Text style={{ marginLeft: 8 }}>{retainedNames.length ? retainedNames.join(' / ') : '-'}</Text>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16,
                  }}
                >
                  <Card size="small" type="inner" title={`当前规则 (${currentCategoryRules.length})`}>
                    {currentCategoryRules.length ? (
                      <List
                        itemLayout="vertical"
                        dataSource={currentCategoryRules}
                        renderItem={(rule) => (
                          <List.Item key={rule.id}>
                            {renderRulePreview(rule)}
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty
                        description={
                          <Space direction="vertical" size={8}>
                            <Text strong>{getEmptyRuleStateCopy(currentCategory).title}</Text>
                            <Text type="secondary">
                              {getEmptyRuleStateCopy(currentCategory).description}
                            </Text>
                          </Space>
                        }
                      />
                    )}
                  </Card>
                  <Card
                    size="small"
                    type="inner"
                    title={`候选规则 (${draft.draft_rule_set.rules.length})`}
                  >
                    {draft.draft_rule_set.rules.length ? (
                      <List
                        itemLayout="vertical"
                        dataSource={draft.draft_rule_set.rules}
                        renderItem={(rule) => (
                          <List.Item key={`${rule.type}-${rule.name}`}>
                            {renderRulePreview(rule)}
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description="没有生成候选规则" />
                    )}
                  </Card>
                </div>
              </Space>
            </Card>
          ) : null}

          <Card size="small" title="候选规则集">
            <Paragraph style={{ marginBottom: 8 }}>
              <Text strong>Key：</Text>
              {draft.draft_rule_set.key}
            </Paragraph>
            <Paragraph style={{ marginBottom: 8 }}>
              <Text strong>名称：</Text>
              {draft.draft_rule_set.name}
            </Paragraph>
            <Paragraph style={{ marginBottom: 8 }}>
              <Text strong>版本：</Text>
              {draft.draft_rule_set.version}
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              <Text strong>描述：</Text>
              {draft.draft_rule_set.description || '-'}
            </Paragraph>
          </Card>

          {!currentCategory ? (
            <Card size="small" title={`候选规则 (${draft.draft_rule_set.rules.length})`}>
              {draft.draft_rule_set.rules.length ? (
                <List
                  itemLayout="vertical"
                  dataSource={draft.draft_rule_set.rules}
                  renderItem={(rule) => (
                    <List.Item key={`${rule.type}-${rule.name}`}>
                      {renderRulePreview(rule)}
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="没有生成候选规则" />
              )}
            </Card>
          ) : null}

          <Card size="small" title="Targeting 建议">
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {renderJsonText(draft.draft_rule_set.targetings)}
            </pre>
          </Card>

          <Card size="small" title={`生成说明 (${draft.explanations.length})`}>
            {draft.explanations.length ? (
              <List
                dataSource={draft.explanations}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            ) : (
              <Paragraph style={{ marginBottom: 0 }}>暂无生成说明。</Paragraph>
            )}
          </Card>

          <Card size="small" title={`风险提示 (${draft.risks.length})`}>
            {draft.risks.length ? (
              <List dataSource={draft.risks} renderItem={(item) => <List.Item>{item}</List.Item>} />
            ) : (
              <Paragraph style={{ marginBottom: 0 }}>当前没有额外风险提示。</Paragraph>
            )}
          </Card>

          <Card size="small" title={`来源错误样本 (${draft.source_error_logs.length})`}>
            <List
              dataSource={draft.source_error_logs}
              renderItem={(log) => (
                <List.Item key={log.id}>
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <span>{new Date(log.created_at).toLocaleString()}</span>
                        <Tag color="error">{log.error_type}</Tag>
                        <Tag>{log.source}</Tag>
                        {log.page_type ? <Tag>{log.page_type}</Tag> : null}
                        {log.host ? <Tag>{log.host}</Tag> : null}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Text>{log.error_message}</Text>
                        <Text type="secondary">输入：{log.input_text || log.normalized_input || '-'}</Text>
                        <Text type="secondary">Trace ID：{log.trace_id || '-'}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Space>
      )}
    </Modal>
  );
};

export default SemanticRuleGenerationPreviewModal;
