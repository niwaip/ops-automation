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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import {
  workbenchCoordinationApi,
  type CollaboratorUser,
  type CoordinationAttachment,
  type CoordinationTask,
} from '../../../api/workbenchCoordination';
import { DynamicWorkflowForm } from './DynamicWorkflowForm';
import { buildDynamicWorkflowCardPayload } from '../lib/dynamicWorkflowCard';
import { setPendingWorkflowParameters } from '../lib/workflowNaturalLanguageRouter';

interface CoordinationTaskCardModalProps {
  open: boolean;
  initialAssignee?: CollaboratorUser | null;
  initialTemplateId?: string;
  initialValues?: Record<string, any>;
  onClose: () => void;
  onSuccess: (task: CoordinationTask | null, markdownCard?: string) => void;
}

const EMPTY_TEMPLATES: any[] = [];
const EMPTY_COLLABORATORS: CollaboratorUser[] = [];

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
    initialTemplateId || 'legal.contract.review_flow'
  );
  const wasOpenRef = useRef(false);

  const { data: templates = EMPTY_TEMPLATES } = useQuery(
    ['workflow-templates'],
    () => workbenchCoordinationApi.getWorkflowTemplates(),
    {
      staleTime: 60000,
      enabled: open,
    }
  );

  const { data: collaborators = EMPTY_COLLABORATORS } = useQuery(
    ['collaborators-list'],
    () => workbenchCoordinationApi.searchCollaborators(),
    {
      staleTime: 60000,
      enabled: open,
    }
  );

  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');

  const currentTemplate = useMemo(() => {
    return (
      templates.find((t) => t.workflowId === selectedTemplateId) ||
      templates[0]
    );
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      if (initialTemplateId) {
        setSelectedTemplateId(initialTemplateId);
      }
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
      if (initialAssignee?.id) {
        setSelectedAssigneeId(initialAssignee.id);
      } else if (collaborators.length > 0) {
        const isLegal =
          selectedTemplateId?.includes('legal') ||
          selectedTemplateId?.includes('nda');
        const legalUser = isLegal
          ? collaborators.find(
              (c) =>
                c.departmentName === '法务部' ||
                c.username?.toLowerCase().includes('law')
            )
          : null;
        setSelectedAssigneeId(legalUser?.id || collaborators[0].id);
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      form.resetFields();
      setFileList([]);
    }
  }, [open, initialTemplateId, initialValues, form, initialAssignee, collaborators, selectedTemplateId]);

  const activeAssignee = useMemo<CollaboratorUser | null>(() => {
    if (selectedAssigneeId) {
      const found = collaborators.find((c) => c.id === selectedAssigneeId);
      if (found) return found;
    }
    if (initialAssignee?.id) {
      return initialAssignee;
    }
    return collaborators[0] || null;
  }, [selectedAssigneeId, collaborators, initialAssignee]);

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

      const targetAssigneeId =
        activeAssignee?.id || initialAssignee?.id || values.assigneeId;
      const targetAssigneeName =
        activeAssignee?.username || initialAssignee?.username;

      if (!targetAssigneeId) {
        message.warning('请选择审批/承办人后再提交');
        return;
      }

      let title = values.title;
      let content = values.content;
      let taskType = values.taskType || currentTemplate?.taskType || 'approval';
      let parameters = values;
      let markdownCard: string | undefined;

      if (currentTemplate && currentTemplate.paramsSchema?.properties) {
        const payload = buildDynamicWorkflowCardPayload(
          currentTemplate,
          values,
          activeAssignee
        );
        title = payload.title;
        content = payload.content;
        taskType = payload.taskType;
        parameters = payload.parameters;
        markdownCard = payload.markdownCard;
      }

      const isNdaWorkflow =
        currentTemplate?.workflowId === 'legal.nda.generation_and_review_flow' ||
        selectedTemplateId === 'legal.nda.generation_and_review_flow';

      if (isNdaWorkflow) {
        const partyA = parameters['partyA.name'] || '相对方企业';
        const partyAAddr = parameters['partyA.address'] ? `${parameters['partyA.address']}的 ` : '';
        const partyB = parameters['partyB.name'] || '富士通 ( 中国 ) 信息系統有限公司';
        const subject = parameters['cooperation.subject'] || '业务合作';
        const duration = parameters['confidentiality.durationYears'] || 3;

        // 纯净直通：将参数存入专用的 workflowParameters 管道，不触发输入框引用条
        setPendingWorkflowParameters(parameters);

        const commandMessage = `!保密合同 我需要的${partyAAddr}${partyA}，签订关于 ${subject} 的保密协议，保密期限${duration}年，签订日期是今天，我们是乙方 ${partyB}`;

        message.loading({
          content: `正在调度专属技能生成「${partyA}」保密合同初稿并进入业务确认流...`,
          key: 'nda-generating',
          duration: 3,
        });

        form.resetFields();
        setFileList([]);
        onSuccess(null as any, commandMessage);
        onClose();
        return;
      }

      const created = await workbenchCoordinationApi.createTask({
        assigneeId: targetAssigneeId,
        assigneeName: targetAssigneeName,
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
        `已成功发起业务协同「${created.title}」，已推送至 @${
          targetAssigneeName || '担当人'
        } 的工作待办`
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
      width={720}
      destroyOnClose
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 12px',
          background: 'rgba(22, 119, 255, 0.05)',
          border: '1px solid rgba(22, 119, 255, 0.12)',
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 12,
        }}
      >
        <Space size={8} align="center">
          <span style={{ color: 'var(--ant-color-text-secondary)', fontWeight: 500 }}>
            审批 / 承办人:
          </span>
          <Select
            size="small"
            style={{ minWidth: 200 }}
            value={activeAssignee?.id}
            onChange={(val) => setSelectedAssigneeId(val)}
            placeholder="请选择审批 / 承办人"
            options={collaborators.map((c) => ({
              label: `@${c.username}${c.departmentName ? ` (${c.departmentName})` : ''}`,
              value: c.id,
            }))}
          />
        </Space>
        {currentTemplate?.description ? (
          <span
            style={{
              color: 'var(--ant-color-text-tertiary)',
              maxWidth: 360,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
            }}
            title={currentTemplate.description}
          >
            {currentTemplate.description}
          </span>
        ) : null}
      </div>

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

        {currentTemplate && currentTemplate.paramsSchema?.properties ? (
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
