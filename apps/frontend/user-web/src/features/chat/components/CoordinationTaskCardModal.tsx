import {
  CheckSquareOutlined,
  EyeOutlined,
  FileDoneOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Segmented,
  Space,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'react-query';
import {
  workbenchCoordinationApi,
  type CollaboratorUser,
  type CoordinationAttachment,
  type CoordinationTask,
} from '../../../api/workbenchCoordination';
import { DynamicWorkflowForm } from './DynamicWorkflowForm';
import { buildDynamicWorkflowCardPayload } from '../lib/dynamicWorkflowCard';

interface CoordinationTaskCardModalProps {
  open: boolean;
  initialAssignee?: CollaboratorUser | null;
  initialTemplateId?: string;
  initialValues?: Record<string, any>;
  onClose: () => void;
  onSuccess: (task: CoordinationTask, markdownCard?: string) => void;
}

export function CoordinationTaskCardModal({
  open,
  initialAssignee,
  initialTemplateId,
  initialValues,
  onClose,
  onSuccess,
}: CoordinationTaskCardModalProps) {
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialTemplateId || 'general.coordination'
  );

  const { data: templates = [] } = useQuery(
    ['workflow-templates'],
    () => workbenchCoordinationApi.getWorkflowTemplates(),
    {
      staleTime: 60000,
      enabled: open,
    }
  );

  const currentTemplate = useMemo(() => {
    return (
      templates.find((t) => t.workflowId === selectedTemplateId) ||
      templates.find((t) => t.workflowId === 'general.coordination') ||
      templates[0]
    );
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (open) {
      if (initialTemplateId) {
        setSelectedTemplateId(initialTemplateId);
      }
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
    } else {
      form.resetFields();
      setFileList([]);
    }
  }, [open, initialTemplateId, initialValues, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      const attachments: CoordinationAttachment[] = fileList.map((f) => ({
        name: f.name,
        size: f.size,
        url: f.url || (f.response as any)?.url,
        mimeType: f.type,
      }));

      let title = values.title;
      let content = values.content;
      let taskType = values.taskType || currentTemplate?.taskType || 'approval';
      let parameters = values;
      let markdownCard: string | undefined;

      if (currentTemplate && currentTemplate.workflowId !== 'general.coordination') {
        const payload = buildDynamicWorkflowCardPayload(
          currentTemplate,
          values,
          initialAssignee
        );
        title = payload.title;
        content = payload.content;
        taskType = payload.taskType;
        parameters = payload.parameters;
        markdownCard = payload.markdownCard;
      }

      const created = await workbenchCoordinationApi.createTask({
        assigneeId: initialAssignee?.id || values.assigneeId,
        assigneeName: initialAssignee?.username,
        workflowId: currentTemplate?.workflowId,
        parameters,
        taskType,
        title,
        content,
        priority: values.priority || 'medium',
        dueDate: values.dueDate ? dayjs(values.dueDate).toISOString() : undefined,
        attachments,
        isCardTemplate: true,
      });

      message.success(
        `已成功发起业务卡片「${created.title}」，已推入 @${
          initialAssignee?.username || '对方'
        } 的 GTD 收件箱`
      );
      form.resetFields();
      setFileList([]);
      onSuccess(created, markdownCard);
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '发起协同任务失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            paddingRight: 24,
          }}
        >
          <Space size={8} align="center">
            <CheckSquareOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <span style={{ fontWeight: 600 }}>
              {currentTemplate ? `【${currentTemplate.name}】业务规范卡片` : '发起业务工作流协同'}
            </span>
          </Space>
          {currentTemplate && (
            <Tag
              color={
                currentTemplate.category === 'hr'
                  ? 'magenta'
                  : currentTemplate.category === 'oa'
                  ? 'green'
                  : 'blue'
              }
            >
              {currentTemplate.category?.toUpperCase() || '业务系统'} · {currentTemplate.workflowId}
            </Tag>
          )}
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={isSubmitting}
      okText={currentTemplate ? `发布【${currentTemplate.name}】` : '发布协同任务'}
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      {initialAssignee ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 10px',
            background: 'rgba(22, 119, 255, 0.05)',
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          <Space size={6} align="center">
            <span style={{ color: 'var(--ant-color-text-secondary)' }}>审批 / 承办人:</span>
            <Tag color="blue" style={{ margin: 0, fontSize: 12, borderRadius: 10, padding: '0 6px' }}>
              @{initialAssignee.username} ({initialAssignee.email || '协同成员'})
            </Tag>
          </Space>
          {currentTemplate?.description ? (
            <span
              style={{
                color: 'var(--ant-color-text-tertiary)',
                maxWidth: 240,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={currentTemplate.description}
            >
              {currentTemplate.description}
            </span>
          ) : null}
        </div>
      ) : null}

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          taskType: currentTemplate?.taskType || 'approval',
          priority: 'medium',
          ...initialValues,
        }}
      >
        {!initialTemplateId && templates && templates.length > 0 && (
          <Form.Item label="选择业务流程模版" style={{ marginBottom: 10 }}>
            <Select
              placeholder="请选择要发起的业务工作流"
              value={selectedTemplateId}
              onChange={(val) => {
                setSelectedTemplateId(val);
                form.resetFields();
              }}
              options={templates.map((tpl) => ({
                label: `${tpl.name} (${tpl.category?.toUpperCase() || '流程'} · ${tpl.workflowId})`,
                value: tpl.workflowId,
              }))}
            />
          </Form.Item>
        )}

        {currentTemplate && currentTemplate.workflowId !== 'general.coordination' ? (
          <DynamicWorkflowForm
            template={currentTemplate}
            form={form}
            initialValues={initialValues}
          />
        ) : (
          <>
            <Form.Item
              name="taskType"
              label="协同类型"
              rules={[{ required: true, message: '请选择协同类型' }]}
              style={{ marginBottom: 10 }}
            >
              <Radio.Group buttonStyle="solid" style={{ width: '100%' }}>
                <Radio.Button value="approval" style={{ width: '33.3%', textAlign: 'center' }}>
                  <CheckSquareOutlined /> 审批承认
                </Radio.Button>
                <Radio.Button value="assignment" style={{ width: '33.3%', textAlign: 'center' }}>
                  <FileDoneOutlined /> 作业布置
                </Radio.Button>
                <Radio.Button value="review" style={{ width: '33.3%', textAlign: 'center' }}>
                  <EyeOutlined /> 查阅复核
                </Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="title"
              label="任务标题"
              rules={[{ required: true, message: '请输入任务标题' }]}
              style={{ marginBottom: 10 }}
            >
              <Input placeholder="例如：Q3测试报告承认、完成自动化脚本审查作业" />
            </Form.Item>

            <Form.Item
              name="content"
              label="具体要求与说明"
              rules={[{ required: true, message: '请输入具体要求与说明' }]}
              style={{ marginBottom: 10 }}
            >
              <Input.TextArea
                rows={2}
                placeholder="请详细列出作业标准、审核背景或交付要求..."
              />
            </Form.Item>
          </>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            columnGap: 12,
            rowGap: 0,
            marginTop: 4,
          }}
        >
          <Form.Item name="priority" label="优先级" style={{ marginBottom: 10 }}>
            <Segmented
              block
              options={[
                { label: '普通', value: 'medium' },
                { label: '重要', value: 'high' },
                { label: '紧急', value: 'urgent' },
              ]}
            />
          </Form.Item>

          <Form.Item name="dueDate" label="期望完成截止时间" style={{ marginBottom: 10 }}>
            <DatePicker showTime style={{ width: '100%' }} placeholder="选填，选择截止时间" />
          </Form.Item>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 2,
          }}
        >
          <Upload
            fileList={fileList}
            beforeUpload={(file) => {
              setFileList((prev) => [...prev, file]);
              return false;
            }}
            onRemove={(file) => {
              setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
            }}
          >
            <Button size="small" icon={<UploadOutlined />}>
              上传佐证附件 {fileList.length > 0 ? `(${fileList.length})` : ''}
            </Button>
          </Upload>
          <span style={{ fontSize: 12, color: 'var(--ant-color-text-quaternary)' }}>
            审批核准后自动联动外部系统
          </span>
        </div>
      </Form>
    </Modal>
  );
}
