import React from 'react';
import { Drawer, Space } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { TemplateWorkflowDraft } from '@/api/temporal';
import { useAiDraftSession } from './WorkflowEdit/hooks/useAiDraftSession';
import { AiDraftSessionSidebar } from './WorkflowEdit/components/AiDraftSessionSidebar';
import { AiDraftDetailPanel } from './WorkflowEdit/components/AiDraftDetailPanel';
import { AiDraftNewSessionForm } from './WorkflowEdit/components/AiDraftNewSessionForm';
import { AiDraftConfirmModal } from './WorkflowEdit/components/AiDraftConfirmModal';

export interface AiDraftDrawerProps {
  visible: boolean;
  onClose: () => void;
  onApplyDraft: (
    draft: Pick<
      TemplateWorkflowDraft,
      'name' | 'description' | 'taskQueue' | 'workflowDsl' | 'activityDsl'
    >
  ) => void;
}

export const AiDraftDrawer: React.FC<AiDraftDrawerProps> = ({ visible, onClose, onApplyDraft }) => {
  const session = useAiDraftSession(visible);

  const handleConfirmApply = () => {
    if (!session.currentAiDraft) return;
    onApplyDraft({
      name: session.currentAiDraft.name,
      description: session.currentAiDraft.description,
      taskQueue: session.currentAiDraft.taskQueue,
      workflowDsl: session.currentAiDraft.workflowDsl,
      activityDsl: session.currentAiDraft.activityDsl,
    });
    session.setApplyDraftConfirmVisible(false);
    onClose();
  };

  return (
    <Drawer
      open={visible}
      onClose={onClose}
      title={
        <Space>
          <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} />
          <span>AI 智能生成工作流草稿</span>
        </Space>
      }
      width={1040}
      styles={{ body: { padding: 0, display: 'flex', height: '100%' } }}
    >
      <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* 左侧历史草稿会话侧边栏 */}
        <AiDraftSessionSidebar
          sessions={session.aiDraftSessionsQuery.data || []}
          activeSessionId={session.aiDraftSessionId}
          onNewSession={() => {
            session.setAiDraftSessionId(null);
            session.setCurrentAiDraft(null);
          }}
          onSelectSession={(id) => void session.handleResumeAiDraftSession(id)}
          onDeleteSession={(id) => session.deleteAiDraftSessionMutation.mutate(id)}
          loading={session.aiDraftSessionsQuery.isLoading}
        />

        {/* 右侧对话或新建表单主区域 */}
        {session.aiDraftSessionId ? (
          <AiDraftDetailPanel
            currentDraft={session.currentAiDraft}
            messages={session.aiDraftMessages}
            aiDraftInput={session.aiDraftInput}
            setAiDraftInput={session.setAiDraftInput}
            onRefineDraft={session.handleRefineAiDraft}
            onApplyDraft={() => session.setApplyDraftConfirmVisible(true)}
            refineLoading={session.refineAiDraftMutation.isLoading}
          />
        ) : (
          <AiDraftNewSessionForm
            description={session.aiDraftDescription}
            setDescription={session.setAiDraftDescription}
            referenceUrl={session.aiDraftReferenceUrl}
            setReferenceUrl={session.setAiDraftReferenceUrl}
            onSubmit={session.handleGenerateAiDraft}
            loading={session.generateAiDraftMutation.isLoading}
          />
        )}
      </div>

      <AiDraftConfirmModal
        visible={session.applyDraftConfirmVisible}
        onCancel={() => session.setApplyDraftConfirmVisible(false)}
        onConfirm={handleConfirmApply}
        currentDraft={session.currentAiDraft}
      />
    </Drawer>
  );
};
