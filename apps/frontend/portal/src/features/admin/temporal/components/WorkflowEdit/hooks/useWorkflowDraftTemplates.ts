import { useState, useEffect } from 'react';
import { useQueryClient, useMutation } from 'react-query';
import { message } from 'antd';
import {
  temporalWorkflowApi,
  AiWorkflowDraftSession,
  AiWorkflowDraftSessionMessage,
  AiWorkflowDraft,
  TemplateWorkflowDraft,
  BrowserDraftCommandInput,
} from '@/api/temporal';
import { carboneAPI, CarboneTemplate } from '@/api/carbone';
import { templateApi, Template } from '@/api/template';
import { resolveApiErrorMessage } from '../utils/workflowEditHelpers';

export type TemplateModalMode = 'document' | 'browser';

export interface UseWorkflowDraftTemplatesOptions {
  visible: boolean;
  openTemplatePickerOnOpen?: boolean;
  initialTemplatePickerMode?: TemplateModalMode;
  form: any;
  setEditingWorkflow: (wf: any) => void;
  didInitializeCodeSignatureRef: React.MutableRefObject<boolean>;
  setWorkflowDsl: (dsl: any) => void;
  setActivityDsl: (dsl: any) => void;
  setGeneratedCode: (code: string | null) => void;
  setLastGeneratedSignature: (sig: string | null) => void;
  setIsGeneratedCodeStale: (stale: boolean) => void;
  setSelectedStepIndexForConfig: (idx: number | null) => void;
  hydrateWorkflowDslForEditor: (workflowDsl: any, activityDsl: any) => Promise<any>;
  setSaveSubmitting: (submitting: boolean) => void;
}

export const useWorkflowDraftTemplates = ({
  visible,
  openTemplatePickerOnOpen,
  initialTemplatePickerMode = 'document',
  form,
  setEditingWorkflow,
  didInitializeCodeSignatureRef,
  setWorkflowDsl,
  setActivityDsl,
  setGeneratedCode,
  setLastGeneratedSignature,
  setIsGeneratedCodeStale,
  setSelectedStepIndexForConfig,
  hydrateWorkflowDslForEditor,
  setSaveSubmitting,
}: UseWorkflowDraftTemplatesOptions) => {
  const queryClient = useQueryClient();

  const [aiDraftSessionId, setAiDraftSessionId] = useState<string | null>(null);
  const [aiDraftMessages, setAiDraftMessages] = useState<AiWorkflowDraftSessionMessage[]>([]);
  const [aiDraftInput, setAiDraftInput] = useState('');
  const [currentAiDraft, setCurrentAiDraft] = useState<AiWorkflowDraft | null>(null);
  const [aiDraftDescription, setAiDraftDescription] = useState('');
  const [aiDraftReferenceUrl, setAiDraftReferenceUrl] = useState('');
  const [aiDraftDrawerVisible, setAiDraftDrawerVisible] = useState(false);
  const [applyDraftConfirmVisible, setApplyDraftConfirmVisible] = useState(false);

  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateModalMode, setTemplateModalMode] = useState<TemplateModalMode>('document');
  const [templates, setTemplates] = useState<CarboneTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [generatingTemplateId, setGeneratingTemplateId] = useState<string | null>(null);

  const [browserTemplates, setBrowserTemplates] = useState<Template[]>([]);
  const [browserTemplatesLoading, setBrowserTemplatesLoading] = useState(false);
  const [browserTemplateSearch, setBrowserTemplateSearch] = useState('');
  const [generatingBrowserTemplateId, setGeneratingBrowserTemplateId] = useState<string | null>(null);

  const syncAiDraftSessionState = (session: AiWorkflowDraftSession) => {
    setAiDraftSessionId(session.sessionId);
    setAiDraftMessages(Array.isArray(session.messages) ? session.messages : []);
    setCurrentAiDraft(session.currentDraft || null);
    void queryClient.invalidateQueries(['temporal-draft-sessions']);
  };

  const handleResumeAiDraftSession = async (sessionId: string) => {
    try {
      const session = await temporalWorkflowApi.getAiDraftSession(sessionId);
      syncAiDraftSessionState(session);
      void message.success('已恢复草稿会话');
    } catch (error: unknown) {
      void message.error(`恢复草稿会话失败: ${resolveApiErrorMessage(error, '未知错误')}`);
    }
  };

  const generateAiDraftMutation = useMutation(
    (payload: { description?: string; referenceUrl?: string }) =>
      temporalWorkflowApi.createAiDraftSession(payload),
    {
      onSuccess: (session: AiWorkflowDraftSession) => {
        syncAiDraftSessionState(session);
        const draft = session.currentDraft;
        if (draft?.warnings?.length) {
          void message.warning(draft.warnings[0]);
        }
      },
      onError: (error: unknown) => {
        void message.error(resolveApiErrorMessage(error, '生成 AI 工作流草稿失败'));
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
        void message.success('草稿会话已删除');
      },
      onError: (error: unknown) => {
        void message.error(resolveApiErrorMessage(error, '删除草稿会话失败'));
      },
    }
  );

  const handleDeleteAiDraftSession = (sessionId: string) => {
    deleteAiDraftSessionMutation.mutate(sessionId);
  };

  const refineAiDraftMutation = useMutation(
    (payload: { sessionId: string; userPrompt: string }) =>
      temporalWorkflowApi.refineAiDraftSession(payload.sessionId, payload.userPrompt),
    {
      onSuccess: (session: AiWorkflowDraftSession) => {
        syncAiDraftSessionState(session);
        const draft = session.currentDraft;
        if (draft?.warnings?.length) {
          void message.warning(draft.warnings[0]);
        }
      },
      onError: (error: unknown) => {
        void message.error(resolveApiErrorMessage(error, '改进 AI 工作流草稿失败'));
      },
    }
  );

  const applyDraftToEditor = async (
    draft: Pick<
      TemplateWorkflowDraft,
      'name' | 'description' | 'taskQueue' | 'workflowDsl' | 'activityDsl'
    >,
    successMessage: string
  ) => {
    const nextWorkflowDsl = await hydrateWorkflowDslForEditor(draft.workflowDsl, draft.activityDsl);
    setEditingWorkflow(null);
    didInitializeCodeSignatureRef.current = false;
    form.setFieldsValue({
      name: draft.name,
      description: draft.description,
      taskQueue: draft.taskQueue || 'SKILL_TASK_QUEUE',
    });
    setWorkflowDsl(nextWorkflowDsl);
    setActivityDsl(draft.activityDsl);
    setGeneratedCode(null);
    setLastGeneratedSignature(null);
    setIsGeneratedCodeStale(false);
    setSelectedStepIndexForConfig(nextWorkflowDsl?.steps?.length ? 0 : null);
    void message.success(successMessage);
  };

  const handleGenerateAiDraft = () => {
    if (!aiDraftDescription.trim() && !aiDraftReferenceUrl.trim()) {
      void message.warning('请至少输入工作流说明或参考 URL');
      return;
    }
    generateAiDraftMutation.mutate({
      description: aiDraftDescription.trim(),
      referenceUrl: aiDraftReferenceUrl.trim(),
    });
  };

  const handleRefineAiDraft = () => {
    if (!aiDraftInput.trim() || !aiDraftSessionId) {
      return;
    }
    const userPrompt = aiDraftInput.trim();
    setAiDraftInput('');
    refineAiDraftMutation.mutate({
      sessionId: aiDraftSessionId,
      userPrompt,
    });
  };

  const handleApplyCurrentDraft = () => {
    if (!currentAiDraft) {
      return;
    }
    setApplyDraftConfirmVisible(true);
  };

  const handleConfirmApplyCurrentDraft = async () => {
    if (!currentAiDraft) {
      return;
    }
    await applyDraftToEditor(currentAiDraft, '已应用 AI 生成的工作流草稿');
    setApplyDraftConfirmVisible(false);
    setAiDraftDrawerVisible(false);
  };

  const loadDocumentTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const data = await carboneAPI.getTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '加载模版失败'));
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadBrowserTemplates = async () => {
    setBrowserTemplatesLoading(true);
    try {
      const data = await templateApi.list({ page: 1, pageSize: 200 });
      setBrowserTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '加载浏览器模版失败'));
      setBrowserTemplates([]);
    } finally {
      setBrowserTemplatesLoading(false);
    }
  };

  const handleTemplateModeChange = async (value: string | number) => {
    const nextMode = value === 'browser' ? 'browser' : 'document';
    setTemplateModalMode(nextMode);
    if (nextMode === 'document') {
      await loadDocumentTemplates();
    } else {
      await loadBrowserTemplates();
    }
  };

  useEffect(() => {
    if (!visible) {
      setTemplateModalVisible(false);
      setSaveSubmitting(false);
      return;
    }
    if (!openTemplatePickerOnOpen) {
      return;
    }
    setTemplateModalVisible(true);
    setTemplateModalMode(initialTemplatePickerMode);
    if (initialTemplatePickerMode === 'browser') {
      void loadBrowserTemplates();
      return;
    }
    void loadDocumentTemplates();
  }, [visible, openTemplatePickerOnOpen, initialTemplatePickerMode, setSaveSubmitting]);

  const handleSelectTemplate = async (template: CarboneTemplate) => {
    try {
      setGeneratingTemplateId(template.id);
      const draft: TemplateWorkflowDraft = await temporalWorkflowApi.generateTemplateDraft(
        template.id
      );
      await applyDraftToEditor(draft, '已生成模版工作流草稿');
      setTemplateModalVisible(false);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '生成模版工作流失败'));
    } finally {
      setGeneratingTemplateId(null);
    }
  };

  const handleSelectBrowserTemplate = async (template: Template) => {
    try {
      setGeneratingBrowserTemplateId(template.id);
      const detail = await templateApi.getById(template.id);
      const templateSteps = Array.isArray(detail?.steps) ? detail.steps : [];
      const templateConfig =
        detail?.config && typeof detail.config === 'object'
          ? (detail.config as {
              loopDraft?: Record<string, unknown>;
              executionPlan?: {
                commands?: BrowserDraftCommandInput[];
                loopDraft?: Record<string, unknown>;
              };
            })
          : undefined;
      const executionPlan = templateConfig?.executionPlan;
      const executionPlanCommands = Array.isArray(executionPlan?.commands)
        ? executionPlan.commands.filter((command): command is BrowserDraftCommandInput =>
            Boolean(command && typeof command === 'object')
          )
        : [];
      const loopDraft =
        executionPlan?.loopDraft && typeof executionPlan.loopDraft === 'object'
          ? executionPlan.loopDraft
          : templateConfig?.loopDraft && typeof templateConfig.loopDraft === 'object'
            ? templateConfig.loopDraft
            : undefined;
      if (templateSteps.length === 0 && executionPlanCommands.length === 0) {
        void message.warning('该浏览器模版缺少可执行步骤，请先在模版页补充步骤');
        return;
      }
      const draft = await temporalWorkflowApi.generateBrowserDraft({
        templateId: detail.id,
        name: detail.name,
        description: detail.description,
        templateSteps: templateSteps.length > 0 ? templateSteps : undefined,
        loopDraft,
        paramsSchema: detail.params_schema,
        commands: executionPlanCommands.length > 0 ? executionPlanCommands : undefined,
      });
      if (
        !draft.activityDsl.activities[0]?.config?.steps ||
        (draft.activityDsl.activities[0]?.config?.steps as Array<unknown>).length === 0
      ) {
        void message.warning('该浏览器模版缺少可执行步骤，请先在模版页补充步骤');
        return;
      }
      await applyDraftToEditor(
        draft,
        templateSteps.length > 0
          ? `已基于模版步骤生成浏览器工作流草稿（${draft.browserTemplate.commandCount} 个步骤）`
          : executionPlanCommands.length > 0
            ? `已基于 executionPlan.commands 生成浏览器工作流草稿（${draft.browserTemplate.commandCount} 个步骤）`
            : `已生成浏览器工作流草稿（${draft.browserTemplate.commandCount} 个步骤）`
      );
      setTemplateModalVisible(false);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '使用浏览器模版生成工作流失败'));
    } finally {
      setGeneratingBrowserTemplateId(null);
    }
  };

  return {
    aiDraftSessionId,
    aiDraftMessages,
    aiDraftInput,
    setAiDraftInput,
    currentAiDraft,
    aiDraftDescription,
    setAiDraftDescription,
    aiDraftReferenceUrl,
    setAiDraftReferenceUrl,
    aiDraftDrawerVisible,
    setAiDraftDrawerVisible,
    applyDraftConfirmVisible,
    setApplyDraftConfirmVisible,
    handleResumeAiDraftSession,
    handleDeleteAiDraftSession,
    handleGenerateAiDraft,
    handleRefineAiDraft,
    handleApplyCurrentDraft,
    handleConfirmApplyCurrentDraft,
    generateAiDraftMutation,
    refineAiDraftMutation,
    deleteAiDraftSessionMutation,
    templateModalVisible,
    setTemplateModalVisible,
    templateModalMode,
    templates,
    templatesLoading,
    templateSearch,
    setTemplateSearch,
    generatingTemplateId,
    browserTemplates,
    browserTemplatesLoading,
    browserTemplateSearch,
    setBrowserTemplateSearch,
    generatingBrowserTemplateId,
    loadDocumentTemplates,
    loadBrowserTemplates,
    handleTemplateModeChange,
    handleSelectTemplate,
    handleSelectBrowserTemplate,
  };
};
