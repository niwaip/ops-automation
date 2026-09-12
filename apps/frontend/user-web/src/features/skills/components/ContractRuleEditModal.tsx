import React, { useEffect } from 'react';
import {
  AutoComplete,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
} from 'antd';
import type {
  RuleScope,
  UserCustomRule,
} from './contractReviewRules.types';

interface ContractRuleEditModalProps {
  open: boolean;
  scope: RuleScope;
  editingRule: UserCustomRule | null;
  onSave: (rule: UserCustomRule) => void;
  onCancel: () => void;
}

const CATEGORY_OPTIONS = [
  { value: '违约赔偿' },
  { value: '付款结算' },
  { value: '知识产权' },
  { value: '验收交付' },
  { value: '工期交付' },
  { value: '质量保证' },
  { value: '争议管辖' },
  { value: '保密防范' },
  { value: '竞业限制' },
  { value: '合同解除' },
  { value: '不可抗力' },
];

const CONTRACT_TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '🌐 适用全部合同类型 (全局通用)', value: 'all' },
  { label: '💻 软件定制研发与系统集成', value: 'software_development' },
  { label: '📦 商业采购买卖与供应协议', value: 'procurement' },
  { label: '👥 劳动用工与高管聘用协议', value: 'employment' },
  { label: '🏢 房屋建筑与经营场地租赁', value: 'lease' },
  { label: '🔒 商业保密与反泄密协议 (NDA)', value: 'nda' },
  { label: '🤝 通用商业合作与框架协议', value: 'general' },
];

export const ContractRuleEditModal: React.FC<ContractRuleEditModalProps> = ({
  open,
  scope,
  editingRule,
  onSave,
  onCancel,
}) => {
  const [form] = Form.useForm<UserCustomRule>();

  useEffect(() => {
    if (open) {
      if (editingRule) {
        form.setFieldsValue(editingRule);
      } else {
        form.resetFields();
        form.setFieldsValue({
          scope,
          applicablePosition: 'both',
          contractType: 'all',
          severity: 'HIGH',
          enabled: true,
          creator: scope === 'org' ? '法务合规部 (管理员)' : '当前用户',
        });
      }
    }
  }, [open, editingRule, scope, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const finalRule: UserCustomRule = {
        ...values,
        id: editingRule ? editingRule.id : `${scope}-${Date.now()}`,
        scope: values.scope || scope,
        enabled: editingRule ? editingRule.enabled : true,
        createdAt: editingRule?.createdAt || new Date().toISOString().split('T')[0],
      };
      onSave(finalRule);
    } catch {
      // Form validation failed
    }
  };

  const isOrg = scope === 'org';

  return (
    <Modal
      title={
        <Space size={8}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            {editingRule
              ? isOrg
                ? '编辑企业组织级法务红线'
                : '编辑个人专属审查要点'
              : isOrg
                ? '新增企业组织级法务红线'
                : '新增个人专属审查要点'}
          </span>
        </Space>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="保存规则"
      cancelText="取消"
      width={680}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        {/* 生效级别 (组织 vs 个人) */}
        <Form.Item
          name="scope"
          label="规则生效级别"
          tooltip="企业组织红线在组织全员执行审查时强制作为高优先级底线排查；个人要点仅对当前登录用户生效。"
          required
        >
          <Radio.Group buttonStyle="solid">
            <Radio.Button value="org">
              🏛️ 企业组织级法务红线 (全员生效)
            </Radio.Button>
            <Radio.Button value="personal">
              👤 个人专属审查要点 (个人生效)
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* 适用立场 (甲方 vs 乙方 vs 通用) */}
        <Form.Item
          name="applicablePosition"
          label="适用签约立场与侧重点"
          tooltip="指定我方在此合同中的身份角色，审查引擎将根据立场对违约、付款、验收、维权等条款重点倾向进行精准诊断。"
          required
        >
          <Radio.Group>
            <Radio value="party_a">
              <span style={{ fontWeight: 500, color: '#16a34a' }}>
                🟢 甲方立场重点 (委托方/采购方/雇主/承租方)
              </span>
            </Radio>
            <Radio value="party_b">
              <span style={{ fontWeight: 500, color: '#2563eb' }}>
                🔵 乙方立场重点 (受托方/供货方/员工/出租方)
              </span>
            </Radio>
            <Radio value="both">
              <span style={{ fontWeight: 500 }}>
                ⚪ 双方通用平等
              </span>
            </Radio>
          </Radio.Group>
        </Form.Item>

        {/* 适用合同类型 */}
        <Form.Item
          name="contractType"
          label="适用合同类型"
          required
          rules={[{ required: true, message: '请选择适用合同类型' }]}
        >
          <Select options={CONTRACT_TYPE_OPTIONS} />
        </Form.Item>

        {/* 规则名称 */}
        <Form.Item
          name="title"
          label={isOrg ? '红线条款名称' : '审查要点名称'}
          required
          rules={[{ required: true, message: '请输入规则名称' }]}
        >
          <Input
            placeholder={
              isOrg
                ? '例如：【红线】付款账期严禁超过45天、违约金上限累计封顶10%'
                : '例如：要求验收异议期不超过5个工作日、重大缺陷2小时内响应'
            }
          />
        </Form.Item>

        <Space style={{ display: 'flex' }} align="start">
          <Form.Item
            name="category"
            label="门类标签"
            style={{ flex: 1, minWidth: 280 }}
            rules={[{ required: true, message: '请输入或选择门类标签' }]}
          >
            <AutoComplete
              options={CATEGORY_OPTIONS}
              placeholder="选择或输入门类，如：违约赔偿、付款结算、知识产权"
            />
          </Form.Item>

          <Form.Item
            name="severity"
            label="风险严重等级"
            style={{ flex: 1, minWidth: 280 }}
            required
            rules={[{ required: true, message: '请选择严重等级' }]}
          >
            <Select
              options={[
                { label: '🔴 高危必查（触发后计入重大风险敞口/红线）', value: 'HIGH' },
                { label: '🟡 中度注意（存在条款瑕疵或权责轻度失衡）', value: 'MEDIUM' },
                { label: '🔵 建议关注（一般性商业合规提醒与建议）', value: 'LOW' },
              ]}
            />
          </Form.Item>
        </Space>

        {/* 排查判定逻辑 */}
        <Form.Item
          name="rule"
          label="审查判定逻辑与排查条件"
          required
          rules={[{ required: true, message: '请输入审查判定规则' }]}
          tooltip="向 AI 审查引擎描述具体的判断标准、触发条件及禁止性要求。"
        >
          <Input.TextArea
            rows={3}
            placeholder="例如：严格排查合同中违约金约定。若每日违约金比例超过千分之零点五，或未约定违约赔偿封顶上限（不高于合同总金额10%），均判定为不合规并提示修改。"
          />
        </Form.Item>

        {/* 示范修订话术 */}
        <Form.Item
          name="recommendedRevision"
          label="法务标准推荐修改示范话术（可选）"
          tooltip="当审查触发此风险或红线时，数字员工直接在审查报告和比对界面中给出的修改建议正文。"
        >
          <Input.TextArea
            rows={3}
            placeholder="例如：双方明确约定：违约金每日按逾期未付/未交付金额的 0.05% 计算，累计最高不得超过本合同总金额的 10%。"
          />
        </Form.Item>

        {/* 维护人/部门 */}
        <Form.Item
          name="creator"
          label={isOrg ? '制定部门 / 管理员' : '配置人姓名 / 角色'}
        >
          <Input placeholder="例如：企业法务合规部 / 采购委员会 / 张经理" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
