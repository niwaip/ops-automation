import {
  AlertOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Space, Tag, Tooltip } from 'antd';
import type { WorkflowNodeSemantics } from '../lib/coordinationNodeClassifier';
import { formatMonthDayTime } from '../../../shared/utils/dateText';

interface TaskStageBannerProps {
  nodeSemantics: WorkflowNodeSemantics;
  isArchived: boolean;
}

export function TaskStageBanner({ nodeSemantics, isArchived }: TaskStageBannerProps) {
  const {
    isRevisionRequired,
    isFirstTimeInitiation,
    isApprovalNode,
    hasDocumentWorkflow,
    rollbackReason,
    rejectRecord,
    categoryTagText,
    approvalComment,
  } = nodeSemantics;

  // 1. 已归档/只读状态
  if (isArchived) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            background: 'rgba(148, 163, 184, 0.08)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            borderRadius: 8,
            padding: '9px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-secondary)',
            fontSize: 12,
          }}
        >
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
          <span>该任务流程已办结并归档存证，当前处于只读留痕状态。</span>
        </div>
        {approvalComment ? (
          <div
            style={{
              background: 'rgba(82, 196, 26, 0.08)',
              border: '1px solid rgba(82, 196, 26, 0.28)',
              borderRadius: 6,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            <CheckCircleFilled style={{ color: '#52c41a', marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: '#389e0d', fontWeight: 600 }}>审批通过批注 / 流转说明：</span>
              <span style={{ color: 'var(--text-primary, #1f1f1f)', fontWeight: 500 }}>
                {approvalComment}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // 2. 驳回后重新提交（需重修）专属高亮诊断卡
  if (isRevisionRequired) {
    const reasonText =
      rejectRecord?.comment ||
      rollbackReason ||
      '审核人员提出了修改意见，请根据批注意见调整要件或材料后重新提交。';
    const rejectOperator = rejectRecord?.operatorName || '审批/审查人员';
    const rejectTime = rejectRecord?.timestamp
      ? formatMonthDayTime(rejectRecord.timestamp)
      : undefined;

    return (
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(255, 77, 79, 0.08) 0%, rgba(255, 120, 117, 0.03) 100%)',
          border: '1px solid rgba(255, 77, 79, 0.3)',
          borderRadius: 8,
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <Space size={6}>
            <AlertOutlined style={{ color: '#cf1322', fontSize: 15 }} />
            <span style={{ color: '#cf1322', fontWeight: 600, fontSize: 14 }}>
              【任务已被驳回，需修改后重新提交】
            </span>
            <Tooltip
              title={
                hasDocumentWorkflow
                  ? '修改指引：如需调整条款，请下载初稿本地修改后在下方【追加新版本】（将生成 V2 修订稿完整留痕）；如需修正签约主体/金额等参数，可直接在【业务表单要件】中编辑。修改完成后在留言框说明修改项并重新提交。'
                  : '修改指引：请直接在下方【业务表单要件详情】中编辑修正被驳回的参数项目，或上传补充佐证凭证，在说明栏中简要备注修改内容后点击「重新提交申请」。'
              }
            >
              <InfoCircleOutlined style={{ color: '#fa8c16', fontSize: 14, cursor: 'pointer' }} />
            </Tooltip>
          </Space>
          <Space size={6}>
            <Tag color="error" icon={<UserOutlined />} style={{ margin: 0 }}>
              驳回人: @{rejectOperator}
            </Tag>
            {rejectTime ? (
              <Tag color="default" icon={<ClockCircleOutlined />} style={{ margin: 0 }}>
                {rejectTime}
              </Tag>
            ) : null}
          </Space>
        </div>

        {/* 审批驳回意见详情框 */}
        <div
          style={{
            background: 'var(--bg-card, #ffffff)',
            borderRadius: 6,
            padding: '10px 14px',
            borderLeft: '4px solid #ff4d4f',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            marginTop: 8,
            marginBottom: 0,
          }}
        >
          <div style={{ color: '#cf1322', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            📌 驳回批注与修改建议：
          </div>
          <div
            style={{
              color: 'var(--text-primary, #1f1f1f)',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              fontWeight: 500,
            }}
          >
            {reasonText}
          </div>
        </div>
      </div>
    );
  }

  // 3. 首次发起确认（第一次 · 待发送）
  if (isFirstTimeInitiation) {
    if (!hasDocumentWorkflow) {
      return (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.06) 0%, rgba(114, 46, 209, 0.02) 100%)',
            border: '1px solid rgba(22, 119, 255, 0.25)',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1677ff', marginBottom: 2 }}>
              📋 业务申请要件确认（首次提交）
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              本业务无需生成合同文档。请核对下方表单中的业务要件（支持直接微调修改），如有凭据或票据佐证可在下方上传附件，确认无误后点击「确认并提交」。
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.06) 0%, rgba(82, 196, 26, 0.03) 100%)',
          border: '1px solid rgba(22, 119, 255, 0.25)',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <FileTextOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1677ff', marginBottom: 2 }}>
            📝 成果文档初稿核对与送审（首次提交）
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            系统已依据业务要件自动生成初稿（V1）。请核验核心业务要件并查验初稿，如需微调可直接下载本地修订后替换，确认无误后点击发送提交法务专项审查。
          </div>
        </div>
      </div>
    );
  }

  // 4. 发起人视角：流程已送审，等待他人审批核准中
  if (nodeSemantics.isWaitingForOther) {
    const isLegal = categoryTagText?.includes('法务') || nodeSemantics.currentStageName?.includes('法务');
    const stageTitle = nodeSemantics.currentStageName || (isLegal ? '法务合规审查' : '业务审批');
    const handler = nodeSemantics.currentAssigneeName || (isLegal ? 'law01' : '审核人员');

    return (
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(22, 119, 255, 0.06) 0%, rgba(114, 46, 209, 0.03) 100%)',
          border: '1px solid rgba(22, 119, 255, 0.25)',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <ClockCircleOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1677ff' }}>
              🕒 流程已送审 · 等待【{stageTitle}】中
            </span>
            <Tag color="processing" style={{ margin: 0 }}>
              当前处理人: @{handler}
            </Tag>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            您已成功提交流转本事项，当前正由 <strong>@{handler}</strong> 进行专业审核把关。在审批完成前，您可在下方点击「催办」提醒处理担当尽快办理，或点击「撤回」收回待办重新编辑。
          </div>
        </div>
      </div>
    );
  }

  // 5. 审批/审查节点（仅真实审批人可见）
  if (isApprovalNode) {
    const isLegal = categoryTagText?.includes('法务');
    return (
      <div
        style={{
          background: isLegal ? 'rgba(114, 46, 209, 0.06)' : 'rgba(22, 119, 255, 0.06)',
          border: `1px solid ${isLegal ? 'rgba(114, 46, 209, 0.25)' : 'rgba(22, 119, 255, 0.25)'}`,
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        {isLegal ? (
          <SafetyCertificateOutlined style={{ color: '#722ed1', fontSize: 16, marginTop: 2 }} />
        ) : (
          <CheckCircleOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 2 }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: isLegal ? '#722ed1' : '#1677ff', marginBottom: 2 }}>
            {isLegal ? '⚖️ 法务合规审查与核准' : '🔍 业务流转审批核准'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {hasDocumentWorkflow
              ? '请重点查验下方交付物文档及智能合规风险审查报告。如符合规范请点击「同意并流转」；若存在条款合规瑕疵请点击「驳回修改」并输入具体批注。'
              : '请查验下方业务要件与佐证材料。若要件完整合规请点击「同意并流转」；如有缺少或不符合要求请点击「驳回修改」说明原因。'}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
