import React from 'react';
import { Button, Popconfirm, Tooltip } from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  RollbackOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { WorkflowNodeSemantics } from '../lib/coordinationNodeClassifier';

export interface BuildInboxTaskDetailFooterOptions {
  isSubmitting: boolean;
  onClose: () => void;
  onOpenInAi?: () => void;
  hasComparisonPair: boolean;
  onCompareContractVersions: () => void;
  nodeSemantics: WorkflowNodeSemantics;
  onRemind: () => void;
  onRecall: () => void;
  isActionable: boolean;
  isAssignment: boolean;
  onSubmit: (action: 'approve' | 'reject' | 'complete') => void;
}

export function buildInboxTaskDetailFooter({
  isSubmitting,
  onClose,
  onOpenInAi,
  hasComparisonPair,
  onCompareContractVersions,
  nodeSemantics,
  onRemind,
  onRecall,
  isActionable,
  isAssignment,
  onSubmit,
}: BuildInboxTaskDetailFooterOptions): React.ReactNode[] {
  return [
    <Button key="close" onClick={onClose} disabled={isSubmitting}>
      关闭
    </Button>,
    onOpenInAi ? (
      <Button
        key="ai"
        icon={<RobotOutlined style={{ color: '#722ed1' }} />}
        onClick={onOpenInAi}
        disabled={isSubmitting}
      >
        在 AI 窗口中处理
      </Button>
    ) : null,
    hasComparisonPair ? (
      <Button
        key="compare"
        icon={<SwapOutlined style={{ color: '#722ed1' }} />}
        onClick={onCompareContractVersions}
        disabled={isSubmitting}
        style={{ borderColor: '#722ed1', color: '#722ed1' }}
        title="将新旧版本合同载入 AI 窗口进行智能比对与红线审查"
      >
        比较合同版本 (AI)
      </Button>
    ) : null,
    nodeSemantics.isWaitingForOther && nodeSemantics.canRemind ? (
      <Tooltip key="remind-tip" title={`向当前处理担当 @${nodeSemantics.currentAssigneeName || '处理担当'} 发送催办提醒`}>
        <Button
          key="remind"
          icon={<BellOutlined style={{ color: '#fa8c16' }} />}
          disabled={isSubmitting}
          onClick={onRemind}
          style={{ borderColor: '#fa8c16', color: '#fa8c16' }}
        >
          催办
        </Button>
      </Tooltip>
    ) : null,
    nodeSemantics.isWaitingForOther && nodeSemantics.canRecall ? (
      <Popconfirm
        key="recall-popconfirm"
        title="确定撤回此发起事项？"
        description="撤回后事项将退回待办，您可重新编辑。"
        overlayStyle={{ maxWidth: 280 }}
        onConfirm={onRecall}
        okText="确认撤回"
        cancelText="取消"
        disabled={isSubmitting}
      >
        <Button
          key="recall"
          danger
          icon={<RollbackOutlined />}
          loading={isSubmitting}
        >
          撤回
        </Button>
      </Popconfirm>
    ) : null,
    isActionable && nodeSemantics.canReject && nodeSemantics.allowReject ? (
      <Button
        key="reject"
        danger
        icon={<CloseCircleOutlined />}
        loading={isSubmitting}
        onClick={() => onSubmit('reject')}
      >
        驳回修改
      </Button>
    ) : null,
    isActionable && (!nodeSemantics.isApprovalNode || nodeSemantics.canApprove) ? (
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
          nodeSemantics.isRevisionRequired
            ? { backgroundColor: '#fa541c', borderColor: '#fa541c' }
            : nodeSemantics.cardActionType === 'send'
            ? { backgroundColor: '#1677ff', borderColor: '#1677ff' }
            : isAssignment
            ? { backgroundColor: '#722ed1', borderColor: '#722ed1' }
            : { backgroundColor: '#1677ff', borderColor: '#1677ff' }
        }
        onClick={() => onSubmit(isAssignment ? 'complete' : 'approve')}
      >
        {nodeSemantics.isRevisionRequired
          ? (nodeSemantics.hasDocumentWorkflow ? '修改完成，重新提交' : '修改完成，重新提交申请')
          : nodeSemantics.modalSubmitText}
      </Button>
    ) : null,
  ].filter(Boolean);
}
