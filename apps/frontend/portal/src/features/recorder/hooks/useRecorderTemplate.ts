import { useState } from 'react';
import { message } from 'antd';
import { apiClient } from '@/shared/api/http/client';
import {
  templateApi,
  type TemplateStepAction,
  type TemplateStepExecutionPolicy,
} from '@/api/template';
import { sessionApi, workerApi } from '@/api/session';
import type { BranchStepSpec } from '@/features/recorder/lib/branch-analysis.api';
import type {
  CommandHistoryEntry,
  ExecutionBackend,
  RecorderDebugExportResponse,
  TemplateStep,
} from '../components/AIControls.types';
import { resolveErrorMessage } from '../components/AIControls.utils';
import {
  appendTemplateScreenshotSteps,
  buildBackendCoreSteps,
  buildBranchTemplateSteps,
  buildTemplateDescriptionFromArtifacts,
  buildTemplateNameFromArtifacts,
  buildTemplateParamsSchemaFromArtifacts,
  buildTemplateStepsFromArtifacts,
  extractParameters,
  generateScript,
} from '../components/AIControls.template';

export interface UseRecorderTemplateParams {
  user: { id?: string } | null;
  history: CommandHistoryEntry[];
  setHistory: React.Dispatch<React.SetStateAction<CommandHistoryEntry[]>>;
  autoAppendScreenshots: boolean;
  waitDuration: number;
  executionBackend: ExecutionBackend;
  isReactChatMode: boolean;
  recorderDebugSessionId?: string;
  recorderDebugRuntimeSessionId?: string;
  getScreenshotModeLabel: () => string;
  navigate: (path: string) => void;
}

export const useRecorderTemplate = ({
  user,
  history,
  setHistory,
  autoAppendScreenshots,
  waitDuration,
  executionBackend,
  isReactChatMode,
  recorderDebugSessionId,
  recorderDebugRuntimeSessionId,
  getScreenshotModeLabel,
  navigate,
}: UseRecorderTemplateParams) => {
  const [templateSteps, setTemplateSteps] = useState<TemplateStep[]>([]);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [compiledScript, setCompiledScript] = useState('');
  const [paramNames, setParamNames] = useState<Record<string, string>>({});
  const [paramEnabled, setParamEnabled] = useState<Record<string, boolean>>({});
  const [isTemplatePanelExpanded, setIsTemplatePanelExpanded] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [exportTemplateLoading, setExportTemplateLoading] = useState(false);
  const [showBranchGateModal, setShowBranchGateModal] = useState(false);
  const [branchInsertAfterStepId, setBranchInsertAfterStepId] = useState<string | undefined>();

  const openBranchGateModal = (stepId?: string) => {
    setBranchInsertAfterStepId(stepId);
    setShowBranchGateModal(true);
  };

  const handleConfirmBranchGate = (spec: BranchStepSpec) => {
    const branchSteps = buildBranchTemplateSteps(spec);
    setTemplateSteps((prev) => {
      const insertIndex = branchInsertAfterStepId
        ? prev.findIndex((step) => step.id === branchInsertAfterStepId)
        : -1;
      if (insertIndex < 0) {
        return [...prev, ...branchSteps];
      }
      return [...prev.slice(0, insertIndex + 1), ...branchSteps, ...prev.slice(insertIndex + 1)];
    });
    setShowBranchGateModal(false);
    setBranchInsertAfterStepId(undefined);
    void message.success('条件步骤已插入模版');
  };

  const handleRemoveTemplateStep = (stepId: string) => {
    setTemplateSteps((prev) => prev.filter((s) => s.id !== stepId));
  };

  const handleUpdateTemplateStepPolicy = (
    stepId: string,
    executionPolicy: TemplateStepExecutionPolicy
  ) => {
    setTemplateSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, execution_policy: executionPolicy } : step
      )
    );
  };

  const handleClearTemplate = () => {
    setTemplateSteps([]);
    setTemplateName('');
    setSavedTemplateId(null);
  };

  const handleCompileTemplate = () => {
    if (templateSteps.length === 0) {
      void message.warning('模版为空，请先添加命令');
      return;
    }

    const extractedParams = extractParameters(templateSteps);
    const script = generateScript(templateSteps, extractedParams);
    setCompiledScript(script);
    setShowScriptModal(true);
  };

  const handleSaveCompiledTemplate = async () => {
    if (templateSteps.length === 0) {
      void message.warning('模版为空，请先添加命令');
      return;
    }

    const extractedParams = extractParameters(templateSteps);
    const replaceableParamsSchema: Record<
      string,
      { type: string; description: string; default?: string | number }
    > = {};
    Object.entries(extractedParams).forEach(([name, schema]) => {
      if (schema.replaceable) {
        replaceableParamsSchema[name] = schema;
      }
    });

    const coreBackendSteps = buildBackendCoreSteps(
      templateSteps,
      extractedParams,
      (originalName, schema) => (schema.replaceable ? originalName : undefined)
    );

    const backendSteps = appendTemplateScreenshotSteps(coreBackendSteps, autoAppendScreenshots, waitDuration);

    const paramsSchema = {
      type: 'object',
      properties: replaceableParamsSchema,
      required: Object.keys(replaceableParamsSchema),
    };

    const name = templateName || `编译模版 ${new Date().toLocaleString()}`;

    try {
      const createdTemplate = await templateApi.create({
        name,
        description: `由智能录制编译生成的模版，包含 ${templateSteps.length} 个步骤（${getScreenshotModeLabel()}），${Object.keys(replaceableParamsSchema).length} 个可替换参数`,
        params_schema: paramsSchema,
        steps: backendSteps,
        created_by: user?.id || 'ai_recorder',
      });

      void message.success(`模版已保存: ${createdTemplate.name}`);
      setShowScriptModal(false);
      setSavedTemplateId(createdTemplate.id);
      setTemplateName('');
      void message.info('模版已保存，可以点击"测试模版"按钮进行测试', 5);
    } catch (error: unknown) {
      console.error('Failed to save compiled template:', error);
      const errorMsg = resolveErrorMessage(error);
      void message.error(`保存失败: ${errorMsg}`);
    }
  };

  const handleConfirmSaveTemplate = async () => {
    if (templateSteps.length === 0) {
      void message.warning('模版为空，请先添加命令');
      return;
    }

    const name = templateName || `模版 ${new Date().toLocaleString()}`;
    const extractedParams = extractParameters(templateSteps);

    const finalParams: Record<
      string,
      { type: string; description: string; default?: string | number }
    > = {};
    Object.entries(extractedParams).forEach(([originalName, schema]) => {
      if (schema.replaceable) {
        if (paramEnabled[originalName] !== false) {
          const customName = paramNames[originalName] || originalName;
          finalParams[customName] = schema;
        }
      }
    });

    const coreBackendSteps = buildBackendCoreSteps(
      templateSteps,
      extractedParams,
      (originalName, schema) => {
        if (!schema.replaceable || paramEnabled[originalName] === false) {
          return undefined;
        }
        return paramNames[originalName] || originalName;
      }
    );

    const backendSteps = appendTemplateScreenshotSteps(coreBackendSteps, autoAppendScreenshots, waitDuration);

    const paramsSchema = {
      type: 'object',
      properties: finalParams,
      required: Object.keys(finalParams),
    };

    try {
      const createdTemplate = await templateApi.create({
        name,
        description: `由智能录制生成的模版，包含 ${templateSteps.length} 个步骤（${getScreenshotModeLabel()}），${Object.keys(finalParams).length} 个可替换参数`,
        params_schema: paramsSchema,
        steps: backendSteps,
        created_by: user?.id || 'ai_recorder',
      });

      void message.success(`模版已保存: ${createdTemplate.name}`);
      setShowTemplateModal(false);
      handleClearTemplate();

      setSavedTemplateId(createdTemplate.id);
      void message.info('模版已保存，可以点击"测试模版"按钮进行测试', 5);
    } catch (error: unknown) {
      console.error('Failed to save template:', error);
      void message.error(`保存模版失败: ${resolveErrorMessage(error)}`);
    }
  };

  const handleTestSavedTemplate = async () => {
    if (!savedTemplateId) {
      void message.warning('请先保存模版');
      return;
    }
    if (!user?.id) {
      void message.warning('用户未登录，请先登录');
      return;
    }

    setTestLoading(true);
    try {
      const result = await sessionApi.create({
        user_id: user.id,
        template_id: savedTemplateId,
        params: {},
      });

      await sessionApi.start(result.session.id, {
        template_id: savedTemplateId,
        params: {},
      });

      void message.success('测试已启动，跳转到会话详情页');
      navigate(`/sessions/${result.session.id}`);
    } catch (error: unknown) {
      const errorMsg = resolveErrorMessage(error, '测试失败');
      if (errorMsg.includes('No available workers')) {
        void message.warning('Worker 不足，正在重置...');
        try {
          await workerApi.reset();
          const result = await sessionApi.create({
            user_id: user.id,
            template_id: savedTemplateId,
            params: {},
          });
          await sessionApi.start(result.session.id, {
            template_id: savedTemplateId,
            params: {},
          });
          void message.success('测试已启动，跳转到会话详情页');
          navigate(`/sessions/${result.session.id}`);
        } catch (retryError: unknown) {
          void message.error(resolveErrorMessage(retryError, '测试失败'));
        }
      } else {
        void message.error(errorMsg);
      }
    } finally {
      setTestLoading(false);
    }
  };

  const handleResetWorkers = async () => {
    setResetLoading(true);
    try {
      const result = await workerApi.reset();
      void message.success(result.message || 'Worker Pool 已重置');
    } catch (_error: unknown) {
      void message.error('重置 Worker Pool 失败');
    } finally {
      setResetLoading(false);
    }
  };

  const handleCopyScript = () => {
    void navigator.clipboard.writeText(compiledScript);
    void message.success('脚本已复制到剪贴板');
  };

  const handleDownloadScript = () => {
    const blob = new Blob([compiledScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browser-script-${Date.now()}.js`;
    a.click();
    URL.revokeObjectURL(url);
    void message.success('脚本已下载');
  };

  const handleAutoExtractTemplate = () => {
    const extractedSteps: TemplateStep[] = [];

    history.forEach((entry) => {
      if (entry.result?.template_info) {
        const info = entry.result.template_info;
        const deterministicTools = [
          'navigate',
          'fill',
          'click',
          'screenshot',
          'scroll',
          'wait',
          'press_key',
          'hover',
          'type_text',
          'search',
          'smart_search',
        ];
        if (deterministicTools.includes(info.tool)) {
          const replaceableParams: Record<string, boolean> = {};

          if (entry.replaceable && entry.rawParam) {
            switch (info.tool) {
              case 'navigate':
                replaceableParams['url'] = true;
                break;
              case 'search':
              case 'smart_search':
                replaceableParams['query'] = true;
                break;
              case 'fill':
                replaceableParams['value'] = true;
                break;
              case 'click':
                if (info.params.text) replaceableParams['text'] = true;
                break;
              case 'type_text':
                replaceableParams['text'] = true;
                break;
            }
          }

          extractedSteps.push({
            id: Date.now().toString() + Math.random(),
            tool: info.tool as TemplateStepAction,
            params: info.params,
            description: info.description || `${info.tool} ${JSON.stringify(info.params)}`,
            timestamp: entry.timestamp,
            replaceableParams,
            execution_policy: 'auto_execute',
          });
        }
      }
    });

    if (extractedSteps.length === 0) {
      void message.warning('历史记录中没有找到确定性命令');
      return;
    }

    setTemplateSteps(extractedSteps);
    void message.success(`已从历史记录中提取 ${extractedSteps.length} 个确定性命令`);
  };

  const handleExportTemplateFromRecorder = async () => {
    if (!isReactChatMode) {
      void message.warning('请先切到对话调试模式后再导出');
      return;
    }

    const sessionId = recorderDebugSessionId;
    const runtimeSessionId = recorderDebugRuntimeSessionId;
    if (!sessionId || !runtimeSessionId) {
      void message.warning('当前还没有可导出的录制会话');
      return;
    }

    setExportTemplateLoading(true);
    try {
      const exported = await apiClient.post<RecorderDebugExportResponse>(
        '/ai/recorder-debug/export',
        {
          sessionId,
          runtimeSessionId,
          backend: executionBackend,
          userGoal:
            history
              .filter((entry) => entry.type === 'user')
              .map((entry) => entry.content)
              .slice(-3)
              .join(' / ') || '录制浏览器任务',
        }
      );

      const artifacts = exported.exportArtifacts;
      const createdTemplate = await templateApi.create({
        name: buildTemplateNameFromArtifacts(artifacts),
        description: buildTemplateDescriptionFromArtifacts(artifacts),
        params_schema: buildTemplateParamsSchemaFromArtifacts(artifacts),
        steps: buildTemplateStepsFromArtifacts(artifacts),
        guards: [
          {
            type: 'recorder_export',
            backend: executionBackend,
            runtimeSessionId: exported.runtimeSessionId,
          },
        ],
        config: {
          exportSource: 'recorder-debug',
          currentPageUrl: exported.currentPageUrl,
          backend: executionBackend,
          script: artifacts.script,
          guidance: artifacts.guidance,
          loopDraft: artifacts.loopDraft || null,
          loopPlanPreview:
            artifacts.loopPlanPreview ||
            artifacts.skillDraft?.publishPayload?.loopPlanPreview ||
            [],
          outputs: artifacts.skillDraft?.outputs || [],
          usageNotes: artifacts.skillDraft?.usageNotes || [],
          usageMarkdown: artifacts.skillDraft?.usageMarkdown,
          executionPlan: artifacts.skillDraft?.executionPlan,
          skillDraft: artifacts.skillDraft || null,
        },
        created_by: user?.id || 'ai_recorder',
      });

      setHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: 'system',
          content: `导出模板成功: ${createdTemplate.name}`,
          timestamp: new Date(),
          backend: executionBackend,
        },
      ]);
      void message.success('已导出到模板列表');
      navigate(`/templates/${createdTemplate.id}`);
    } catch (error: unknown) {
      void message.error(resolveErrorMessage(error, '导出失败'));
    } finally {
      setExportTemplateLoading(false);
    }
  };

  return {
    templateSteps,
    setTemplateSteps,
    savedTemplateId,
    setSavedTemplateId,
    showTemplateModal,
    setShowTemplateModal,
    showScriptModal,
    setShowScriptModal,
    templateName,
    setTemplateName,
    compiledScript,
    setCompiledScript,
    paramNames,
    setParamNames,
    paramEnabled,
    setParamEnabled,
    isTemplatePanelExpanded,
    setIsTemplatePanelExpanded,
    testLoading,
    resetLoading,
    exportTemplateLoading,
    showBranchGateModal,
    setShowBranchGateModal,
    branchInsertAfterStepId,
    setBranchInsertAfterStepId,
    openBranchGateModal,
    handleConfirmBranchGate,
    handleRemoveTemplateStep,
    handleUpdateTemplateStepPolicy,
    handleClearTemplate,
    handleCompileTemplate,
    handleSaveCompiledTemplate,
    handleConfirmSaveTemplate,
    handleTestSavedTemplate,
    handleResetWorkers,
    handleCopyScript,
    handleDownloadScript,
    handleAutoExtractTemplate,
    handleExportTemplateFromRecorder,
  };
};
