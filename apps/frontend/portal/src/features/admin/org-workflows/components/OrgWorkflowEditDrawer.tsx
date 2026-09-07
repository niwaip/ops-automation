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
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  KeyOutlined,
  OrderedListOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  orgWorkflowApi,
  type OrganizationWorkflowDTO,
  type AssembledBaseWorkflow,
  type WorkflowStageDefinition,
} from '@/api/orgWorkflow';
import { ProcessStageList } from './ProcessStageList';
import { WorkflowAssemblyPanel } from './WorkflowAssemblyPanel';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

interface OrgWorkflowEditDrawerProps {
  visible: boolean;
  workflow: OrganizationWorkflowDTO | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const OrgWorkflowEditDrawer: React.FC<OrgWorkflowEditDrawerProps> = ({
  visible,
  workflow,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const isEditing = Boolean(workflow);

  const [activeTab, setActiveTab] = useState('basic');
  const [assembledWorkflows, setAssembledWorkflows] = useState<AssembledBaseWorkflow[]>([]);
  const [stages, setStages] = useState<WorkflowStageDefinition[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(['employee', 'admin']);
  const [isPublished, setIsPublished] = useState<boolean>(true);

  // 获取 5173 底层可用资产池
  const { data: baseWorkflows = [] } = useQuery(
    ['available-base-workflows'],
    () => orgWorkflowApi.getAvailableBaseWorkflows(),
    { enabled: visible }
  );

  useEffect(() => {
    if (workflow) {
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
    } else {
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
        },
        {
          id: 'approval',
          name: '主管审批',
          type: 'approval',
          description: '直属主管在 GTD 收集箱在线核准或驳回',
          approverRule: 'leader',
          actions: ['approve', 'reject'],
        },
        {
          id: 'auto_execution',
          name: '底层工作流执行',
          type: 'automation',
          description: '审批通过后自动触发绑定的 5173 自动化流闭环',
        },
        {
          id: 'archive',
          name: '回执与归档',
          type: 'archive',
          description: '流转凭证推入收件箱，支持一键归档',
        },
      ]);
      setSelectedRoleIds(['employee', 'admin']);
      setIsPublished(true);
    }
  }, [workflow, visible, form]);

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
          <ApartmentOutlined style={{ color: '#1677ff' }} />
          <span>{isEditing ? `编辑企业工作流 - ${workflow?.name}` : '组装与发布新企业工作流'}</span>
        </Space>
      }
      open={visible}
      onClose={onClose}
      width={760}
      extra={
        <Space>
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
      <Form form={form} layout="vertical" onFinish={saveMutation.mutate}>
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
      </Form>
    </Drawer>
  );
};
