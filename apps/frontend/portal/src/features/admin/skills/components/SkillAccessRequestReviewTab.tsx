import { Button, Empty, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { SkillAccessRequestReviewDTO } from '@/api/skill';

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('zh-CN', { hour12: false });
};

interface SkillAccessRequestReviewTabProps {
  requests: SkillAccessRequestReviewDTO[];
  loading?: boolean;
  processingRequestId?: string | null;
  processingAction?: 'approve' | 'reject' | null;
  onApprove?: (request: SkillAccessRequestReviewDTO, responseNote?: string) => void;
  onReject?: (request: SkillAccessRequestReviewDTO, responseNote?: string) => void;
  enableReviewActions?: boolean;
  emptyText?: string;
}

export function SkillAccessRequestReviewTab({
  requests,
  loading,
  processingRequestId,
  processingAction,
  onApprove,
  onReject,
  enableReviewActions = true,
  emptyText = '当前没有待处理的授权申请',
}: SkillAccessRequestReviewTabProps) {
  const [reviewTarget, setReviewTarget] = useState<SkillAccessRequestReviewDTO | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [responseNote, setResponseNote] = useState('');

  const isProcessingCurrentTarget =
    !!reviewTarget &&
    processingRequestId === reviewTarget.id &&
    processingAction === reviewAction;

  const reviewTitle = useMemo(() => {
    if (!reviewTarget || !reviewAction) {
      return '审批授权申请';
    }

    return reviewAction === 'approve' ? '批准授权申请' : '拒绝授权申请';
  }, [reviewAction, reviewTarget]);

  const closeReviewModal = () => {
    if (isProcessingCurrentTarget) {
      return;
    }

    setReviewTarget(null);
    setReviewAction(null);
    setResponseNote('');
  };

  useEffect(() => {
    if (!reviewTarget) {
      return;
    }

    const stillPending = requests.some((request) => request.id === reviewTarget.id);
    if (!stillPending && !isProcessingCurrentTarget) {
      closeReviewModal();
    }
  }, [isProcessingCurrentTarget, requests, reviewTarget]);

  const submitReview = () => {
    if (!reviewTarget || !reviewAction) {
      return;
    }

    const note = responseNote.trim() || undefined;
    if (reviewAction === 'approve' && onApprove) {
      onApprove(reviewTarget, note);
      return;
    }

    if (onReject) {
      onReject(reviewTarget, note);
    }
  };

  const columns: ColumnsType<SkillAccessRequestReviewDTO> = [
    {
      title: '申请人',
      key: 'requester',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.requesterUsername}</Typography.Text>
          <Typography.Text type="secondary">{record.requesterEmail || '未填写邮箱'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '授权角色',
      key: 'role',
      width: 180,
      render: (_, record) => (
        <Space size={[6, 6]} wrap>
          <Tag>{record.requesterRole || 'unknown'}</Tag>
          <Typography.Text type="secondary">
            授权至 {record.targetRoleName || record.requesterRole || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '申请原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (value?: string | null) => value || <Typography.Text type="secondary">未填写</Typography.Text>,
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: SkillAccessRequestReviewDTO['status']) => (
        <Tag
          color={
            status === 'pending'
              ? 'processing'
              : status === 'approved'
                ? 'success'
                : status === 'rejected'
                  ? 'error'
                  : 'default'
          }
        >
          {status === 'pending'
            ? '待处理'
            : status === 'approved'
              ? '已批准'
              : status === 'rejected'
                ? '已拒绝'
                : status}
        </Tag>
      ),
    },
    {
      title: '审批备注',
      dataIndex: 'responseNote',
      key: 'responseNote',
      render: (value?: string | null) =>
        value ? value : <Typography.Text type="secondary">未填写</Typography.Text>,
    },
    {
      title: '处理时间',
      dataIndex: 'processedAt',
      key: 'processedAt',
      width: 180,
      render: (value?: string | null) =>
        value ? formatDateTime(value) : <Typography.Text type="secondary">待处理</Typography.Text>,
    },
    ...(enableReviewActions
      ? [
          {
            title: '操作',
            key: 'actions',
            width: 180,
            render: (_: unknown, record: SkillAccessRequestReviewDTO) => (
              <Space size={8}>
                <Button
                  type="primary"
                  size="small"
                  loading={processingRequestId === record.id && processingAction === 'approve'}
                  onClick={() => {
                    setReviewTarget(record);
                    setReviewAction('approve');
                    setResponseNote('');
                  }}
                >
                  批准
                </Button>
                <Button
                  size="small"
                  danger
                  loading={processingRequestId === record.id && processingAction === 'reject'}
                  onClick={() => {
                    setReviewTarget(record);
                    setReviewAction('reject');
                    setResponseNote('');
                  }}
                >
                  拒绝
                </Button>
              </Space>
            ),
          } satisfies ColumnsType<SkillAccessRequestReviewDTO>[number],
        ]
      : []),
  ];

  return (
    <>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={requests}
        columns={columns}
        pagination={false}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />,
        }}
        scroll={{ x: 980 }}
      />

      <Modal
        title={reviewTitle}
        open={enableReviewActions && !!reviewTarget && !!reviewAction}
        onCancel={closeReviewModal}
        onOk={submitReview}
        okText={reviewAction === 'approve' ? '确认批准' : '确认拒绝'}
        cancelText="取消"
        confirmLoading={isProcessingCurrentTarget}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            {reviewAction === 'approve'
              ? `将为 ${reviewTarget?.targetRoleName || reviewTarget?.requesterRole || '-'} 开通技能权限。`
              : '拒绝后，该申请会从待处理列表移除。'}
          </Typography.Text>
          <Typography.Text type="secondary">
            可选填写审批备注，便于后续追踪处理原因。
          </Typography.Text>
          <Input.TextArea
            rows={4}
            maxLength={500}
            showCount
            placeholder={reviewAction === 'approve' ? '例如：已确认该角色需要使用该技能。' : '例如：当前角色暂不开放该技能，请走部门审批。'}
            value={responseNote}
            onChange={(event) => setResponseNote(event.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}
