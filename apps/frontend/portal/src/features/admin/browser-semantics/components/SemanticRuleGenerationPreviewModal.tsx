import React from 'react';
import { Alert, Button, Card, Empty, List, Modal, Space, Tag, Typography } from 'antd';
import type {
  GenerateSemanticRuleSetDraftResponse,
  SemanticRule,
  SemanticRuleCategory,
} from '@/api/browser-semantics';
import { renderJsonText } from '../lib/ruleSetForm';

const { Paragraph, Text } = Typography;

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
            description={`生成追踪 ID：${draft.generation_trace_id}`}
          />

          {currentCategory ? (
            <Card size="small" title={`当前 ${currentCategory} 规则对比`}>
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
                            <Space wrap style={{ marginBottom: 8 }}>
                              <Text strong>{rule.name}</Text>
                              <Tag>{rule.type}</Tag>
                              <Tag color={rule.enabled ? 'success' : 'default'}>
                                {rule.enabled ? '启用' : '禁用'}
                              </Tag>
                              <Tag>priority {rule.priority}</Tag>
                            </Space>
                            <Paragraph style={{ marginBottom: 8 }}>
                              <Text strong>Patterns</Text>
                            </Paragraph>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                              {renderJsonText(rule.patterns)}
                            </pre>
                            <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
                              <Text strong>Outputs</Text>
                            </Paragraph>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                              {renderJsonText(rule.outputs)}
                            </pre>
                          </List.Item>
                        )}
                      />
                    ) : (
                      <Empty description={`当前 ${currentCategory} 暂无已配置规则`} />
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
                            <Space wrap style={{ marginBottom: 8 }}>
                              <Text strong>{rule.name}</Text>
                              {rule.category ? <Tag color="purple">{rule.category}</Tag> : null}
                              <Tag>{rule.type}</Tag>
                              <Tag color={rule.enabled ? 'success' : 'default'}>
                                {rule.enabled ? '启用' : '禁用'}
                              </Tag>
                              <Tag>priority {rule.priority}</Tag>
                            </Space>
                            <Paragraph style={{ marginBottom: 8 }}>
                              <Text strong>Patterns</Text>
                            </Paragraph>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                              {renderJsonText(rule.patterns)}
                            </pre>
                            <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
                              <Text strong>Outputs</Text>
                            </Paragraph>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                              {renderJsonText(rule.outputs)}
                            </pre>
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
                      <Space wrap style={{ marginBottom: 8 }}>
                        <Text strong>{rule.name}</Text>
                        {rule.category ? <Tag color="purple">{rule.category}</Tag> : null}
                        <Tag>{rule.type}</Tag>
                        <Tag color={rule.enabled ? 'success' : 'default'}>
                          {rule.enabled ? '启用' : '禁用'}
                        </Tag>
                        <Tag>priority {rule.priority}</Tag>
                      </Space>
                      <Paragraph style={{ marginBottom: 8 }}>
                        <Text strong>Patterns</Text>
                      </Paragraph>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {renderJsonText(rule.patterns)}
                      </pre>
                      <Paragraph style={{ marginTop: 12, marginBottom: 8 }}>
                        <Text strong>Outputs</Text>
                      </Paragraph>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {renderJsonText(rule.outputs)}
                      </pre>
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
