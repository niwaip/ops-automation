import { useState } from 'react';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage } from '@ops/user-core';
import {
  workbenchTodoApi,
  type CreateWorkbenchTodoPayload,
  type ExtractedTodoPreview,
  type TodoPriority,
} from '../../../../api/workbenchTodo';
import { parseMessageContent } from '../../lib/messageContent';

interface SaveToTodoActionProps {
  message: ChatMessage;
  userQuery?: string;
}

export function SaveToTodoAction({ message, userQuery }: SaveToTodoActionProps) {
  const { message: toast } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [modalVisible, setModalVisible] = useState(false);
  const [savedTodoId, setSavedTodoId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const parsedContent = parseMessageContent(message.content);
  const plainContent = (message.role === 'assistant' ? parsedContent.answer : message.content).trim();

  // 加载可执行工作流列表以供关联
  const { data: capabilities = [] } = useQuery(
    ['task-runnable-capabilities'],
    () => workbenchTodoApi.discoverCapabilities(),
    { enabled: modalVisible, staleTime: 60000 }
  );

  // 触发 5W1H 智能提炼预览
  const extractMutation = useMutation(
    async () => {
      const summaryText = message.metadata?.finalSummary?.trim() || plainContent;
      return await workbenchTodoApi.extractPreview({
        text: summaryText,
        sourceType: 'chat',
        sourceRefId: message.id,
        sourceTitle: userQuery ? `关于「${userQuery.slice(0, 20)}」的对话` : 'AI 对话',
      });
    },
    {
      onSuccess: (preview: ExtractedTodoPreview) => {
        form.setFieldsValue({
          title: preview.title,
          description: preview.description,
          priority: preview.priority,
          dueDate: preview.dueDate ? dayjs(preview.dueDate) : undefined,
          boundWorkflowId: preview.suggestedWorkflowId || undefined,
        });
        setModalVisible(true);
      },
      onError: () => {
        // 若提取失败，仍打开对话框并填入默认兜底数据
        form.setFieldsValue({
          title: userQuery ? `处理: ${userQuery.slice(0, 30)}` : '待办事项',
          description: plainContent,
          priority: 'medium',
          dueDate: undefined,
          boundWorkflowId: undefined,
        });
        setModalVisible(true);
      },
    }
  );

  // 确认创建待办 Mutation
  const createMutation = useMutation(
    async (values: any) => {
      const payload: CreateWorkbenchTodoPayload = {
        title: values.title.trim(),
        description: values.description?.trim(),
        priority: values.priority as TodoPriority,
        dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
        sourceType: 'chat',
        sourceRefId: message.id,
        sourceTitle: userQuery ? `来自对话: ${userQuery.slice(0, 24)}` : '来自 AI 对话',
        boundWorkflowId: values.boundWorkflowId || undefined,
        contextData: {
          chatMessageId: message.id,
          chatSessionId: message.sessionId,
          userQuery: userQuery?.trim(),
          extractedAt: new Date().toISOString(),
        },
      };
      return await workbenchTodoApi.create(payload);
    },
    {
      onSuccess: (created) => {
        setSavedTodoId(created.id);
        setModalVisible(false);
        void queryClient.invalidateQueries(['workbench-todos']);
        toast.success({
          content: (
            <Space>
              <span>已加入工作台待办</span>
              <Button
                type="link"
                size="small"
                onClick={() => navigate('/dashboard')}
                style={{ padding: 0 }}
              >
                前往查看
              </Button>
            </Space>
          ),
          duration: 3.5,
        });
      },
      onError: (err: any) => {
        toast.error(`创建待办失败: ${err?.message || '未知错误'}`);
      },
    }
  );

  const handleOpenModal = () => {
    if (savedTodoId) {
      navigate('/dashboard');
      return;
    }
    extractMutation.mutate();
  };

  const handleConfirm = async () => {
    try {
      const values = await form.validateFields();
      createMutation.mutate(values);
    } catch {
      // Form validation failed
    }
  };

  if (savedTodoId) {
    return (
      <Tooltip title="已加入工作台待办，点击前往工作台">
        <Button
          type="text"
          size="small"
          icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
          onClick={() => navigate('/dashboard')}
          style={{ fontSize: 12, color: '#52c41a' }}
        >
          已存待办
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip title="将此条 AI 分析/建议提炼并转为工作台待办">
        <Button
          type="text"
          size="small"
          icon={extractMutation.isLoading ? <LoadingOutlined /> : <CheckSquareOutlined />}
          onClick={handleOpenModal}
          disabled={extractMutation.isLoading}
          style={{ fontSize: 12, color: '#64748b' }}
        >
          {extractMutation.isLoading ? '提取中...' : '转为待办'}
        </Button>
      </Tooltip>

      <Modal
        title={
          <Space>
            <CheckSquareOutlined style={{ color: '#1677ff' }} />
            <span>智能提炼并创建待办任务</span>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleConfirm}
        confirmLoading={createMutation.isLoading}
        okText="确认加入待办"
        cancelText="取消"
        width={580}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
          系统已自动基于 5W1H 模型提取任务动作、责任要素与截止时间。请核对并确认：
        </Typography.Paragraph>

        <Form form={form} layout="vertical" initialValues={{ priority: 'medium' }}>
          <Form.Item
            name="title"
            label="待办标题 (What)"
            rules={[{ required: true, message: '请输入待办任务标题' }]}
          >
            <Input placeholder="输入任务名称与核心目标" maxLength={100} showCount />
          </Form.Item>

          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="priority" label="优先级">
              <Radio.Group buttonStyle="solid" size="middle">
                <Radio.Button value="low">
                  <Tag color="default" style={{ margin: 0 }}>低</Tag>
                </Radio.Button>
                <Radio.Button value="medium">
                  <Tag color="processing" style={{ margin: 0 }}>中</Tag>
                </Radio.Button>
                <Radio.Button value="high">
                  <Tag color="warning" style={{ margin: 0 }}>高</Tag>
                </Radio.Button>
                <Radio.Button value="urgent">
                  <Tag color="error" style={{ margin: 0 }}>紧急</Tag>
                </Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item name="dueDate" label="截止日期 (When)" style={{ flex: 1 }}>
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                placeholder="选择截止时间"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Space>

          <Form.Item
            name="boundWorkflowId"
            label={
              <Space>
                <span>关联自动化执行工作流 (How)</span>
                <Tag color="purple" icon={<ThunderboltOutlined />}>一键执行</Tag>
              </Space>
            }
            extra="绑定工作流后，可在工作台待办看板中一键触发自动化执行"
          >
            <Select
              allowClear
              placeholder="请选择可执行此任务的自动化工作流（可选）"
              options={capabilities.map((c) => ({
                label: `${c.name} (${c.type})`,
                value: c.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="description" label="详细说明与背景 (Why / Where / Who)">
            <Input.TextArea
              rows={4}
              placeholder="补充任务背景、执行步骤或环境说明"
              maxLength={1000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
