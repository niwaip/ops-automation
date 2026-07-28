import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { message } from 'antd';
import {
  temporalWorkflowApi,
  AiWorkflowDraft,
  AiWorkflowDraftSession,
  AiWorkflowDraftSessionMessage,
} from '@/api/temporal';

export function useAiDraftSession(visible: boolean) {
  const queryClient = useQueryClient();

  const [aiDraftSessionId, setAiDraftSessionId] = useState<string | null>(null);
  const [aiDraftMessages, setAiDraftMessages] = useState<AiWorkflowDraftSessionMessage[]>([]);
  const [aiDraftInput, setAiDraftInput] = useState('');
  const [currentAiDraft, setCurrentAiDraft] = useState<AiWorkflowDraft | null>(null);
  const [aiDraftDescription, setAiDraftDescription] = useState('');
  const [aiDraftReferenceUrl, setAiDraftReferenceUrl] = useState('');
  const [applyDraftConfirmVisible, setApplyDraftConfirmVisible] = useState(false);

  const [skillFileContent, setSkillFileContent] = useState<string | undefined>(undefined);
  const [skillFileType, setSkillFileType] = useState<string | undefined>(undefined);
  const [skillFileName, setSkillFileName] = useState<string | undefined>(undefined);

  const aiDraftSessionsQuery = useQuery(
    ['temporal-draft-sessions'],
    () => temporalWorkflowApi.listAiDraftSessions(),
    {
      enabled: visible,
      onError: (error: any) => {
        message.error(`加载草稿会话失败: ${error?.message || '未知错误'}`);
      },
    }
  );

  const syncAiDraftSessionState = (session: AiWorkflowDraftSession) => {
    setAiDraftSessionId(session.sessionId);
    setAiDraftMessages(session.messages || []);
    setCurrentAiDraft(session.currentDraft || null);
  };

  const generateAiDraftMutation = useMutation(
    (payload: {
      description?: string;
      referenceUrl?: string;
      skillFileContent?: string;
      skillFileType?: string;
    }) => temporalWorkflowApi.createAiDraftSession(payload),
    {
      onSuccess: (session: AiWorkflowDraftSession) => {
        syncAiDraftSessionState(session);
        void queryClient.invalidateQueries(['temporal-draft-sessions']);
        if (session.currentDraft?.warnings?.length) {
          message.warning(session.currentDraft.warnings[0]);
        }
      },
      onError: (error: any) => {
        message.error('生成 AI 工作流草稿失败: ' + (error?.message || '未知错误'));
      },
    }
  );

  const refineAiDraftMutation = useMutation(
    (payload: { sessionId: string; userPrompt: string }) =>
      temporalWorkflowApi.refineAiDraftSession(payload.sessionId, payload.userPrompt),
    {
      onSuccess: (session: AiWorkflowDraftSession) => {
        syncAiDraftSessionState(session);
        if (session.currentDraft?.warnings?.length) {
          message.warning(session.currentDraft.warnings[0]);
        }
      },
      onError: (error: any) => {
        message.error('改进 AI 工作流草稿失败: ' + (error?.message || '未知错误'));
      },
    }
  );

  const deleteAiDraftSessionMutation = useMutation(
    (sessionId: string) => temporalWorkflowApi.deleteAiDraftSession(sessionId),
    {
      onSuccess: (_, sessionId) => {
        if (aiDraftSessionId === sessionId) {
          setAiDraftSessionId(null);
          setAiDraftMessages([]);
          setCurrentAiDraft(null);
        }
        void queryClient.invalidateQueries(['temporal-draft-sessions']);
        message.success('草稿会话已删除');
      },
      onError: (error: any) => {
        message.error('删除草稿会话失败: ' + (error?.message || '未知错误'));
      },
    }
  );

  const handleGenerateAiDraft = () => {
    if (!aiDraftDescription.trim() && !aiDraftReferenceUrl.trim() && !skillFileContent) {
      message.warning('请至少输入工作流说明、参考 URL 或上传技能文件');
      return;
    }
    generateAiDraftMutation.mutate({
      description: aiDraftDescription.trim() || undefined,
      referenceUrl: aiDraftReferenceUrl.trim() || undefined,
      skillFileContent,
      skillFileType,
    });
  };

  const handleClearSkillFile = () => {
    setSkillFileContent(undefined);
    setSkillFileType(undefined);
    setSkillFileName(undefined);
  };

  const handleRefineAiDraft = () => {
    if (!aiDraftInput.trim() || !aiDraftSessionId) return;
    const userPrompt = aiDraftInput.trim();
    setAiDraftInput('');
    refineAiDraftMutation.mutate({
      sessionId: aiDraftSessionId,
      userPrompt,
    });
  };

  const handleResumeAiDraftSession = async (sessionId: string) => {
    try {
      const session = await temporalWorkflowApi.getAiDraftSession(sessionId);
      syncAiDraftSessionState(session);
      message.success('已恢复草稿会话');
    } catch (error: any) {
      message.error('恢复草稿会话失败: ' + (error?.message || '未知错误'));
    }
  };

  return {
    aiDraftSessionId,
    setAiDraftSessionId,
    aiDraftMessages,
    aiDraftInput,
    setAiDraftInput,
    currentAiDraft,
    setCurrentAiDraft,
    aiDraftDescription,
    setAiDraftDescription,
    aiDraftReferenceUrl,
    setAiDraftReferenceUrl,
    skillFileContent,
    setSkillFileContent,
    skillFileType,
    setSkillFileType,
    skillFileName,
    setSkillFileName,
    handleClearSkillFile,
    applyDraftConfirmVisible,
    setApplyDraftConfirmVisible,
    aiDraftSessionsQuery,
    generateAiDraftMutation,
    refineAiDraftMutation,
    deleteAiDraftSessionMutation,
    handleGenerateAiDraft,
    handleRefineAiDraft,
    handleResumeAiDraftSession,
  };
}

