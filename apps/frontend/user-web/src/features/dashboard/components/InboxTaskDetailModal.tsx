import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  EyeOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Input, Modal, Space, Tag, Typography, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from 'react-query';
import { useAuthStore } from '@/shared/store/authStore';
import { workbenchInboxApi, type WorkbenchInboxItem } from '../../../api/workbenchInbox';
import {
  workbenchCoordinationApi,
  type CoordinationAttachment,
} from '../../../api/workbenchCoordination';
import { CoordinationFileReplacer } from './CoordinationFileReplacer';
import { classifyWorkflowNode } from '../lib/coordinationNodeClassifier';
import { PARAM_LABEL_MAP, formatParamValue } from './CoordinationActionModal';
import { formatMonthDayTime } from '../../../shared/utils/dateText';

interface InboxTaskDetailModalProps {
  open: boolean;
  item: WorkbenchInboxItem | null;
  onClose: () => void;
  onFlow?: (item: WorkbenchInboxItem) => void;
  onOpenInAi?: (item: WorkbenchInboxItem) => void;
  onSuccess?: () => void;
}

export function InboxTaskDetailModal({
  open,
  item,
  onClose,
  onFlow: _onFlow,
  onOpenInAi,
  onSuccess,
}: InboxTaskDetailModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [replacementFile, setReplacementFile] = useState<CoordinationAttachment | null>(null);
  const [comment, setComment] = useState('');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialParams, setInitialParams] = useState<Record<string, any>>({});
  const [editedParams, setEditedParams] = useState<Record<string, any>>({});
  const [isEditingParams, setIsEditingParams] = useState(false);
  const loadedItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && item) {
      const currentItemId = item.sourceRefId || item.id;
      // 仅当刚打开弹窗或切换至不同任务时初始化状态，避免父组件重新渲染时重置清空用户已输入的留言与编辑内容！
      if (loadedItemIdRef.current !== currentItemId) {
        loadedItemIdRef.current = currentItemId;
        setReplacementFile(null);
        setComment('');
        setFileList([]);
        setIsSubmitting(false);
        const rawP = (item.unifiedPayload as any)?.parameters || {};
        setEditedParams({ ...rawP });
        setInitialParams({ ...rawP });
        const semantics = classifyWorkflowNode(item, user?.username, user?.id);
        setIsEditingParams(Boolean(semantics.isRevisionRequired));
      }
    } else if (!open) {
      loadedItemIdRef.current = null;
    }
  }, [open, item?.id, item?.sourceRefId, user?.username, user?.id]);

  if (!item) return null;

  const payload = (item.unifiedPayload || {}) as Record<string, any>;
  const params = editedParams;
  const isCoordination = payload.kind === 'coordination';
  const nodeSemantics = classifyWorkflowNode(item, user?.username, user?.id);
  const isActionable =
    ((isCoordination || nodeSemantics.isProcessTask) && item.status !== 'converted') ||
    nodeSemantics.isRevisionRequired;
  const isAssignment = isCoordination && payload.taskType !== 'approval';
  const hasParams = (isCoordination || nodeSemantics.isProcessTask) && Object.keys(params).length > 0;

  const extractRollbackReason = (): string | undefined => {
    if (payload.metadata?.rollbackReason) return payload.metadata.rollbackReason;
    if (payload.rollbackReason) return payload.rollbackReason;
    if ((item as any).rollbackReason) return (item as any).rollbackReason;

    // 从 actions 列表中查找最近一次驳回记录
    if (Array.isArray(payload.actions)) {
      const lastReject = [...payload.actions].reverse().find((a: any) => a.action === 'reject');
      if (lastReject?.comment?.trim()) return lastReject.comment.trim();
    }

    // 从 item.rawContent 或 (item as any).description 中提取处理意见
    const textToSearch = `${item.rawContent || ''}\n${(item as any).description || ''}`;
    const commentMatch = textToSearch.match(/处理意见[：:]\s*([^\n\r]+)/);
    if (commentMatch && commentMatch[1]?.trim()) {
      return commentMatch[1].trim();
    }
    const auditMatch = textToSearch.match(/(?:审核人员批注|驳回批注|驳回原因|退回原因)[：:]\s*([^\n\r]+)/);
    if (auditMatch && auditMatch[1]?.trim()) {
      return auditMatch[1].trim();
    }
    const quoteMatch = textToSearch.match(/(?:驳回|意见|退回|原因)[^\n\r]*[\r\n]+>\s*([^\n\r]+)/);
    if (quoteMatch && quoteMatch[1]?.trim()) {
      return quoteMatch[1].trim();
    }

    if (payload.externalSyncResult?.message) return payload.externalSyncResult.message;
    if (payload.lastFailure?.error) return payload.lastFailure.error;
    if (payload.asyncExecution?.error) return payload.asyncExecution.error;

    return undefined;
  };
  const rollbackReason = extractRollbackReason();

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

  // 从说明文本中提取真实公司名称
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
    ? findCompanyCandidate(params.remarks || item.rawContent)
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

  const incomingAttachments = (payload.attachments || []) as CoordinationAttachment[];
  const validIncoming = incomingAttachments.filter(
    (a) => Boolean(a && (a.url?.trim() || a.name?.trim()))
  );
  const directUrl =
    params.downloadUrl ||
    params.fileUrl ||
    params.contractUrl ||
    (payload.metadata as any)?.generatedDocUrl;

  const allAttachments: CoordinationAttachment[] = [...validIncoming];
  if (directUrl && !allAttachments.some((a) => a.url === directUrl)) {
    const docName =
      params.fileName ||
      params.contractFileName ||
      (params.contractTitle ? `${params.contractTitle}.docx` : `${item.title}.docx`);
    allAttachments.push({
      name: docName,
      url: directUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  const handleSubmit = async (action: 'approve' | 'reject' | 'complete') => {
    if (action === 'reject' && !comment.trim()) {
      message.warning('驳回退回时，请在留言说明中填写驳回原因与修改建议');
      return;
    }

    if (nodeSemantics.isRevisionRequired && (action === 'approve' || action === 'complete')) {
      const ignoredParamKeys = new Set([
        'downloadUrl',
        'fileUrl',
        'fileName',
        'executionId',
        'contractFileName',
        'contractUrl',
      ]);

      const hasParamChanges = Object.keys(editedParams).some((k) => {
        if (ignoredParamKeys.has(k)) return false;
        const oldVal = String(initialParams[k] ?? '').trim();
        const newVal = String(editedParams[k] ?? '').trim();
        return oldVal !== newVal;
      });

      const hasAttachmentChanges =
        Boolean(replacementFile) ||
        fileList.length > 0 ||
        Boolean(editedParams.isDraftReplaced);

      const hasComment = Boolean(comment.trim());

      if (!hasParamChanges && !hasAttachmentChanges && !hasComment) {
        message.error(
          '已驳回的任务不能无修改直接提交！请修改业务要件参数、上传替换修订版附件，或填写重新发送的理由说明后再提交。'
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const rawTaskId = item.sourceRefId || item.id;
      const taskId = rawTaskId.startsWith('coord_coord_')
        ? rawTaskId.replace(/^(?:coord_)+/, 'coord_')
        : rawTaskId;

      const uploadedFiles: CoordinationAttachment[] = fileList.map((f) => ({
        name: f.name,
        size: f.size,
        url: f.url || (f.response as any)?.url,
        mimeType: f.type,
      }));

      // 如果有担当上传的替换文件，优先将替换文件作为核心附件提交流转
      const finalAttachments: CoordinationAttachment[] = replacementFile
        ? [replacementFile, ...uploadedFiles.filter((f) => f.name !== replacementFile.name)]
        : uploadedFiles.length > 0
        ? uploadedFiles
        : allAttachments;

      let finalComment = comment.trim();
      if (replacementFile && !finalComment.includes(replacementFile.name)) {
        finalComment = finalComment
          ? `${finalComment}（已上传修订版文件：${replacementFile.name}）`
          : `已核实并上传修订版文件（${replacementFile.name}），替换原生成文档提交流转。`;
      }

      if (nodeSemantics.isArchiveNode) {
        await workbenchInboxApi.updateStatus(item.id, 'archived').catch(() => {});
        await workbenchCoordinationApi.submitAction(taskId, {
          action: 'approve',
          comment: finalComment || '协同回执已阅并确认归档。',
        }).catch(() => {});
        message.success(`已成功归档「${item.title}」，可在「已厘清/归档」中查阅`);
        onClose();
        onSuccess?.();
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        return;
      }

      await workbenchCoordinationApi.submitAction(taskId, {
        action,
        comment: finalComment,
        attachments: finalAttachments,
        parameters: editedParams,
      });

      if (nodeSemantics.isRevisionRequired) {
        message.success(
          replacementFile
            ? `已成功提交重修材料「${item.title}」，已附带最新修订版附件提交流程！`
            : `已成功重新提交「${item.title}」！系统正在进行智能审查与合规诊断，完成后将自动流转至下一审批环节。`
        );
      } else if (nodeSemantics.cardActionType === 'send') {
        message.success(
          replacementFile
            ? `已成功提交合同送审「${item.title}」，已附带最新修订版文件提交流程！`
            : `已成功提交送审！系统正在进行智能合规诊断与风险复核，通过后将自动流转至法务审批。`
        );
      } else if (action === 'approve') {
        message.success(
          replacementFile
            ? `已成功确认流转「${item.title}」，已附带最新修订版文件提交流程！`
            : `已成功确认流转「${item.title}」，流程已推进至下一阶段！`
        );
      } else if (action === 'reject') {
        message.success(`已驳回「${item.title}」，修改要求已同步上一节点承办人`);
      } else {
        message.success(
          replacementFile
            ? `已成功完成协同任务「${item.title}」，已附带最新修订文档同步流转！`
            : `已成功完成协同任务「${item.title}」，执行结果已同步发起人！`
        );
      }

      onClose();
      onSuccess?.();

      const triggerRefresh = () => {
        void queryClient.invalidateQueries(['workbench-inbox']);
        void queryClient.invalidateQueries(['workbench-inbox-summary']);
        void queryClient.invalidateQueries(['workbench-todos']);
        void queryClient.invalidateQueries(['workbench-todos-summary']);
        void queryClient.invalidateQueries(['workbench-coordination-sent-tasks']);
        void queryClient.invalidateQueries(['workbench-stats']);
      };
      triggerRefresh();
      setTimeout(triggerRefresh, 1500);
      setTimeout(triggerRefresh, 4000);
      setTimeout(triggerRefresh, 8000);
    } catch (err: any) {
      message.error(err?.message || '操作失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space size={8}>
          <EyeOutlined style={{ color: '#1677ff', fontSize: 17 }} />
          <span>任务流转详细信息</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={680}
      footer={[
        <Button key="close" onClick={onClose} disabled={isSubmitting}>
          关闭
        </Button>,
        onOpenInAi ? (
          <Button
            key="ai"
            icon={<RobotOutlined style={{ color: '#722ed1' }} />}
            onClick={() => {
              onOpenInAi(item);
              onClose();
            }}
            disabled={isSubmitting}
          >
            在 AI 窗口中处理
          </Button>
        ) : null,
        isActionable && nodeSemantics.allowReject ? (
          <Button
            key="reject"
            danger
            icon={<CloseCircleOutlined />}
            loading={isSubmitting}
            onClick={() => handleSubmit('reject')}
          >
            驳回修改
          </Button>
        ) : null,
        isActionable ? (
          <Button
            key="submit"
            type="primary"
            icon={
              nodeSemantics.cardActionType === 'send' ? (
                <SendOutlined />
              ) : (
                <CheckCircleOutlined />
              )
            }
            loading={isSubmitting}
            style={
              nodeSemantics.cardActionType === 'send'
                ? { backgroundColor: '#1677ff', borderColor: '#1677ff' }
                : isAssignment
                ? { backgroundColor: '#722ed1', borderColor: '#722ed1' }
                : { backgroundColor: '#1677ff', borderColor: '#1677ff' }
            }
            onClick={() => handleSubmit(isAssignment ? 'complete' : 'approve')}
          >
            {nodeSemantics.modalSubmitText}
          </Button>
        ) : null,
      ].filter(Boolean)}
      destroyOnClose
    >
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 标题与元数据 */}
        <div>
          <Typography.Title level={5} style={{ margin: 0, marginBottom: 8 }}>
            {nodeSemantics.displayTitle || item.title}
          </Typography.Title>
          <Space size={6} wrap align="center">
            {nodeSemantics.isInitiatorNode || (item.sourceSender && item.sourceSender.toLowerCase() === (user?.username || '').toLowerCase()) ? (
              <Tag color="green" icon={<UserOutlined />}>
                来自自己
              </Tag>
            ) : item.sourceSender ? (
              <Tag color="blue" icon={<UserOutlined />}>
                {nodeSemantics.operatorDisplayText || `发起人: @${item.sourceSender}`}
              </Tag>
            ) : null}
            {nodeSemantics.categoryTagText ? (
              <Tag color={nodeSemantics.categoryTagColor}>
                {nodeSemantics.categoryTagText}
              </Tag>
            ) : null}
            {payload.workflowId ? (
              <Tag color="purple">
                工作流: {payload.workflowId}
              </Tag>
            ) : null}
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              <ClockCircleOutlined /> 提交时间: {formatMonthDayTime(item.createdAt)}
            </span>
          </Space>
        </div>

        {/* 需重修/已驳回专属引导 Alert */}
        {nodeSemantics.isRevisionRequired ? (
          <Alert
            type="error"
            showIcon
            message={
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                【当前任务已被驳回 / 需重修】
              </span>
            }
            description={
              <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
                <div
                  style={{
                    background: 'rgba(255, 77, 79, 0.08)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255, 77, 79, 0.25)',
                  }}
                >
                  <div style={{ color: '#cf1322', fontWeight: 600, marginBottom: 4 }}>
                    📌 驳回批注与修改意见：
                  </div>
                  <div style={{ color: '#1f1f1f', whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                    {rollbackReason || '审核人员提出了修改意见，请根据批注调整表单要素或替换附件。'}
                  </div>
                </div>
                <div style={{ marginTop: 8, color: '#cf1322', fontWeight: 600, fontSize: 12 }}>
                  ⚠️ 系统规则：重新提交前请修改业务表单要件参数、上传替换新的修订版附件，或在下方填写重发理由说明（禁止无任何修改且无说明直接提交）。
                </div>
              </div>
            }
            style={{ borderRadius: 6, borderColor: '#ffa39e' }}
          />
        ) : null}

        {/* 结构化业务要件表单 */}
        {hasParams ? (
          <Card
            size="small"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}>📋 业务表单要件详情</span>}
            extra={
              isActionable ? (
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
            styles={{ body: { padding: '10px 14px' } }}
            style={{
              background: 'var(--bg-secondary, rgba(148, 163, 184, 0.06))',
              borderColor: 'var(--border-color, rgba(148, 163, 184, 0.16))',
            }}
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
                  .filter(([key]) => !['downloadUrl', 'fileUrl', 'contractUrl', 'fileName', 'executionId', 'contractFileName'].includes(key))
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
            ) : (
              <Descriptions size="small" column={1} bordered={false}>
                {Object.entries(params)
                  .filter(([key]) => !['downloadUrl', 'fileUrl', 'contractUrl', 'fileName', 'executionId', 'contractFileName'].includes(key))
                  .map(([key, val]) => (
                    <Descriptions.Item
                      key={key}
                      label={<span style={{ color: 'var(--text-secondary)' }}>{PARAM_LABEL_MAP[key] || key}</span>}
                    >
                      <strong>{formatParamValue(key, val)}</strong>
                    </Descriptions.Item>
                  ))}
              </Descriptions>
            )}
          </Card>
        ) : null}

        {/* 原始文本诉求（若已在结构化参数中展示，则不重复显示） */}
        {item.rawContent &&
        item.rawContent !== item.title &&
        (!hasParams || !Object.values(params).some((val) => typeof val === 'string' && val.trim() === item.rawContent?.trim())) ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              原始提交说明
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--bg-secondary, rgba(148, 163, 184, 0.05))',
                border: '1px solid var(--border-color, rgba(148, 163, 184, 0.12))',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {item.rawContent}
            </div>
          </div>
        ) : null}

        {/* 附件材料与替换附件（支持下载核验与本地修订版上传替换） */}
        <CoordinationFileReplacer
          originalAttachments={allAttachments}
          replacementFile={replacementFile}
          onReplacementChange={setReplacementFile}
          disabled={isSubmitting || !isActionable}
        />

        {/* 留言 / 审批与流转说明 */}
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space size={6}>
              <span>💬 留言 / 流转说明</span>
            </Space>
            {!isActionable ? (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 400 }}>
                (当前任务已归档或转待办，仅供查阅)
              </span>
            ) : null}
          </div>
          <Input.TextArea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              !isActionable
                ? '暂无附加流转留言'
                : nodeSemantics.isRevisionRequired
                ? '请输入重发理由说明、修改批注或流转留言（若未更改参数与附件，可在此填写说明理由后重新发送）...'
                : '请输入流转留言、审批意见或修改批注（如已在上方替换附件，可在此简要备注修改要点）...'
            }
            disabled={isSubmitting || !isActionable}
            maxLength={500}
            showCount={isActionable}
          />
        </div>

        {/* 补充佐证附件（可选） */}
        {isActionable ? (
          <div>
            <Upload
              fileList={fileList}
              beforeUpload={(file) => {
                setFileList((prev) => [...prev, file]);
                return false;
              }}
              onRemove={(file) => {
                setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
              }}
              disabled={isSubmitting}
            >
              <Button size="small" icon={<UploadOutlined />}>
                上传补充附件 / 佐证材料（可选）
              </Button>
            </Upload>
          </div>
        ) : null}

        {/* 历史流转历程与批注（若存在） */}
        {Array.isArray(payload.actions) && payload.actions.length > 0 ? (
          <Card
            size="small"
            title={<span style={{ fontSize: 12, fontWeight: 600 }}>🕒 历史流转历程与留言记录</span>}
            styles={{ body: { padding: '8px 12px' } }}
            style={{
              background: 'var(--bg-secondary, rgba(148, 163, 184, 0.05))',
              borderColor: 'var(--border-color, rgba(148, 163, 184, 0.14))',
            }}
          >
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {payload.actions.map((act: any, idx: number) => (
                <div key={idx} style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <Space size={6} wrap>
                    <strong>@{act.operatorName || '协同成员'}</strong>
                    <Tag
                      color={
                        act.action === 'reject'
                          ? 'error'
                          : act.action === 'complete'
                          ? 'purple'
                          : 'blue'
                      }
                      style={{ fontSize: 11, margin: 0 }}
                    >
                      {act.action === 'reject'
                        ? '驳回修改'
                        : act.action === 'complete'
                        ? '办结提交'
                        : '确认流转'}
                    </Tag>
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {formatMonthDayTime(act.timestamp)}
                    </span>
                  </Space>
                  {act.comment ? (
                    <div
                      style={{
                        marginTop: 4,
                        color: 'var(--text-secondary)',
                        paddingLeft: 8,
                        borderLeft: '2px solid rgba(148, 163, 184, 0.3)',
                      }}
                    >
                      {act.comment}
                    </div>
                  ) : null}
                </div>
              ))}
            </Space>
          </Card>
        ) : null}
      </div>
    </Modal>
  );
}
