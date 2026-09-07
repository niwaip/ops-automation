import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileDoneOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Card, Descriptions, Form, Input, Modal, Space, Tag, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useState } from 'react';
import {
  workbenchCoordinationApi,
  type CoordinationAttachment,
} from '../../../api/workbenchCoordination';

interface CoordinationActionModalProps {
  open: boolean;
  action: 'approve' | 'reject' | 'complete';
  taskId: string;
  taskTitle: string;
  initiatorName?: string;
  workflowId?: string;
  parameters?: Record<string, any>;
  rawContent?: string;
  incomingAttachments?: CoordinationAttachment[];
  onClose: () => void;
  onSuccess: () => void;
}

export function CoordinationActionModal({
  open,
  action,
  taskId,
  taskTitle,
  initiatorName,
  workflowId,
  parameters = {},
  rawContent,
  incomingAttachments = [],
  onClose,
  onSuccess,
}: CoordinationActionModalProps) {
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const isApprove = action === 'approve';
  const isReject = action === 'reject';
  const isComplete = action === 'complete';

  const hasParams = parameters && Object.keys(parameters).length > 0;
  const isLeave = workflowId === 'hr.leave.request' || Boolean(parameters?.leaveType);

  const getModalTitle = () => {
    if (isApprove) {
      return (
        <Space size={8}>
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          <span>确认同意 / 承认此申请</span>
        </Space>
      );
    }
    if (isReject) {
      return (
        <Space size={8}>
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
          <span>确认驳回 / 拒绝此申请</span>
        </Space>
      );
    }
    return (
      <Space size={8}>
        <FileDoneOutlined style={{ color: '#722ed1', fontSize: 18 }} />
        <span>完成协同任务 / 提交执行结果</span>
      </Space>
    );
  };

  const getOkText = () => {
    if (isApprove) return '确认同意';
    if (isReject) return '确认驳回';
    return '确认完成并反馈';
  };

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

      await workbenchCoordinationApi.submitAction(taskId, {
        action,
        comment: values.comment,
        attachments,
      });

      if (isApprove) {
        message.success(`已成功同意承认「${taskTitle}」，回执已同步发起人`);
      } else if (isReject) {
        message.success(`已驳回「${taskTitle}」，意见已同步发起人`);
      } else {
        message.success(`已成功完成协同任务「${taskTitle}」，执行结果已同步发起人！`);
      }

      form.resetFields();
      setFileList([]);
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '操作失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={getModalTitle()}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={isSubmitting}
      okText={getOkText()}
      okButtonProps={{
        danger: isReject,
        style: isComplete
          ? { backgroundColor: '#722ed1', borderColor: '#722ed1' }
          : undefined,
      }}
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      {/* 任务基础信息 */}
      <div style={{ margin: '12px 0 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {taskTitle}
        </div>
        <Space size={6} wrap>
          {initiatorName ? (
            <Tag color="blue">来自 @{initiatorName}</Tag>
          ) : null}
          {workflowId ? (
            <Tag color="purple">工作流: {workflowId}</Tag>
          ) : null}
        </Space>
      </div>

      {/* 结构化参数展示区 */}
      {hasParams ? (
        <Card
          size="small"
          style={{
            background: 'var(--bg-secondary, rgba(148, 163, 184, 0.08))',
            marginBottom: 16,
            borderColor: 'var(--border-color, rgba(148, 163, 184, 0.16))',
          }}
          title={<span style={{ fontSize: 13, fontWeight: 600 }}>📋 业务表单详情</span>}
        >
          {isLeave ? (
            <Descriptions size="small" column={1} bordered={false}>
              <Descriptions.Item label="请假类型">
                <Tag color="blue">{parameters.leaveType || '事假'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="请假时长">
                <strong>{parameters.durationHours || 4} 小时</strong>
              </Descriptions.Item>
              <Descriptions.Item label="起止时间">
                {parameters.startTime} ~ {parameters.endTime}
              </Descriptions.Item>
              <Descriptions.Item label="请假事由">
                {parameters.reason || '-'}
              </Descriptions.Item>
              {parameters.handoverPerson ? (
                <Descriptions.Item label="工作交接人">
                  {parameters.handoverPerson}
                </Descriptions.Item>
              ) : null}
              {parameters.emergencyContact ? (
                <Descriptions.Item label="紧急联系电话">
                  {parameters.emergencyContact}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          ) : (
            <Descriptions size="small" column={1}>
              {Object.entries(parameters).map(([key, val]) => (
                <Descriptions.Item key={key} label={key}>
                  {String(val)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          )}
        </Card>
      ) : rawContent && rawContent !== taskTitle ? (
        <div
          style={{
            background: 'var(--bg-secondary, rgba(148, 163, 184, 0.08))',
            border: '1px solid var(--border-color, rgba(148, 163, 184, 0.16))',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            marginBottom: 16,
            color: 'var(--text-secondary)',
          }}
        >
          {rawContent}
        </div>
      ) : null}

      {/* 附带材料展示 */}
      {incomingAttachments && incomingAttachments.length > 0 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            <PaperClipOutlined /> 附带材料：
          </div>
          <Space wrap size={4}>
            {incomingAttachments.map((att, idx) => (
              <Tag key={idx} color="default">
                {att.name}
              </Tag>
            ))}
          </Space>
        </div>
      ) : null}

      {/* 外部系统联动温馨提示 */}
      {isLeave && isApprove ? (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 14,
            fontSize: 12,
            color: 'var(--success-color, #10b981)',
          }}
        >
          💡 <strong>外部人事考勤系统联动</strong>：同意后将自动调用企业考勤系统 API（Mock Enterprise HRMS）写入请假流水并核销额度。
        </div>
      ) : null}

      {/* 反馈与批注表单 */}
      <Form form={form} layout="vertical">
        <Form.Item
          name="comment"
          label={
            isApprove
              ? '审批说明 / 承认批注（可选）'
              : isReject
              ? '驳回原因 / 改进建议（必填）'
              : '执行情况说明 / 办理反馈（可选）'
          }
          rules={[{ required: isReject, message: '请填写驳回原因' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder={
              isApprove
                ? '已核对，符合上线标准 / 同意申请...'
                : isReject
                ? '请说明需要补充的材料或修改建议...'
                : '已完成相关交付标准，请发起人验收...'
            }
          />
        </Form.Item>

        <Form.Item label="回传附件 / 佐证成果材料（可选）">
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
              上传附件
            </Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
}
