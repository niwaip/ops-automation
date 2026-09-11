import React, { useEffect } from 'react';
import {
  Badge,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  CodeOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import type { ToolCatalogItem } from '@/api/tool-catalog';
import {
  CATEGORY_COLORS,
  PROMPT_EXPOSURE_OPTIONS,
  STATUS_META,
  TOOL_RISK_OPTIONS,
  TOOL_STATUS_OPTIONS,
  buildMetadataJson,
  releaseStatusLabel,
} from '../constants/toolConstants';

const { Text, Paragraph } = Typography;
const { Option } = Select;

type BoundSkillItem = NonNullable<
  NonNullable<ToolCatalogItem['usageSummary']>['boundSkills']
>[number];

interface ToolDetailDrawerProps {
  visible: boolean;
  tool?: ToolCatalogItem;
  isLoading: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: Partial<ToolCatalogItem> & { metadataJson?: Record<string, unknown> }) => void;
}

export const ToolDetailDrawer: React.FC<ToolDetailDrawerProps> = ({
  visible,
  tool,
  isLoading,
  isSaving,
  onClose,
  onSave,
}) => {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!tool) {
      form.resetFields();
      return;
    }

    form.setFieldsValue({
      displayName: tool.displayName,
      description: tool.description,
      status: tool.status,
      riskLevel: tool.riskLevel,
      allowSkillBinding: tool.allowSkillBinding,
      promptExposure: tool.promptExposure,
      defaultRequiresConfirmation: tool.defaultRequiresConfirmation,
      defaultRequiresApproval: tool.defaultRequiresApproval,
      metadataJson: JSON.stringify(tool.metadataJson || {}, null, 2),
    });
  }, [tool, form]);

  const handleFinish = async () => {
    try {
      const values = await form.validateFields();
      onSave({
        displayName: values.displayName,
        description: values.description,
        status: values.status,
        riskLevel: values.riskLevel,
        allowSkillBinding: values.allowSkillBinding,
        promptExposure: values.promptExposure,
        defaultRequiresConfirmation: values.defaultRequiresConfirmation,
        defaultRequiresApproval: values.defaultRequiresApproval,
        metadataJson: buildMetadataJson(values.metadataJson),
      });
    } catch {
      // Form validation errors handled automatically
    }
  };

  const boundSkillColumns: ColumnsType<BoundSkillItem> = [
    {
      title: 'Skill 名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Button
          type="link"
          size="small"
          icon={<ThunderboltOutlined />}
          style={{ padding: 0 }}
          onClick={() => navigate(`/admin/skills?q=${encodeURIComponent(name)}`)}
        >
          {name}
        </Button>
      ),
    },
    {
      title: '激活状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (active: boolean) =>
        active ? (
          <Tag color="success">已启用</Tag>
        ) : (
          <Tag color="error">已禁用</Tag>
        ),
    },
    {
      title: '配置状态',
      dataIndex: 'configStatus',
      key: 'configStatus',
      width: 110,
      render: (status?: string) => (
        <Tag
          color={
            status === 'valid' ? 'success' : status === 'invalid' ? 'error' : 'default'
          }
        >
          {status || 'draft'}
        </Tag>
      ),
    },
    {
      title: '公开状态',
      dataIndex: 'isPublished',
      key: 'isPublished',
      width: 100,
      render: (pub: boolean) => (
        <Tag color={pub ? 'processing' : 'default'}>{pub ? '已公开' : '私有'}</Tag>
      ),
    },
    {
      title: '发布状态',
      dataIndex: 'publishedReleaseStatus',
      key: 'publishedReleaseStatus',
      width: 130,
      render: (val?: string | null) => (
        <Tag color={val ? 'blue' : 'default'}>{releaseStatusLabel(val)}</Tag>
      ),
    },
    {
      title: '部署状态',
      dataIndex: 'publishedDeploymentStatus',
      key: 'publishedDeploymentStatus',
      width: 130,
      render: (val?: string | null) => (
        <Tag color={val ? 'purple' : 'default'}>{val || '未部署'}</Tag>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'governance',
      label: (
        <span>
          <SafetyCertificateOutlined /> 基础与门禁治理
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Form.Item
            name="displayName"
            label="能力显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="如：技能意图匹配" />
          </Form.Item>

          <Form.Item name="description" label="功能职责描述">
            <Input.TextArea
              rows={3}
              placeholder="清晰描述该原子能力在模型规划中的职责边界与调用时机"
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="status" label="运行状态" rules={[{ required: true }]}>
              <Select>
                {TOOL_STATUS_OPTIONS.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    <Badge status={STATUS_META[opt.value].badgeStatus} text={opt.label} />
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item name="riskLevel" label="安全风险等级" rules={[{ required: true }]}>
              <Select>
                {TOOL_RISK_OPTIONS.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    <Tag
                      color={
                        opt.value === 'L3'
                          ? 'error'
                          : opt.value === 'L2'
                          ? 'warning'
                          : opt.value === 'L1'
                          ? 'processing'
                          : 'default'
                      }
                    >
                      {opt.label}
                    </Tag>
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Card size="small" title="人工干预与审批门禁 (Human-in-the-Loop)">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>默认执行前需要用户确认</Text>
                  <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                    开启后，大模型在生成调用此工具的动作前，会暂停并提示用户二次确认。
                  </Paragraph>
                </div>
                <Form.Item name="defaultRequiresConfirmation" valuePropName="checked" noStyle>
                  <Switch checkedChildren="需要" unCheckedChildren="不需要" />
                </Form.Item>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>默认执行前需要审批 (Approval)</Text>
                  <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                    开启后，执行单在此步骤会流转至审批中心，经授权审批人核准后方可放行。
                  </Paragraph>
                </div>
                <Form.Item name="defaultRequiresApproval" valuePropName="checked" noStyle>
                  <Switch checkedChildren="需要" unCheckedChildren="不需要" />
                </Form.Item>
              </div>
            </Space>
          </Card>
        </Space>
      ),
    },
    {
      key: 'exposure',
      label: (
        <span>
          <EyeOutlined /> 大模型暴露策略
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Form.Item
            name="promptExposure"
            label="大模型 Prompt 暴露范围"
            rules={[{ required: true }]}
            extra="控制大模型在 ReAct 思考与规划提示词中是否能看到此能力，以及运行时是否允许直接调度。"
          >
            <Radio.Group style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {PROMPT_EXPOSURE_OPTIONS.map((opt) => (
                  <Radio key={opt.value} value={opt.value} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div>
                      <Space>
                        <Tag color={opt.tagColor}>{opt.label}</Tag>
                      </Space>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {opt.desc}
                      </div>
                    </div>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Card size="small" title="业务 Skill 绑定准入门禁">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text strong>允许被业务 Skill 声明与绑定</Text>
                <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
                  如果关闭，任何新建或修改的 Skill 将无法声明依赖该原子能力，阻断非法绑定。
                </Paragraph>
              </div>
              <Form.Item name="allowSkillBinding" valuePropName="checked" noStyle>
                <Switch checkedChildren="允许绑定" unCheckedChildren="禁止绑定" />
              </Form.Item>
            </div>
          </Card>
        </Space>
      ),
    },
    {
      key: 'impact',
      label: (
        <span>
          <ThunderboltOutlined /> 关联 Skill 影响面 ({tool?.usageSummary?.boundSkillCount || 0})
        </span>
      ),
      children: (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">
              当前共有 <Text strong>{tool?.usageSummary?.boundSkillCount || 0}</Text> 个 Skill 正在使用该原子能力：
            </Text>
            {tool?.usageSummary?.boundSkillCount ? (
              <Button
                type="link"
                size="small"
                onClick={() => navigate(`/admin/skills?q=${encodeURIComponent(tool.name)}`)}
              >
                在技能管理中查看全部
              </Button>
            ) : null}
          </div>

          {tool?.usageSummary?.boundSkills?.length ? (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              columns={boundSkillColumns}
              dataSource={tool.usageSummary.boundSkills}
              scroll={{ x: 740 }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <Text type="secondary">暂无业务 Skill 绑定此原子能力</Text>
            </div>
          )}
        </Space>
      ),
    },
    {
      key: 'metadata',
      label: (
        <span>
          <CodeOutlined /> 扩展元数据 (JSON)
        </span>
      ),
      children: (
        <Form.Item
          name="metadataJson"
          label="自定义扩展属性 (JSON Object)"
          extra='例如：{"owner": "core-planner", "timeoutMs": 5000}'
          rules={[
            {
              validator: async (_, val: string) => {
                if (!val?.trim()) return;
                buildMetadataJson(val);
              },
            },
          ]}
        >
          <Input.TextArea
            rows={10}
            style={{
              fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
              fontSize: 13,
            }}
          />
        </Form.Item>
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space size={10} align="center">
          <ToolOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>模型原子能力治理</span>
        </Space>
      }
      width={840}
      open={visible}
      onClose={onClose}
      destroyOnHidden
      styles={{
        body: {
          background: 'var(--bg-primary)',
          paddingBottom: 80,
        },
      }}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleFinish} loading={isSaving}>
            保存治理配置
          </Button>
        </Space>
      }
    >
      {isLoading ? (
        <Card loading />
      ) : tool ? (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Header Summary Banner */}
          <Card
            size="small"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color-base, #e8e8e8)',
              borderRadius: 10,
            }}
          >
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="能力标识 (name)">
                <span
                  style={{
                    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                    fontWeight: 600,
                    color: '#1677ff',
                  }}
                >
                  {tool.name}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="当前类别">
                <Tag color={CATEGORY_COLORS[tool.category || ''] || 'default'}>
                  {tool.category || '未分类'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="运行类型">
                <Tag>
                  <CodeOutlined style={{ marginRight: 4 }} />
                  {tool.runtimeType || 'default'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="最近更新">
                {tool.updatedAt ? new Date(tool.updatedAt).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Form form={form} layout="vertical">
            <Tabs defaultActiveKey="governance" items={tabItems} />
          </Form>
        </Space>
      ) : null}
    </Drawer>
  );
};
