import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Form, Spin, Tabs, message, theme as antdTheme } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { sessionApi } from '@/api/session';
import { templateApi, type TemplateParamsSchema, type TemplateStep } from '@/api/template';
import TemplateConfigTab from '@/features/browser-templates/components/TemplateConfigTab';
import TemplateDetailSummaryCard from '@/features/browser-templates/components/TemplateDetailSummaryCard';
import TemplateParameterModal from '@/features/browser-templates/components/TemplateParameterModal';
import TemplateParamsTab from '@/features/browser-templates/components/TemplateParamsTab';
import TemplateStepsTab from '@/features/browser-templates/components/TemplateStepsTab';
import {
  getTemplateParamProperties,
  getTemplateRequiredParams,
  normalizeTemplateSteps,
} from '@/features/browser-templates/lib/templateDetail';
import {
  applyTemplateWorkflowComposition,
  buildStepCaptureProfile,
  buildTemplateWorkflowComposition,
  DEFAULT_STEP_CAPTURE_OPTIONS,
  DEFAULT_TEMPLATE_WORKFLOW_COMPOSITION_EDITOR,
  getStepCaptureOptions,
  hydrateTemplateStepCaptureProfiles,
  toTemplateWorkflowCompositionEditorState,
  updateStepCaptureOptions,
  validateTemplateWorkflowCompositionEditor,
  type TemplateProcessingStepEditor,
  type TemplateProcessingStepType,
  type TemplateStepCaptureOption,
  type TemplateWorkflowCompositionEditorState,
} from '@/features/browser-templates/lib/templateWorkflowComposition';
import { useAuthStore } from '@/shared/store/authStore';

const TemplateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation(['common', 'template']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = antdTheme.useToken();
  const { user } = useAuthStore();

  const [executeModalVisible, setExecuteModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [workerExhausted, setWorkerExhausted] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftSteps, setDraftSteps] = useState<TemplateStep[]>([]);
  const [draftParamsSchema, setDraftParamsSchema] = useState<TemplateParamsSchema>({
    type: 'object',
    properties: {},
    required: [],
  });
  const [draftWorkflowComposition, setDraftWorkflowComposition] =
    useState<TemplateWorkflowCompositionEditorState>({
      ...DEFAULT_TEMPLATE_WORKFLOW_COMPOSITION_EDITOR,
    });
  const [form] = Form.useForm();

  const templateQuery = useQuery(['template', id], () => templateApi.getById(id!), {
    enabled: !!id,
  });

  useEffect(() => {
    if (searchParams.get('execute') === 'true' && templateQuery.data?.status === 'PUBLISHED') {
      setExecuteModalVisible(true);
    }
    if (searchParams.get('test') === 'true' && templateQuery.data) {
      setTestModalVisible(true);
    }
  }, [searchParams, templateQuery.data?.status, templateQuery.data]);

  const updateMutation = useMutation(
    (payload: {
      id: string;
      data: {
        name?: string;
        description?: string;
        params_schema?: TemplateParamsSchema;
        steps?: TemplateStep[];
        config?: Record<string, unknown>;
      };
    }) => templateApi.update(payload.id, payload.data),
    {
      onSuccess: () => {
        message.success('模板已更新');
        setIsEditMode(false);
        queryClient.invalidateQueries(['template', id]);
      },
      onError: () => {
        message.error('更新模板失败');
      },
    }
  );

  const executeMutation = useMutation(
    async (params: Record<string, unknown>) => {
      if (!user?.id) {
        throw new Error('用户未登录，请先登录');
      }
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: id!,
        params,
      });
      await sessionApi.start(result.session.id, {
        template_id: id!,
        params,
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        message.success(t('template:executeSuccess'));
        setExecuteModalVisible(false);
        setWorkerExhausted(false);
        navigate(`/sessions/${session.id}`);
      },
      onError: (error: any) => {
        const errorMsg = error.response?.data?.message || error.message || '';
        if (errorMsg.includes('No available workers') || errorMsg.includes('workers')) {
          setWorkerExhausted(true);
          message.error(t('template:workerExhausted'));
        } else {
          message.error(errorMsg || t('template:executeFailed'));
        }
      },
    }
  );

  const testMutation = useMutation(
    async (params: Record<string, unknown>) => {
      if (!user?.id) {
        throw new Error('用户未登录，请先登录');
      }
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: id!,
        params,
      });
      await sessionApi.start(result.session.id, {
        template_id: id!,
        params,
      });
      return result.session;
    },
    {
      onSuccess: (session) => {
        message.success({
          content: `${t('template:testSuccess')}（Session: ${session.id}）`,
          key: 'template-test-progress',
        });
        setWorkerExhausted(false);
      },
      onError: (error: any) => {
        const errorMsg = error.response?.data?.message || error.message || '';
        if (errorMsg.includes('No available workers') || errorMsg.includes('workers')) {
          setWorkerExhausted(true);
          message.error({
            content: t('template:workerExhausted'),
            key: 'template-test-progress',
          });
        } else {
          message.error({
            content: errorMsg || t('template:testFailed'),
            key: 'template-test-progress',
          });
        }
      },
    }
  );

  const template = templateQuery.data;

  useEffect(() => {
    if (!template) {
      return;
    }
    setDraftName(template.name || '');
    setDraftDescription(template.description || '');
    setDraftSteps(hydrateTemplateStepCaptureProfiles(template.steps || [], template.config || {}));
    setDraftParamsSchema(
      (template.params_schema || { type: 'object', properties: {}, required: [] }) as TemplateParamsSchema
    );
    setDraftWorkflowComposition(
      toTemplateWorkflowCompositionEditorState(template.config || {})
    );
  }, [template]);

  const paramProperties = useMemo(() => getTemplateParamProperties(template), [template]);
  const requiredParams = useMemo(() => getTemplateRequiredParams(template), [template]);
  const hasParams = Object.keys(paramProperties).length > 0;

  const handleTestClick = () => {
    if (hasParams) {
      setTestModalVisible(true);
      return;
    }
    testMutation.mutate({});
  };

  const handleTestConfirm = async () => {
    try {
      const values = await form.validateFields();
      setTestModalVisible(false);
      message.loading({
        content: '测试已提交，正在后台执行...',
        key: 'template-test-progress',
        duration: 0,
      });
      testMutation.mutate(values);
    } catch {
      return;
    }
  };

  const handleExecuteConfirm = async () => {
    try {
      const values = await form.validateFields();
      executeMutation.mutate(values);
    } catch {
      return;
    }
  };

  const updateDraftStepField = (
    index: number,
    key: 'action' | 'step_id' | 'execution_policy',
    value: string
  ) => {
    const previousStepId = draftSteps[index]?.step_id;
    setDraftSteps((prev) =>
      prev.map((step, idx) => (idx === index ? { ...step, [key]: value } : step))
    );
    if (key === 'step_id' && previousStepId) {
      setDraftWorkflowComposition((prev) => ({
        ...prev,
        processingSteps: prev.processingSteps.map((post) =>
          post.sourceStepId === previousStepId ? { ...post, sourceStepId: value } : post
        ),
      }));
    }
  };

  const handleDeleteDraftStep = (index: number) => {
    setDraftSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddDraftStep = () => {
    setDraftSteps((prev) => [
      ...prev,
      {
        step_id: `step_${prev.length + 1}`,
        action: 'click',
        execution_policy: 'auto_execute',
        capture_profile: buildStepCaptureProfile(DEFAULT_STEP_CAPTURE_OPTIONS),
      },
    ]);
  };

  const handleUpdateStepCapture = (
    index: number,
    options: TemplateStepCaptureOption[]
  ) => {
    setDraftSteps((prev) =>
      prev.map((step, stepIndex) =>
        stepIndex === index ? updateStepCaptureOptions(step, options) : step
      )
    );
  };

  const handleAddProcessingStep = (type: TemplateProcessingStepType) => {
    const preferredSources = draftSteps.filter((step) => step.capture_profile?.capture.mainContent);
    const sourceStepIds = preferredSources.length > 0
      ? preferredSources.map((s) => s.step_id)
      : draftSteps.length > 0
        ? [draftSteps[draftSteps.length - 1].step_id]
        : [];

    // Automatically ensure all selected steps have mainContent enabled in capture_profile
    if (sourceStepIds.length > 0) {
      setDraftSteps((prev) =>
        prev.map((step) => {
          if (sourceStepIds.includes(step.step_id) && !step.capture_profile?.capture.mainContent) {
            const currentOptions = getStepCaptureOptions(step);
            return updateStepCaptureOptions(
              step,
              currentOptions.includes('mainContent') ? currentOptions : [...currentOptions, 'mainContent']
            );
          }
          return step;
        })
      );
    }

    setDraftWorkflowComposition((prev) => ({
      ...prev,
      processingSteps: [
        ...prev.processingSteps,
        {
          id: `post_process_${prev.processingSteps.length + 1}`,
          type,
          sourceStepId: sourceStepIds[0] || '',
          sourceStepIds,
          processingMode: 'custom',
          customPrompt: '请分析并提取以上网页正文的核心内容，输出清晰结构化的 Markdown 报告。',
          targetId: type === 'workflow_skill' ? '' : 'transform_text',
          targetVersion: type === 'workflow_skill' ? '' : '1',
          runWhen: type === 'workflow_skill' ? 'browser_terminal' : 'browser_succeeded',
        },
      ],
    }));
  };

  const handleUpdateProcessingStep = (
    index: number,
    patch: Partial<TemplateProcessingStepEditor>
  ) => {
    if (patch.sourceStepIds || patch.sourceStepId) {
      const stepIds = patch.sourceStepIds || (patch.sourceStepId ? [patch.sourceStepId] : []);
      if (stepIds.length > 0) {
        setDraftSteps((prev) =>
          prev.map((step) => {
            if (stepIds.includes(step.step_id) && !step.capture_profile?.capture.mainContent) {
              const currentOptions = getStepCaptureOptions(step);
              return updateStepCaptureOptions(
                step,
                currentOptions.includes('mainContent') ? currentOptions : [...currentOptions, 'mainContent']
              );
            }
            return step;
          })
        );
      }
    }

    setDraftWorkflowComposition((prev) => ({
      ...prev,
      processingSteps: prev.processingSteps.map((post, postIndex) =>
        postIndex === index ? { ...post, ...patch } : post
      ),
    }));
  };

  const handleDeleteProcessingStep = (index: number) => {
    setDraftWorkflowComposition((prev) => ({
      ...prev,
      processingSteps: prev.processingSteps.filter((_, postIndex) => postIndex !== index),
    }));
  };

  const handleSaveTemplateDraft = () => {
    if (!template) {
      return;
    }
    const compositionErrors = validateTemplateWorkflowCompositionEditor(
      draftSteps,
      draftWorkflowComposition
    );
    if (compositionErrors.length > 0) {
      void message.error(compositionErrors[0]);
      return;
    }
    const workflowComposition = buildTemplateWorkflowComposition(
      draftSteps,
      draftWorkflowComposition
    );
    updateMutation.mutate({
      id: template.id,
      data: {
        name: draftName.trim() || template.name,
        description: draftDescription,
        params_schema: draftParamsSchema,
        steps: normalizeTemplateSteps(draftSteps),
        config: applyTemplateWorkflowComposition(template.config || {}, workflowComposition),
      },
    });
  };

  if (templateQuery.isLoading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!template) {
    return (
      <Card>
        <div style={{ marginBottom: 16 }}>{t('common:noData')}</div>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('template:templateList')}
        </Button>
      </Card>
    );
  }

  const jsonBlockStyle: React.CSSProperties = {
    margin: 0,
    background: token.colorFillAlter,
    color: token.colorText,
    border: `1px solid ${token.colorBorderSecondary}`,
    padding: 16,
    borderRadius: token.borderRadius,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
  const scriptBlockStyle: React.CSSProperties = {
    ...jsonBlockStyle,
    background: token.colorBgElevated,
    color: token.colorText,
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/templates')}>
          <ArrowLeftOutlined /> {t('template:templateList')}
        </Button>
      </div>

      {workerExhausted && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('template:workerExhaustedTitle')}
          description={<span>{t('template:workerExhaustedDesc')}</span>}
        />
      )}

      <TemplateDetailSummaryCard
        template={template}
        isEditMode={isEditMode}
        draftName={draftName}
        draftDescription={draftDescription}
        onDraftNameChange={setDraftName}
        onDraftDescriptionChange={setDraftDescription}
        onToggleEditMode={() => setIsEditMode(true)}
        onCancelEdit={() => {
          setDraftName(template.name || '');
          setDraftDescription(template.description || '');
          setDraftSteps(
            hydrateTemplateStepCaptureProfiles(template.steps || [], template.config || {})
          );
          setDraftParamsSchema(
            (template.params_schema || { type: 'object', properties: {}, required: [] }) as TemplateParamsSchema
          );
          setDraftWorkflowComposition(
            toTemplateWorkflowCompositionEditorState(template.config || {})
          );
          setIsEditMode(false);
        }}
        onSave={handleSaveTemplateDraft}
        onTest={handleTestClick}
        updateLoading={updateMutation.isLoading}
        testLoading={testMutation.isLoading}
      />

      <Card style={{ marginTop: 16 }}>
        <Tabs defaultActiveKey="steps">
          <Tabs.TabPane tab={t('template:templateSteps')} key="steps">
            <TemplateStepsTab
              steps={
                isEditMode
                  ? draftSteps
                  : hydrateTemplateStepCaptureProfiles(template.steps || [], template.config || {})
              }
              processingSteps={
                isEditMode
                  ? draftWorkflowComposition.processingSteps
                  : toTemplateWorkflowCompositionEditorState(template.config || {}).processingSteps
              }
              isEditMode={isEditMode}
              jsonBlockStyle={jsonBlockStyle}
              onAddBrowserStep={handleAddDraftStep}
              onAddProcessingStep={handleAddProcessingStep}
              onDeleteStep={handleDeleteDraftStep}
              onDeleteProcessingStep={handleDeleteProcessingStep}
              onUpdateStepField={updateDraftStepField}
              onUpdateStepCapture={handleUpdateStepCapture}
              onUpdateProcessingStep={handleUpdateProcessingStep}
            />
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateParams')} key="params">
            <TemplateParamsTab
              paramsSchema={
                isEditMode
                  ? draftParamsSchema
                  : ((template.params_schema || {
                      type: 'object',
                      properties: {},
                      required: [],
                    }) as TemplateParamsSchema)
              }
              steps={isEditMode ? draftSteps : (template.steps || [])}
              isEditMode={isEditMode}
              jsonBlockStyle={jsonBlockStyle}
              onChange={setDraftParamsSchema}
            />
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateGuards')} key="guards">
            <pre style={jsonBlockStyle}>{JSON.stringify(template.guards, null, 2)}</pre>
          </Tabs.TabPane>

          <Tabs.TabPane tab={t('template:templateConfig')} key="config">
            <TemplateConfigTab
              config={(template.config || {}) as Record<string, unknown>}
              jsonBlockStyle={jsonBlockStyle}
              scriptBlockStyle={scriptBlockStyle}
            />
          </Tabs.TabPane>
        </Tabs>
      </Card>

      <TemplateParameterModal
        title={t('template:executeModalTitle')}
        description={t('template:executeModalDesc')}
        open={executeModalVisible}
        onOk={handleExecuteConfirm}
        onCancel={() => setExecuteModalVisible(false)}
        confirmLoading={executeMutation.isLoading}
        okText={t('template:executeTemplate')}
        cancelText={t('common:cancel')}
        form={form}
        paramProperties={paramProperties}
        requiredParams={requiredParams}
        fallbackPlaceholder={t('template:paramValue')}
      />

      <TemplateParameterModal
        title={t('template:testModalTitle')}
        description={t('template:testModalDesc')}
        open={testModalVisible}
        onOk={handleTestConfirm}
        onCancel={() => setTestModalVisible(false)}
        confirmLoading={testMutation.isLoading}
        okText={t('template:testTemplate')}
        cancelText={t('common:cancel')}
        form={form}
        paramProperties={paramProperties}
        requiredParams={requiredParams}
        fallbackPlaceholder={t('template:paramValue')}
      />
    </div>
  );
};

export default TemplateDetailPage;
