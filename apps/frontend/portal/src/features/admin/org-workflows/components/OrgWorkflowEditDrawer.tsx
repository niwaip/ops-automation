import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tabs,
  Card,
  Switch,
  message,
  Checkbox,
  Typography,
  Segmented,
  Tag,
  Tooltip,
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  OrderedListOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  orgWorkflowApi,
  type OrganizationWorkflowDTO,
  type AssembledBaseWorkflow,
  type WorkflowStageDefinition,
  type WorkflowParamsSchema,
} from '@/api/orgWorkflow';
import { PRESET_WORKFLOW_TEMPLATES } from '../constants/orgWorkflowPresets';
import { ProcessStageList } from './ProcessStageList';
import { WorkflowAssemblyPanel } from './WorkflowAssemblyPanel';
import { OrgWorkflowVisualEditor } from './visual-editor/OrgWorkflowVisualEditor';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

interface OrgWorkflowEditDrawerProps {
  visible: boolean;
  workflow: OrganizationWorkflowDTO | null;
  initialTemplateId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrgWorkflowEditDrawer: React.FC<OrgWorkflowEditDrawerProps> = ({
  visible,
  workflow,
  initialTemplateId,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const { token } = theme.useToken();
  const queryClient = useQueryClient();
  const isEditing = Boolean(workflow);

  const [activeTab, setActiveTab] = useState('basic');
  const [viewMode, setViewMode] = useState<'canvas' | 'form'>('canvas');
  const [assembledWorkflows, setAssembledWorkflows] = useState<AssembledBaseWorkflow[]>([]);
  const [stages, setStages] = useState<WorkflowStageDefinition[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(['employee', 'admin']);
  const [isPublished, setIsPublished] = useState<boolean>(true);
  const [paramsSchema, setParamsSchema] = useState<WorkflowParamsSchema | undefined>(undefined);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);

  // 获取 5173 底层可用资产池
  const { data: baseWorkflows = [] } = useQuery(
    ['available-base-workflows'],
    () => orgWorkflowApi.getAvailableBaseWorkflows(),
    { enabled: visible }
  );

  const applyPresetTemplate = (templateId: string) => {
    const preset = PRESET_WORKFLOW_TEMPLATES.find((p) => p.id === templateId);
    if (!preset || !preset.workflow) return;

    setSelectedTemplateId(templateId);
    form.setFieldsValue({
      workflowId: preset.workflow.workflowId,
      name: preset.workflow.name,
      description: preset.workflow.description,
      category: preset.workflow.category,
      taskType: preset.workflow.taskType,
      icon: preset.workflow.icon || 'ApartmentOutlined',
    });

    setAssembledWorkflows(preset.workflow.assembledWorkflows || []);
    setStages(preset.workflow.processDefinition?.stages || []);
    setSelectedRoleIds(preset.workflow.grantedRoleIds || ['employee', 'admin']);
    setIsPublished(preset.workflow.isPublished ?? true);
    setParamsSchema(preset.workflow.paramsSchema);

    message.success(`已成功载入模版【${preset.name}】，包含预置阶段与合规锁定规则！`);
  };

  useEffect(() => {
    if (visible) {
      if (workflow) {
        setSelectedTemplateId(undefined);
        form.setFieldsValue({
          workflowId: workflow.workflowId,
          name: workflow.name,
          description: workflow.description,
          category: workflow.category,
          taskType: workflow.taskType,
          icon: workflow.icon || 'ApartmentOutlined',
        });
        setAssembledWorkflows(workflow.assembledWorkflows || []);
        setStages(workflow.processDefinition?.stages || []);
        setSelectedRoleIds(workflow.grantedRoleIds || ['employee', 'admin']);
        setIsPublished(workflow.isPublished);
        setParamsSchema(workflow.paramsSchema);
      } else if (initialTemplateId) {
        applyPresetTemplate(initialTemplateId);
      } else {
        setSelectedTemplateId(undefined);
        form.resetFields();
        form.setFieldsValue({
          category: 'general',
          taskType: 'approval',
          icon: 'ApartmentOutlined',
        });
        setAssembledWorkflows([]);
        setStages([
          {
            id: 'submit',
            name: '发起申请',
            type: 'submission',
            description: '申请人在线填写表单参数卡片',
            isLocked: false,
          },
          {
            id: 'approval',
            name: '主管审批',
            type: 'approval',
            description: '直属主管在 GTD 收集箱在线核准或驳回',
            approverRule: 'leader',
            actions: ['approve', 'reject'],
            isLocked: true,
          },
          {
            id: 'auto_execution',
            name: '底层工作流执行',
            type: 'automation',
            description: '审批通过后自动触发绑定的 5173 自动化流闭环',
            isLocked: true,
          },
          {
            id: 'archive',
            name: '回执与归档',
            type: 'archive',
            description: '流转凭证推入收件箱，支持一键归档',
            isLocked: false,
          },
        ]);
        setSelectedRoleIds(['employee', 'admin']);
        setIsPublished(true);
        setParamsSchema(undefined);
      }
    }
  }, [workflow, visible, initialTemplateId, form]);

  const saveMutation = useMutation(
    async (values: any) => {
      const payload: any = {
        name: values.name.trim(),
        description: values.description?.trim() || '',
        category: values.category,
        taskType: values.taskType,
        icon: values.icon,
        status: isPublished ? 'published' : 'draft',
        assembledWorkflows,
        processDefinition: { stages },
        grantedRoleIds: selectedRoleIds,
        paramsSchema: paramsSchema || workflow?.paramsSchema,
      };

      if (isEditing && workflow) {
        return await orgWorkflowApi.updateWorkflow(workflow.id, payload);
      } else {
        payload.workflowId = values.workflowId.trim();
        return await orgWorkflowApi.createWorkflow(payload);
      }
    },
    {
      onSuccess: () => {
        message.success(isEditing ? '企业工作流已更新' : '企业工作流已成功创建并完成组装');
        queryClient.invalidateQueries(['admin-org-workflows']);
        onSuccess();
        onClose();
      },
      onError: (err: any) => {
        message.error(`保存失败: ${err.message || '未知错误'}`);
      },
    }
  );

  return (
    <Drawer
      title={
        <Space>
          <ApartmentOutlined style={{ color: token.colorPrimary }} />
          <span style={{ fontWeight: 600 }}>{isEditing ? `编辑企业工作流 - ${workflow?.name}` : '组装与发布新企业工作流'}</span>
        </Space>
      }
      open={visible}
      onClose={onClose}
      width={viewMode === 'canvas' ? 'min(98vw, 1800px)' : 860}
      styles={{
        body: {
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          background: token.colorBgLayout,
        },
        header: {
          padding: '10px 16px',
        },
      }}
      bodyStyle={{
        padding: '8px 14px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: token.colorBgLayout,
      }}
      extra={
        <Space size={12}>
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'canvas' | 'form')}
            options={[
              { label: '🎨 可视化编排画布', value: 'canvas' },
              { label: '📋 表格列表模式', value: 'form' },
            ]}
          />
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={saveMutation.isLoading}
            onClick={() => form.submit()}
          >
            {isPublished ? '保存并发布 (Publish)' : '保存为草稿 (Save Draft)'}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={saveMutation.mutate}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0 }}
      >
        {/* 官方标准预置模版载入条 */}
        {!isEditing && (
          <div
            style={{
              marginBottom: 8,
              padding: '6px 14px',
              background: token.colorInfoBg,
              borderRadius: 8,
              border: `1px solid ${token.colorInfoBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <Space size={8}>
              <ThunderboltOutlined style={{ color: token.colorPrimary, fontSize: 15 }} />
              <div>
                <span style={{ fontWeight: 600, fontSize: 12, color: token.colorText, marginRight: 8 }}>
                  从企业官方标准模版快速载入:
                </span>
                <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                  支持一键生成保密协议(NDA)与法务审查闭环、员工请假、费用报销等合规架构
                </span>
              </div>
            </Space>

            <Select
              value={selectedTemplateId}
              placeholder="⚡ 点击选择预置模版载入..."
              style={{ width: 340 }}
              size="small"
              allowClear
              onChange={(val) => {
                if (val) {
                  applyPresetTemplate(val);
                }
              }}
            >
              {PRESET_WORKFLOW_TEMPLATES.map((preset) => (
                <Option key={preset.id} value={preset.id}>
                  <Space>
                    <Tag
                      color={
                        preset.category === 'legal'
                          ? 'geekblue'
                          : preset.category === 'hr'
                          ? 'green'
                          : 'orange'
                      }
                      style={{ margin: 0, fontSize: 10 }}
                    >
                      {preset.categoryName}
                    </Tag>
                    <span
                      style={{
                        fontWeight:
                          preset.id === 'legal.contract.review_flow' ? 600 : 400,
                      }}
                    >
                      {preset.name}
                    </span>
                  </Space>
                </Option>
              ))}
            </Select>
          </div>
        )}

        {/* 常驻基础属性快速配置条（完全适配 Dark/Light 模式） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '6px 14px',
            marginBottom: 8,
            background: token.colorBgContainer,
            borderRadius: 8,
            border: `1px solid ${token.colorBorderSecondary}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
            {!isEditing && (
              <Form.Item
                label={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>ID</span>}
                name="workflowId"
                rules={[{ required: true, message: '请输入唯一代号' }]}
                style={{ margin: 0, width: 170 }}
              >
                <Input placeholder="如 legal.nda.flow" size="small" />
              </Form.Item>
            )}
            <Form.Item
              label={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>名称</span>}
              name="name"
              rules={[{ required: true, message: '请输入工作流名称' }]}
              style={{ margin: 0, flex: 1, minWidth: 180 }}
            >
              <Input placeholder="如 合同起草与法务审查闭环" size="small" />
            </Form.Item>
            <Form.Item
              label={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>分类</span>}
              name="category"
              rules={[{ required: true }]}
              style={{ margin: 0, width: 155 }}
            >
              <Select size="small">
                <Option value="legal">法务合规 (Legal)</Option>
                <Option value="hr">HR 人事考勤</Option>
                <Option value="oa">OA 行政报销</Option>
                <Option value="it">IT 运维资产</Option>
                <Option value="finance">财务审计</Option>
                <Option value="general">通用组织协同</Option>
              </Select>
            </Form.Item>
            <Form.Item
              label={<span style={{ fontSize: 12, color: token.colorTextSecondary }}>类型</span>}
              name="taskType"
              rules={[{ required: true }]}
              style={{ margin: 0, width: 155 }}
            >
              <Select size="small">
                <Option value="approval">审批流转 (Approval)</Option>
                <Option value="assignment">工作指派 (Assignment)</Option>
                <Option value="review">审阅复核 (Review)</Option>
              </Select>
            </Form.Item>
          </div>

          {viewMode === 'canvas' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <Tooltip title="点击画布中的阶段卡片可在右侧检视属性；从左侧物料拖入节点或底层资产。">
                <Space size={4} style={{ cursor: 'pointer', color: token.colorTextTertiary, fontSize: 12 }}>
                  <InfoCircleOutlined />
                  <span>编排提示</span>
                </Space>
              </Tooltip>
              <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>阶段: {stages.length}</Tag>
              <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>资产: {assembledWorkflows.length}</Tag>
            </div>
          )}
        </div>

        {viewMode === 'canvas' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <OrgWorkflowVisualEditor
              stages={stages}
              assembledWorkflows={assembledWorkflows}
              availableWorkflows={baseWorkflows}
              onChangeStages={setStages}
              onChangeAssembledWorkflows={setAssembledWorkflows}
            />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
          items={[
            {
              key: 'basic',
              label: (
                <span>
                  <SettingOutlined /> 基础信息
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Form.Item
                    label="企业工作流唯一标识 (Workflow ID / Key)"
                    name="workflowId"
                    rules={[{ required: !isEditing, message: '请输入唯一代号，如 hr.leave.request' }]}
                    tooltip="企业内全局唯一的流程契约代号，由小写字母、点号组成"
                  >
                    <Input
                      disabled={isEditing}
                      placeholder="如：hr.leave.request / oa.expense.claim / it.device.borrow"
                    />
                  </Form.Item>

                  <Form.Item
                    label="工作流名称"
                    name="name"
                    rules={[{ required: true, message: '请输入工作流显示名称' }]}
                  >
                    <Input placeholder="如：员工请假审批 / 差旅报销审批" />
                  </Form.Item>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item label="业务分类" name="category" rules={[{ required: true }]}>
                      <Select>
                        <Option value="hr">HR 人事考勤</Option>
                        <Option value="oa">OA 行政报销</Option>
                        <Option value="it">IT 运维资产</Option>
                        <Option value="finance">财务审计</Option>
                        <Option value="general">通用组织协同</Option>
                      </Select>
                    </Form.Item>

                    <Form.Item label="协同任务类型" name="taskType" rules={[{ required: true }]}>
                      <Select>
                        <Option value="approval">审批流转 (Approval - 需核准/驳回)</Option>
                        <Option value="assignment">工作指派 (Assignment - 办理交付)</Option>
                        <Option value="review">审阅复核 (Review - 审阅归档)</Option>
                      </Select>
                    </Form.Item>
                  </div>

                  <Form.Item label="工作流详细描述" name="description">
                    <TextArea
                      rows={3}
                      placeholder="简述此企业业务流程的应用场景、审批路径与自动化联动效果"
                    />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'assembly',
              label: (
                <span>
                  <ApiOutlined /> 5173 底层工作流组装 ({assembledWorkflows.length})
                </span>
              ),
              children: (
                <WorkflowAssemblyPanel
                  assembledWorkflows={assembledWorkflows}
                  availableWorkflows={baseWorkflows}
                  onChange={setAssembledWorkflows}
                />
              ),
            },
            {
              key: 'process',
              label: (
                <span>
                  <OrderedListOutlined /> 流程定义 (Process Definition) ({stages.length})
                </span>
              ),
              children: (
                <ProcessStageList
                  stages={stages}
                  onChange={setStages}
                />
              ),
            },
            {
              key: 'publish_and_roles',
              label: (
                <span>
                  <KeyOutlined /> 权限授权与发布
                </span>
              ),
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Card size="small" title="发布生命周期控制">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>发布状态 (Publish Status)</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          已发布后将在 5174（用户工作台）展示；草稿态仅在 5173 管理后台可见。
                        </div>
                      </div>
                      <Switch
                        checkedChildren="已发布 (Published)"
                        unCheckedChildren="草稿 (Draft)"
                        checked={isPublished}
                        onChange={setIsPublished}
                      />
                    </div>
                  </Card>

                  <Card size="small" title="授权可见与发起角色 (Role Permissions)">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <Text type="secondary">
                        选择有权在 5174 发起该流程的角色。未授权员工将被标识为「待开通」，支持提交开通申请。
                      </Text>

                      {['employee', 'admin', 'finance', 'hr'].map((role) => {
                        const isChecked = selectedRoleIds.includes(role);
                        return (
                          <Checkbox
                            key={role}
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedRoleIds((prev) =>
                                e.target.checked
                                  ? [...prev, role]
                                  : prev.filter((r) => r !== role)
                              );
                            }}
                          >
                            <strong>{role}</strong> (
                            {role === 'employee'
                              ? '普通在岗员工'
                              : role === 'admin'
                              ? '系统管理员'
                              : role === 'finance'
                              ? '财务审核专员'
                              : '人事 HR 专员'}
                            )
                          </Checkbox>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              ),
            },
          ]}
        />
      </div>
    )}
      </Form>
    </Drawer>
  );
};
