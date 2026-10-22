import React, { useEffect } from 'react';
import {
  Alert,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Typography,
} from 'antd';
import { BankOutlined } from '@ant-design/icons';
import type { EnterpriseLegalProfile } from './contractReviewRules.types';

const { Text } = Typography;

interface EnterpriseLegalProfileEditModalProps {
  open: boolean;
  profile: EnterpriseLegalProfile;
  onCancel: () => void;
  onSave: (updated: EnterpriseLegalProfile) => void;
}

export const EnterpriseLegalProfileEditModal: React.FC<EnterpriseLegalProfileEditModalProps> = ({
  open,
  profile,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        legalEntityName: profile.legalEntityName,
        creditCode: profile.creditCode || '',
        defaultContractRole: profile.defaultContractRole || 'seller',
        aliases: profile.aliases || [],
      });
    }
  }, [open, profile, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const updated: EnterpriseLegalProfile = {
        legalEntityName: values.legalEntityName.trim(),
        creditCode: values.creditCode ? values.creditCode.trim() : undefined,
        defaultContractRole: values.defaultContractRole,
        aliases: (values.aliases || [])
          .map((a: string) => a.trim())
          .filter((a: string) => Boolean(a && a.length > 0)),
      };
      onSave(updated);
    } catch {
      // Form validation error
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BankOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>维护企业签约主体法人信息</span>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="保存主体配置"
      cancelText="取消"
      width={560}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="智能签约主体识别机制"
        description="合同审查时，系统会优先在合同引言及甲乙方抬头中匹配本企业的全称与别名。若匹配成功，将自动绑定相应防守立场；仅当合同中完全未出现该主体时，才退回默认立场。"
      />

      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="legalEntityName"
          label="法定签约主体全称"
          rules={[{ required: true, message: '请输入企业法定全称' }]}
          extra="营业执照上的标准法人名称，如：富士通（中国）信息系统有限公司"
        >
          <Input placeholder="例如：富士通（中国）信息系统有限公司" />
        </Form.Item>

        <Form.Item
          name="creditCode"
          label="统一社会信用代码"
          extra="用于核验合同签约主体工商注册一致性（选填）"
        >
          <Input placeholder="例如：913100006072834521" />
        </Form.Item>

        <Form.Item
          name="defaultContractRole"
          label="默认防守立场（未匹配到甲乙方时的兜底设定）"
          rules={[{ required: true, message: '请选择默认防守立场' }]}
        >
          <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Radio value="seller">
              <div>
                <Text strong>优先作为乙方 / 受托方 / 供应商 (seller)</Text>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  推荐：重点排查付款宽限期、知识产权保留、免责与责任上限条款。
                </div>
              </div>
            </Radio>
            <Radio value="buyer">
              <div>
                <Text strong>优先作为甲方 / 委托方 / 采购方 (buyer)</Text>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  重点排查交付验收异议期、源代码交付、知识产权独家归属、违约赔偿。
                </div>
              </div>
            </Radio>
            <Radio value="neutral">
              <div>
                <Text strong>双方中立平衡 (neutral)</Text>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  适用于框架协议、双向对等保密、战略合作备忘录。
                </div>
              </div>
            </Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="aliases"
          label="自动识别别名 / 常用简称"
          extra="输入别名后按回车添加。在合同抬头或正文中出现这些别名时均自动视同本企业主体"
        >
          <Select
            mode="tags"
            placeholder="输入别名后回车添加，如：富士通、Fujitsu"
            style={{ width: '100%' }}
            tokenSeparators={[',', '，', ' ']}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
