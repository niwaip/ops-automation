import React, { useState, useEffect } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { FormInstance } from 'antd';

const { Paragraph, Text } = Typography;

export interface CustomChecklistRuleItem {
  id: string;
  title: string;
  category?: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  rule: string;
  recommendedRevision?: string;
}

interface ContractReviewerConfigPanelProps {
  form: FormInstance;
  fields: Array<{ key: string; label: string; configured: boolean; value?: string }>;
  onClearField: (key: string) => void;
  clearingKeys: Record<string, boolean>;
}

export const ContractReviewerConfigPanel: React.FC<ContractReviewerConfigPanelProps> = ({
  form,
  fields,
  onClearField,
  clearingKeys,
}) => {
  const [rules, setRules] = useState<CustomChecklistRuleItem[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm] = Form.useForm<CustomChecklistRuleItem>();

  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const customRulesField = fieldMap.get('CUSTOM_CHECKLIST_RULES');

  useEffect(() => {
    // Populate form initial values from fields
    const typeField = fieldMap.get('DEFAULT_CONTRACT_TYPE');
    const posField = fieldMap.get('DEFAULT_POSITION');
    if (typeField?.value) {
      form.setFieldValue('DEFAULT_CONTRACT_TYPE', typeField.value);
    }
    if (posField?.value) {
      form.setFieldValue('DEFAULT_POSITION', posField.value);
    }
    if (customRulesField?.value) {
      try {
        const parsed = JSON.parse(customRulesField.value);
        if (Array.isArray(parsed)) {
          setRules(parsed);
          form.setFieldValue('CUSTOM_CHECKLIST_RULES', customRulesField.value);
        }
      } catch {
        // ignore invalid json
      }
    }
  }, [fields, form]);

  const updateRulesToForm = (newRules: CustomChecklistRuleItem[]) => {
    setRules(newRules);
    form.setFieldValue('CUSTOM_CHECKLIST_RULES', JSON.stringify(newRules, null, 2));
  };

  const handleSaveRule = () => {
    ruleForm.validateFields().then((values) => {
      if (editingRuleId) {
        const updated = rules.map((r) =>
          r.id === editingRuleId ? { ...values, id: editingRuleId } : r
        );
        updateRulesToForm(updated);
      } else {
        const created: CustomChecklistRuleItem = {
          ...values,
          id: `custom-rule-${Date.now()}`,
        };
        updateRulesToForm([...rules, created]);
      }
      setRuleModalOpen(false);
      ruleForm.resetFields();
      setEditingRuleId(null);
    });
  };

  const handleDeleteRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id);
    updateRulesToForm(next);
  };

  const handleEditRule = (item: CustomChecklistRuleItem) => {
    setEditingRuleId(item.id);
    ruleForm.setFieldsValue(item);
    setRuleModalOpen(true);
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="合同法务审查与合规诊断基线配置"
        description="配置整个组织或数字员工执行合同审查时的全局基准参数，支持设定法务倾向立场、业务分类默认值以及企业专属风控规则库。"
      />

      {/* 1. 组织全局审查倾向 */}
      <Card
        size="small"
        title={<span style={{ fontWeight: 600 }}>🏛️ 组织审查立场与业务分类默认值</span>}
      >
        <Form.Item
          name="DEFAULT_POSITION"
          label="组织默认审查立场（决定审查倾向度与防守侧重点）"
          style={{ marginBottom: 16 }}
        >
          <Select
            allowClear
            placeholder="请选择默认立场（留空默认中立客观）"
            options={[
              { label: '甲方 / 采购方 / 委托方（侧重交付验收保修与进度违约索赔）', value: 'buyer' },
              { label: '乙方 / 软件服务商 / 受托方（侧重防范无偿变更、日历日陷阱与付款延期）', value: 'seller' },
              { label: '中立第三方（客观对等评估双方权责对称性）', value: 'neutral' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="DEFAULT_CONTRACT_TYPE"
          label="默认合同业务分类"
          style={{ marginBottom: 0 }}
        >
          <Select
            allowClear
            placeholder="智能自动识别（推荐）"
            options={[
              { label: '智能自动识别（根据正文内容与标题动态决策）', value: 'auto' },
              { label: '软件定制研发与系统集成协议 (software_development)', value: 'software_development' },
              { label: '商业保密与反泄密协议 (nda)', value: 'nda' },
              { label: '企业采购供货与销售主协议 (procurement)', value: 'procurement' },
              { label: '员工劳动雇佣与竞业禁止协议 (employment)', value: 'employment' },
              { label: '商业用房与场地租赁合同 (lease)', value: 'lease' },
              { label: '通用商业合作主协议 (general)', value: 'general' },
            ]}
          />
        </Form.Item>
      </Card>

      {/* 2. 企业专属审查要点与规则库 */}
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>📋 企业专属审查要点 Checklist（{rules.length} 项已配置）</span>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingRuleId(null);
                ruleForm.resetFields();
                ruleForm.setFieldsValue({ severity: 'HIGH' });
                setRuleModalOpen(true);
              }}
            >
              新增要点
            </Button>
          </div>
        }
        extra={
          customRulesField?.configured && (
            <Popconfirm
              title="确定要清空企业专属审查要点吗？"
              onConfirm={() => {
                setRules([]);
                onClearField('CUSTOM_CHECKLIST_RULES');
              }}
              okText="清空"
              cancelText="取消"
            >
              <Button
                danger
                type="link"
                size="small"
                icon={<DeleteOutlined />}
                loading={clearingKeys['CUSTOM_CHECKLIST_RULES']}
              >
                清空要点
              </Button>
            </Popconfirm>
          )
        }
      >
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
          在此定义的审查要点将自动作为全组织数字员工的最高优先级风控清单（Checklist），在执行审查时优先命中并出具针对性修改示范话术。
        </Paragraph>

        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#999' }}>
            暂未添加企业自定义审查要点，当前将完全基于系统内置法务基准矩阵执行审查。
          </div>
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={rules}
            columns={[
              {
                title: '要点标题',
                dataIndex: 'title',
                key: 'title',
                width: '30%',
                render: (text, record) => (
                  <Space direction="vertical" size={2}>
                    <Text strong>{text}</Text>
                    {record.category && <Tag style={{ fontSize: 10 }}>{record.category}</Tag>}
                  </Space>
                ),
              },
              {
                title: '严重等级',
                dataIndex: 'severity',
                key: 'severity',
                width: 90,
                render: (sev) =>
                  sev === 'HIGH' ? (
                    <Tag color="red">🔴 高危必查</Tag>
                  ) : sev === 'MEDIUM' ? (
                    <Tag color="orange">🟡 中度注意</Tag>
                  ) : (
                    <Tag color="blue">建议关注</Tag>
                  ),
              },
              {
                title: '审查规则描述 / 触发条件',
                dataIndex: 'rule',
                key: 'rule',
                ellipsis: true,
              },
              {
                title: '操作',
                key: 'actions',
                width: 100,
                render: (_, record) => (
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditRule(record)}
                    />
                    <Popconfirm
                      title="确定删除此条审查要点吗？"
                      onConfirm={() => handleDeleteRule(record.id)}
                    >
                      <Button danger type="link" size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}

        {/* 隐藏字段存储 JSON */}
        <Form.Item name="CUSTOM_CHECKLIST_RULES" style={{ display: 'none' }}>
          <Input.TextArea />
        </Form.Item>
      </Card>

      {/* 新增/编辑要点弹窗 */}
      <Modal
        title={editingRuleId ? '编辑审查要点' : '新增企业专属审查要点'}
        open={ruleModalOpen}
        onOk={handleSaveRule}
        onCancel={() => {
          setRuleModalOpen(false);
          ruleForm.resetFields();
          setEditingRuleId(null);
        }}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={ruleForm} layout="vertical" initialValues={{ severity: 'HIGH' }}>
          <Form.Item
            name="title"
            label="要点名称"
            required
            rules={[{ required: true, message: '请输入审查要点名称' }]}
          >
            <Input placeholder="例如：违约金上限合规审查、增值税发票前置付款等" />
          </Form.Item>

          <Form.Item name="category" label="所属法务门类">
            <Input placeholder="例如：商务付款、违约赔偿、交付工期、知识产权" />
          </Form.Item>

          <Form.Item
            name="severity"
            label="风险严重等级"
            required
            rules={[{ required: true, message: '请选择风险严重等级' }]}
          >
            <Select
              options={[
                { label: '🔴 高危必查（触发后计入重大法律漏洞并扣分）', value: 'HIGH' },
                { label: '🟡 中度注意（存在合规瑕疵或权责失衡）', value: 'MEDIUM' },
                { label: '🔵 建议关注（一般性商业提示）', value: 'LOW' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="rule"
            label="审查排查条件与判定规则"
            required
            rules={[{ required: true, message: '请输入排查条件描述' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="例如：排查条款中是否约定违约金超过合同总金额10%，或逾期违约金未设封顶上限"
            />
          </Form.Item>

          <Form.Item name="recommendedRevision" label="法务推荐修改示范话术（可选）">
            <Input.TextArea
              rows={3}
              placeholder="例如：如因乙方原因导致延期交付，每日违约金按延期部分金额的万分之五计算，累计违约金总额不得超过合同总金额的5%。"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
