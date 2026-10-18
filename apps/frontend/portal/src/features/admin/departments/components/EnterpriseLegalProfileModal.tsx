import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Radio, Alert, Space, Typography } from 'antd';
import { BankOutlined, SafetyCertificateOutlined, IdcardOutlined } from '@ant-design/icons';
import type { OrganizationSummary, UpdateLegalProfileParams } from '@/api/organization';

const { Text } = Typography;

interface EnterpriseLegalProfileModalProps {
  open: boolean;
  org: OrganizationSummary | null;
  loading: boolean;
  onCancel: () => void;
  onSave: (values: UpdateLegalProfileParams) => void;
}

export const EnterpriseLegalProfileModal: React.FC<EnterpriseLegalProfileModalProps> = ({
  open,
  org,
  loading,
  onCancel,
  onSave,
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open && org) {
      form.setFieldsValue({
        legalEntityName: org.legalEntityName || '富士通（中国）信息系统有限公司',
        creditCode: org.creditCode || '913100006072834521',
        aliases: org.aliases && org.aliases.length > 0
          ? org.aliases
          : ['富士通', '富士通（中国）', '富士通信息', 'Fujitsu', 'Fujitsu China', '富士通株式会社'],
        defaultContractRole: org.defaultContractRole || 'seller',
      });
    }
  }, [open, org, form]);

  const handleOk = () => {
    form.validateFields().then((values) => {
      onSave({
        legalEntityName: values.legalEntityName?.trim(),
        creditCode: values.creditCode?.trim(),
        aliases: values.aliases || [],
        defaultContractRole: values.defaultContractRole || 'seller',
      });
    });
  };

  return (
    <Modal
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
          <span>企业法定签约主体与主体资料配置</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnClose
      width={600}
      okText="保存主体配置"
      cancelText="取消"
    >
      <Alert
        style={{ marginBottom: 20 }}
        type="info"
        showIcon
        message="企业合同与审批流主数据源"
        description="此处配置的法定全称、识别别名与统一社会信用代码，将被智能合同审查、比对和自动审批流作为官方我方主体进行自动匹配识别，无需员工在每次发起时手动选择立场。"
      />

      <Form form={form} layout="vertical">
        <Form.Item
          label="企业法定全称 (注册名称)"
          name="legalEntityName"
          rules={[{ required: true, message: '请输入企业法定全称' }]}
          extra="用于与合同前言/签署页的甲方、乙方进行严格与模糊匹配。"
        >
          <Input
            prefix={<BankOutlined style={{ color: '#8c8c8c' }} />}
            placeholder="例如：富士通（中国）信息系统有限公司"
          />
        </Form.Item>

        <Form.Item
          label="统一社会信用代码 / 税号"
          name="creditCode"
          extra="用于合同主体校验及模板占位符自动填充（如 18 位社会信用代码）。"
        >
          <Input
            prefix={<IdcardOutlined style={{ color: '#8c8c8c' }} />}
            placeholder="例如：913100006072834521"
          />
        </Form.Item>

        <Form.Item
          label="常用识别简称与中英文别名"
          name="aliases"
          extra="合同正文或前言常出现的企业简称，系统在审查时会自动视作我方主体（回车可添加多项）。"
        >
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="输入别名后回车添加，如：富士通、Fujitsu"
            tokenSeparators={[',', ' ']}
          />
        </Form.Item>

        <Form.Item
          label="默认商业角色倾向 (当合同未明示或双向对等时)"
          name="defaultContractRole"
          rules={[{ required: true }]}
          extra="当合同前言未匹配到明确买卖方向时，审查引擎优先以何种立场展开合规防御。"
        >
          <Radio.Group>
            <Radio value="seller">
              <Space direction="vertical" size={0}>
                <Text strong>优先作为乙方 / 技术服务商 / 供应商 (推荐)</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>强化知识产权保留、限制过度质保与无限连带违约金</Text>
              </Space>
            </Radio>
            <div style={{ height: 8 }} />
            <Radio value="buyer">
              <Space direction="vertical" size={0}>
                <Text strong>优先作为甲方 / 采购方 / 委托客户</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>强化交付验收期、严格保密违约责任与索赔救济</Text>
              </Space>
            </Radio>
            <div style={{ height: 8 }} />
            <Radio value="neutral">
              <Space direction="vertical" size={0}>
                <Text strong>双向对等 / 客观中立立场</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>适用于框架性保密协议或对等战略合作合同</Text>
              </Space>
            </Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
};
