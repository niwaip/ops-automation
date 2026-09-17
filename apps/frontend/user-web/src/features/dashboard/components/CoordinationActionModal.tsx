import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FileDoneOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Card, Descriptions, Form, Input, Modal, Segmented, Space, Tag, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useState, useEffect, useMemo } from 'react';
import {
  workbenchCoordinationApi,
  type CoordinationAttachment,
} from '../../../api/workbenchCoordination';
import { CoordinationFileReplacer } from './CoordinationFileReplacer';
import { useChatStore } from '../../chat/chatStore';
import { useAuthStore } from '@/shared/store/authStore';
import { classifyWorkflowNode } from '../lib/coordinationNodeClassifier';

export const PARAM_LABEL_MAP: Record<string, string> = {
  contractTitle: '合同名称',
  counterpartyName: '相对方企业主体',
  counterpartyAddress: '相对方地址',
  counterpartyRole: '相对方身份',
  ourParty: '我方签约主体',
  ourRole: '我方身份',
  cooperationSubject: '合作业务主题',
  durationYears: '保密义务年限',
  myPosition: '我方合同立场',
  penaltyAmount: '违约金赔偿约定',
  contractAmount: '合同标的金额',
  remarks: '商务诉求说明',
  contractType: '合同类型',
  signDate: '签署日期',
  currentStage: '当前流程阶段',
  downloadUrl: '初稿下载直链',
  fileName: '文档文件名',
  leaveType: '请假类型',
  startTime: '开始时间',
  endTime: '结束时间',
  durationHours: '请假时长',
  reason: '请假事由',
  handoverPerson: '工作交接人',
  expenseType: '报销类型',
  amount: '报销金额',
};

export const formatParamValue = (key: string, val: any) => {
  if (val === undefined || val === null || val === '') return '-';
  if (key === 'myPosition') {
    if (val === 'buyer') return '偏我方立场 (披露方优势)';
    if (val === 'seller') return '偏对方立场 (接收方抗辩)';
    if (val === 'neutral') return '中立对等立场';
  }
  if (key === 'ourRole' || key === 'counterpartyRole') {
    if (val === '甲方') return '甲方 (委托/采购/披露方)';
    if (val === '乙方') return '乙方 (受托/服务/接收方)';
  }
  if (key === 'contractType') {
    if (val === 'nda') return '商业保密协议 (NDA)';
    if (val === 'software_development') return '软件定制开发合同';
    if (val === 'procurement') return '采购协议';
    if (val === 'employment') return '劳动/聘用协议';
    if (val === 'general') return '通用商业合作协议';
  }
  if (key === 'durationYears') {
    return `${val} 年`;
  }
  if ((key === 'penaltyAmount' || key === 'contractAmount' || key === 'amount') && typeof val === 'number') {
    return `¥${val.toLocaleString()} 元`;
  }
  if (key === 'currentStage') {
    if (val === 'initiator_confirm') return '第 2 阶段 · 业务担当初稿确认';
    if (val === 'legal_review') return '第 4 阶段 · 法务合规核准';
  }
  return String(val);
};

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
  taskType?: 'approval' | 'assignment' | 'review';
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
  taskType,
  onClose,
  onSuccess,
}: CoordinationActionModalProps) {
  const { user } = useAuthStore();
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [replacementFile, setReplacementFile] = useState<CoordinationAttachment | null>(null);
  const [currentAction, setCurrentAction] = useState<'approve' | 'reject' | 'complete'>(action);
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [isEditingParams, setIsEditingParams] = useState(false);

  const nodeSemantics = useMemo(() => {
    return classifyWorkflowNode(
      {
        id: taskId,
        title: taskTitle,
        sourceSender: initiatorName,
        sourceRefId: taskId,
        unifiedPayload: {
          kind: 'coordination',
          taskType,
          workflowId,
          parameters: editedParams,
          currentStage: editedParams?.currentStage,
          initiator: { username: initiatorName },
        },
      } as any,
      user?.username,
      user?.id
    );
  }, [taskId, taskTitle, initiatorName, taskType, workflowId, editedParams, user?.username, user?.id]);

  useEffect(() => {
    const isInitNode =
      editedParams?.currentStage === 'initiator_confirm' ||
      editedParams?.currentStage === 'draft_submission' ||
      /待担当确认|担当确认|初稿确认|待发送/.test(taskTitle);
    setCurrentAction(isInitNode && action === 'reject' ? 'approve' : action);
    setEditedParams(parameters || {});
    setIsEditingParams(false);
  }, [action, open, parameters, taskTitle]);

  const isAssignmentFlow = taskType === 'assignment' || action === 'complete';
  const isApprove = currentAction === 'approve';
  const isReject = currentAction === 'reject';
  const isComplete = currentAction === 'complete';

  const params = editedParams;
  const hasParams = params && Object.keys(params).length > 0;
  const isLeave = workflowId === 'hr.leave.request' || Boolean(params?.leaveType);

  // 识别企业主体是否误识别为地址
  const looksLikeAddress = (name?: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (/(?:公司|集团|厂|局|行|事务所|有限责任|有限合伙)$/.test(trimmed)) return false;
    return (
      /(?:路|街|号|弄|区|道|巷|大厦|中心|大楼|\d+号)$/.test(trimmed) ||
      /(?:省|市|区|县|街|路|大道).*(?:号|室|层)/.test(trimmed)
    );
  };

  const findCompanyCandidate = (text?: string): string | null => {
    if (!text || typeof text !== 'string') return null;
    const compMatch = text.match(
      /(?:与|和)?(?:[^\s,，。]+?[省市区街道路弄号]+(?:的)?\s*)?([^\s,，。]+?(?:公司|集团|事务所|商行))/
    );
    if (compMatch && compMatch[1]) {
      const candidate = compMatch[1]
        .replace(/^(?:我方|对方|和|与|与我方|和对方|以及|向|由)\s*/, '')
        .trim();
      if (candidate.length >= 4 && /(?:公司|集团|事务所|商行)$/.test(candidate)) {
        return candidate;
      }
    }
    const generalMatch = text.match(/([^\s,，。]+?(?:公司|企业|集团|事务所|商行))/);
    if (generalMatch && generalMatch[1]) {
      const cand = generalMatch[1]
        .replace(/^(?:我方|对方|和|与|以及|向|由)\s*/, '')
        .trim();
      if (cand.length >= 4 && /(?:公司|集团|事务所|商行)$/.test(cand)) {
        return cand;
      }
    }
    return null;
  };

  const candidateCompany = looksLikeAddress(params.counterpartyName)
    ? findCompanyCandidate(params.remarks || rawContent)
    : null;

  const handleApplyAutoCorrection = () => {
    if (!candidateCompany) return;
    const oldVal = params.counterpartyName;
    setEditedParams((prev) => ({
      ...prev,
      counterpartyName: candidateCompany,
      counterpartyAddress: prev.counterpartyAddress || oldVal,
      contractTitle: prev.contractTitle?.includes(oldVal)
        ? prev.contractTitle.replace(oldVal, candidateCompany)
        : `${candidateCompany} - 商业保密协议 (NDA)`,
    }));
    message.success(`已一键校正：企业主体修正为「${candidateCompany}」，地址修正为「${oldVal}」`);
  };

  const validIncoming = (incomingAttachments || []).filter(
    (a) => Boolean(a && (a.url?.trim() || a.name?.trim()))
  );
  const allAttachments: CoordinationAttachment[] = [...validIncoming];
  const directUrl =
    params?.downloadUrl ||
    params?.fileUrl ||
    params?.contractUrl ||
    (params as any)?.artifactUrl ||
    (params as any)?.documentUrl ||
    (params as any)?.generatedDocUrl;

  if (directUrl && !allAttachments.some((a) => a.url === directUrl)) {
    const docName =
      params?.fileName ||
      params?.contractFileName ||
      (params as any)?.documentName ||
      (params?.contractTitle ? `${params.contractTitle}.docx` : `${taskTitle}.docx`);
    allAttachments.push({
      name: docName,
      url: directUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  const getModalTitle = () => {
    if (nodeSemantics.isInitiatorNode) {
      return (
        <Space size={8}>
          <SendOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>初稿核对与发送</span>
        </Space>
      );
    }
    if (isApprove) {
      return (
        <Space size={8}>
          <CheckCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>{nodeSemantics.isApprovalNode ? '审批承认 / 合规审查' : '确认流转 / 更新内容'}</span>
        </Space>
      );
    }
    if (isReject) {
      return (
        <Space size={8}>
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
          <span>确认驳回 / 退回此任务</span>
        </Space>
      );
    }
    return (
      <Space size={8}>
        <FileDoneOutlined style={{ color: '#722ed1', fontSize: 18 }} />
        <span>{nodeSemantics.isArchiveNode ? '办结归档 / 回执处理' : '完成协同任务 / 提交执行结果'}</span>
      </Space>
    );
  };

  const getOkText = () => {
    if (nodeSemantics.isInitiatorNode) return '确认发送';
    if (isApprove) return nodeSemantics.isApprovalNode ? '同意并流转' : '确认流转';
    if (isReject) return '确认驳回并退回';
    if (nodeSemantics.isArchiveNode) return '确认归档';
    return '确认完成并反馈';
  };

  const handleCancel = () => {
    form.resetFields();
    setFileList([]);
    setReplacementFile(null);
    onClose();
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setIsSubmitting(true);

      const uploadedFiles: CoordinationAttachment[] = fileList.map((f) => ({
        name: f.name,
        size: f.size,
        url: f.url || (f.response as any)?.url,
        mimeType: f.type,
      }));

      // 如果有担当上传的替换文件，优先将替换文件作为核心附件提交
      const finalAttachments: CoordinationAttachment[] = replacementFile
        ? [replacementFile, ...uploadedFiles.filter((f) => f.name !== replacementFile.name)]
        : uploadedFiles.length > 0
        ? uploadedFiles
        : allAttachments;

      let comment = values.comment?.trim() || '';
      if (replacementFile && !comment.includes(replacementFile.name)) {
        comment = comment
          ? `${comment}（已上传修订版文件：${replacementFile.name}）`
          : `已核实并上传修订版文件（${replacementFile.name}），替换原生成文件提交流转。`;
      }

      await workbenchCoordinationApi.submitAction(taskId, {
        action: currentAction,
        comment,
        attachments: finalAttachments,
        parameters: editedParams,
      });

      if (nodeSemantics.isInitiatorNode) {
        message.success(
          replacementFile
            ? `已成功确认初稿并发送「${taskTitle}」，已附带修订版文件提交流程！`
            : `已成功确认初稿并发送「${taskTitle}」，流程已推进至下一阶段！`
        );
      } else if (isApprove) {
        message.success(
          replacementFile
            ? `已成功确认流转「${taskTitle}」，已附带修订版文件提交流程！`
            : `已成功确认流转「${taskTitle}」，流程已推进至下一阶段！`
        );
      } else if (isReject) {
        message.success(`已驳回「${taskTitle}」，退回修改意见已同步发起人及相关节点`);
      } else {
        message.success(
          replacementFile
            ? `已成功完成协同任务「${taskTitle}」，已附带最新修订文档同步流转！`
            : `已成功完成协同任务「${taskTitle}」，执行结果已同步发起人！`
        );
      }

      form.resetFields();
      setFileList([]);
      setReplacementFile(null);
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
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        currentAction !== 'reject' && nodeSemantics.allowReject ? (
          <Button
            key="quick-reject"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => {
              setCurrentAction('reject');
              form.validateFields(['comment']).catch(() => {});
            }}
          >
            驳回 / 退回
          </Button>
        ) : nodeSemantics.allowReject ? (
          <Button
            key="quick-switch-back"
            onClick={() => {
              setCurrentAction(isAssignmentFlow ? 'complete' : 'approve');
            }}
          >
            切换为{isAssignmentFlow ? '完成提交' : (nodeSemantics.isApprovalNode ? '同意并流转' : '确认流转')}
          </Button>
        ) : null,
        <Button
          key="submit"
          type="primary"
          danger={isReject}
          loading={isSubmitting}
          icon={nodeSemantics.isInitiatorNode ? <SendOutlined /> : undefined}
          style={
            isComplete
              ? { backgroundColor: '#722ed1', borderColor: '#722ed1' }
              : isApprove || nodeSemantics.isInitiatorNode
              ? { backgroundColor: '#1677ff', borderColor: '#1677ff' }
              : undefined
          }
          onClick={handleSubmit}
        >
          {getOkText()}
        </Button>,
      ].filter(Boolean)}
      width={520}
      destroyOnClose
    >
      {/* 任务基础信息 */}
      <div style={{ margin: '12px 0 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {nodeSemantics.displayTitle || taskTitle}
        </div>
        <Space size={6} wrap>
          {nodeSemantics.categoryTagText ? (
            <Tag color={nodeSemantics.categoryTagColor}>{nodeSemantics.categoryTagText}</Tag>
          ) : null}
          {nodeSemantics.isInitiatorNode || (initiatorName && initiatorName.toLowerCase() === (user?.username || '').toLowerCase()) ? (
            <Tag color="green">来自自己</Tag>
          ) : nodeSemantics.operatorDisplayText ? (
            <Tag color={nodeSemantics.operatorIsMe ? 'green' : 'blue'}>
              {nodeSemantics.operatorDisplayText}
            </Tag>
          ) : initiatorName ? (
            <Tag color="blue">来自 @{initiatorName}</Tag>
          ) : null}
          {workflowId ? (
            <Tag color="purple">工作流: {workflowId}</Tag>
          ) : null}
        </Space>
      </div>

      {/* 协同处理动作模式切换：若为初稿确认等不可驳回节点，则不展示模式切换 */}
      {nodeSemantics.allowReject ? (
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={currentAction}
            onChange={(val) => {
              setCurrentAction(val as 'approve' | 'reject' | 'complete');
              form.validateFields(['comment']).catch(() => {});
            }}
            options={
              isAssignmentFlow
                ? [
                    {
                      label: (
                        <Space size={6}>
                          <FileDoneOutlined style={{ color: currentAction === 'complete' ? '#722ed1' : undefined }} />
                          <span style={{ fontWeight: currentAction === 'complete' ? 600 : 400 }}>
                            办结并提交流转
                          </span>
                        </Space>
                      ),
                      value: 'complete',
                    },
                    {
                      label: (
                        <Space size={6}>
                          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                          <span
                            style={{
                              color: currentAction === 'reject' ? '#ff4d4f' : undefined,
                              fontWeight: currentAction === 'reject' ? 600 : 400,
                            }}
                          >
                            驳回 / 退回重修
                          </span>
                        </Space>
                      ),
                      value: 'reject',
                    },
                  ]
                : [
                    {
                      label: (
                        <Space size={6}>
                          <CheckCircleOutlined style={{ color: '#1677ff' }} />
                          <span style={{ fontWeight: currentAction === 'approve' ? 600 : 400 }}>
                            {nodeSemantics.isApprovalNode ? '同意并流转' : '确认流转'}
                          </span>
                        </Space>
                      ),
                      value: 'approve',
                    },
                    {
                      label: (
                        <Space size={6}>
                          <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                          <span
                            style={{
                              color: currentAction === 'reject' ? '#ff4d4f' : undefined,
                              fontWeight: currentAction === 'reject' ? 600 : 400,
                            }}
                          >
                            驳回修改 / 退回
                          </span>
                        </Space>
                      ),
                      value: 'reject',
                    },
                  ]
            }
            block
            size="middle"
          />
        </div>
      ) : null}

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
          extra={
            !isLeave ? (
              <Button
                type="link"
                size="small"
                icon={isEditingParams ? <SaveOutlined /> : <EditOutlined />}
                onClick={() => setIsEditingParams(!isEditingParams)}
              >
                {isEditingParams ? '完成编辑' : '手动修正要件'}
              </Button>
            ) : null
          }
        >
          {/* 企业主体纠偏智能提示 */}
          {candidateCompany && candidateCompany !== params.counterpartyName ? (
            <div
              style={{
                background: 'rgba(250, 173, 20, 0.09)',
                border: '1px solid rgba(250, 173, 20, 0.35)',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                ⚠️ 检测到「相对方企业主体」被识别为地址（
                <span style={{ color: '#d46b08', fontWeight: 600 }}>{params.counterpartyName}</span>
                ），真实企业名称应为「
                <span style={{ color: '#1677ff', fontWeight: 600 }}>{candidateCompany}</span>」
              </div>
              <Button
                size="small"
                type="primary"
                style={{ background: '#fa8c16', borderColor: '#fa8c16', fontSize: 12 }}
                onClick={handleApplyAutoCorrection}
              >
                ⚡ 一键纠偏为「{candidateCompany}」
              </Button>
            </div>
          ) : null}

          {isEditingParams ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(params)
                .filter(([key]) => !['downloadUrl', 'fileName', 'executionId', 'remarks'].includes(key))
                .map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 110, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                      {PARAM_LABEL_MAP[key] || key}：
                    </span>
                    <Input
                      size="small"
                      value={String(val ?? '')}
                      onChange={(e) =>
                        setEditedParams((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      style={{ flex: 1 }}
                    />
                  </div>
                ))}
            </div>
          ) : isLeave ? (
            <Descriptions size="small" column={1} bordered={false}>
              <Descriptions.Item label="请假类型">
                <Tag color="blue">{params.leaveType || '事假'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="请假时长">
                <strong>{params.durationHours || 4} 小时</strong>
              </Descriptions.Item>
              <Descriptions.Item label="起止时间">
                {params.startTime} ~ {params.endTime}
              </Descriptions.Item>
              <Descriptions.Item label="请假事由">
                {params.reason || '-'}
              </Descriptions.Item>
              {params.handoverPerson ? (
                <Descriptions.Item label="工作交接人">
                  {params.handoverPerson}
                </Descriptions.Item>
              ) : null}
              {params.emergencyContact ? (
                <Descriptions.Item label="紧急联系电话">
                  {params.emergencyContact}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          ) : (
            <Descriptions size="small" column={1}>
              {Object.entries(params)
                .filter(([key]) => !['downloadUrl', 'fileName', 'executionId', 'remarks'].includes(key))
                .map(([key, val]) => (
                  <Descriptions.Item key={key} label={PARAM_LABEL_MAP[key] || key}>
                    {formatParamValue(key, val)}
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

      {/* 通用 AI 协同助手入口：自动带入当前任务要件与文档至对话框 */}
      <div
        style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: 'rgba(99, 102, 241, 0.04)',
          border: '1px solid rgba(99, 102, 241, 0.16)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Space size={8}>
          <RobotOutlined style={{ color: '#6366f1', fontSize: 17 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              AI 协同助手
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              带入当前文档与要求作为上下文，在 AI 窗口中自由输入自然语言指令
            </div>
          </div>
        </Space>
        <Button
          size="small"
          style={{
            backgroundColor: '#722ed1',
            borderColor: '#722ed1',
            color: '#fff',
            borderRadius: 6,
            fontSize: 12,
          }}
          icon={<RobotOutlined />}
          onClick={() => {
            useChatStore.getState().openWithTaskContext({
              taskId,
              taskTitle,
              workflowId,
              taskContent: rawContent,
              parameters,
              attachments: allAttachments,
            });
            onClose();
          }}
        >
          在 AI 窗口中处理
        </Button>
      </div>

      {/* 附带材料与生成文档（支持即时下载与修订版上传替换） */}
      <CoordinationFileReplacer
        originalAttachments={allAttachments}
        replacementFile={replacementFile}
        onReplacementChange={setReplacementFile}
        disabled={isSubmitting}
      />

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
            nodeSemantics.isInitiatorNode
              ? '核对说明 / 发送批注（可选）'
              : isApprove
              ? '审批说明 / 承认批注（可选）'
              : isReject
              ? '驳回原因 / 改进建议（必填）'
              : '执行情况说明 / 办理反馈（可选）'
          }
          rules={[{ required: isReject, message: '请填写驳回原因与修改建议' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder={
              nodeSemantics.isInitiatorNode
                ? '初稿已核对无误，附带说明发送提交流转...'
                : isApprove
                ? '已核对，符合上线标准 / 同意申请...'
                : isReject
                ? '请详细说明驳回原因或修改要求，便于上一节点承办人或发起人调整并重新提单...'
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
