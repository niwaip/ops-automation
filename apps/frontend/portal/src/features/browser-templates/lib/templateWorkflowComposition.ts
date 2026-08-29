import type {
  TemplateCaptureProfile,
  TemplatePostProcessingRunWhen,
  TemplateStep,
  TemplateWorkflowComposition,
} from '@/api/template';

export type TemplateProcessingStepType = 'llm_operation' | 'workflow_skill';
export type TemplateLlmProcessingMode = 'summary' | 'custom';

export interface TemplateProcessingStepEditor {
  id: string;
  type: TemplateProcessingStepType;
  sourceStepId: string;
  sourceStepIds?: string[];
  processingMode: TemplateLlmProcessingMode;
  customPrompt: string;
  targetId: string;
  targetVersion: string;
  runWhen: TemplatePostProcessingRunWhen;
}

export interface TemplateWorkflowCompositionEditorState {
  processingSteps: TemplateProcessingStepEditor[];
  finalNodeId?: string;
}

export const DEFAULT_TEMPLATE_WORKFLOW_COMPOSITION_EDITOR: TemplateWorkflowCompositionEditorState =
  {
    processingSteps: [],
  };

export type TemplateStepCaptureOption = 'screenshot' | 'html' | 'mainContent' | 'snapshot';

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const readString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_]/g, '_');

export const buildStepContentOutputName = (stepId: string): string =>
  `${safeId(stepId || 'step')}_clean_content`;

export const buildStepCaptureProfile = (
  options: TemplateStepCaptureOption[],
  profile: TemplateCaptureProfile['profile'] = 'article'
): TemplateCaptureProfile | undefined => {
  if (options.length === 0) return undefined;
  const mainContent = options.includes('mainContent');
  const resolvedProfile = mainContent && profile === 'raw' ? 'article' : profile;
  return {
    schemaVersion: 'capture-profile/v1',
    profile: mainContent ? resolvedProfile : 'raw',
    capture: {
      screenshot: options.includes('screenshot'),
      html: options.includes('html') || mainContent,
      snapshot: options.includes('snapshot'),
      mainContent,
    },
    limits: {
      htmlBytes: 1_000_000,
      contentChars: resolvedProfile === 'audit' ? 60_000 : 30_000,
      tableCells: resolvedProfile === 'audit' ? 2_000 : 500,
    },
  };
};

export const DEFAULT_STEP_CAPTURE_OPTIONS: TemplateStepCaptureOption[] = ['screenshot', 'html'];

export const getStepCaptureOptions = (step: TemplateStep): TemplateStepCaptureOption[] => {
  const capture = step.capture_profile?.capture;
  if (!capture) return [...DEFAULT_STEP_CAPTURE_OPTIONS];
  return (['screenshot', 'html', 'mainContent', 'snapshot'] as const).filter(
    (option) => capture[option]
  );
};

export const updateStepCaptureOptions = (
  step: TemplateStep,
  options: TemplateStepCaptureOption[]
): TemplateStep => {
  const captureProfile = buildStepCaptureProfile(
    options,
    step.capture_profile?.profile || 'article'
  );
  const next = { ...step };
  delete next.capture_profile;
  if (captureProfile) next.capture_profile = captureProfile;
  return next;
};

export const readTemplateWorkflowComposition = (
  config: Record<string, unknown>
): TemplateWorkflowComposition | undefined => {
  const direct = asRecord(config.workflowComposition);
  if (direct) return direct as unknown as TemplateWorkflowComposition;

  const skillDraft = asRecord(config.skillDraft);
  const publishPayload = asRecord(skillDraft?.publishPayload);
  const apiEndpoints = asRecord(publishPayload?.apiEndpoints);
  const runtimeMetadata = asRecord(apiEndpoints?.runtimeMetadata);
  return asRecord(runtimeMetadata?.composition) as
    | (TemplateWorkflowComposition & Record<string, unknown>)
    | undefined;
};

/** Migrates the former page-level capture declaration onto its browser step. */
export const hydrateTemplateStepCaptureProfiles = (
  steps: TemplateStep[],
  config: Record<string, unknown>
): TemplateStep[] => {
  const composition = readTemplateWorkflowComposition(config);
  return steps.map((step, index) => {
    if (step.capture_profile) return { ...step };
    const page =
      composition?.pageAliases?.find((candidate) => candidate.sourceStepId === step.step_id) ||
      (composition?.pageAliases?.length === 1 && index === steps.length - 1
        ? composition.pageAliases[0]
        : undefined);
    return {
      ...step,
      capture_profile:
        page?.captureProfile || buildStepCaptureProfile(DEFAULT_STEP_CAPTURE_OPTIONS),
    };
  });
};

export const toTemplateWorkflowCompositionEditorState = (
  config: Record<string, unknown>
): TemplateWorkflowCompositionEditorState => {
  const composition = readTemplateWorkflowComposition(config);
  if (!composition) return { ...DEFAULT_TEMPLATE_WORKFLOW_COMPOSITION_EDITOR };

  const outputByName = new Map(
    (composition.outputDeclarations || []).map((output) => [output.name, output])
  );
  return {
    finalNodeId: composition.finalNodeId,
    processingSteps: (composition.postProcessingSteps || []).map((post, index) => {
      const bindings = post.type === 'llm_operation' ? asRecord(post.inputBindings) : undefined;
      const contentBinding = asRecord(bindings?.text) || asRecord(bindings?.content);
      const output = outputByName.get(readString(contentBinding?.path));
      const instruction = asRecord(bindings?.instruction);
      const customPrompt =
        readString(post.type === 'llm_operation' ? post.promptTemplate : '') ||
        readString(instruction?.value);
      const processingMode =
        post.type === 'llm_operation'
          ? post.processingMode ||
            (post.operationId === 'transform_text' || customPrompt ? 'custom' : 'summary')
          : 'summary';

      const rawSourceStepIds = Array.isArray((post as Record<string, unknown>).sourceStepIds)
        ? ((post as Record<string, unknown>).sourceStepIds as string[]).filter(Boolean)
        : [];
      const fallbackSourceStepId = readString(post.sourceStepId || output?.sourceStepId);
      const sourceStepIds = rawSourceStepIds.length
        ? rawSourceStepIds
        : fallbackSourceStepId
          ? [fallbackSourceStepId]
          : [];

      return {
        id: readString(post.id, `post_process_${index + 1}`),
        type: post.type,
        sourceStepId: sourceStepIds[0] || fallbackSourceStepId,
        sourceStepIds,
        processingMode,
        customPrompt,
        targetId:
          post.type === 'llm_operation'
            ? readString(
                post.operationId,
                processingMode === 'custom' ? 'transform_text' : 'summarize_text'
              )
            : readString(post.skillId),
        targetVersion:
          post.type === 'llm_operation'
            ? readString(post.operationVersion, '1')
            : readString(post.releaseId),
        runWhen: post.runWhen || 'browser_succeeded',
      };
    }),
  };
};

export const buildTemplateWorkflowComposition = (
  steps: TemplateStep[],
  state: TemplateWorkflowCompositionEditorState
): TemplateWorkflowComposition | undefined => {
  const capturedSteps = steps.filter((step) => step.capture_profile);
  if (capturedSteps.length === 0 && state.processingSteps.length === 0) return undefined;

  const contentSteps = capturedSteps.filter(
    (step) => step.capture_profile?.capture.mainContent === true
  );
  const pageAliases = capturedSteps.map((step) => ({
    alias: `page_${safeId(step.step_id)}`,
    sourceStepId: step.step_id,
    match: {},
    captureProfile: step.capture_profile!,
  }));
  const outputDeclarations = contentSteps.map((step) => ({
    name: buildStepContentOutputName(step.step_id),
    sourcePageAlias: `page_${safeId(step.step_id)}`,
    sourceStepId: step.step_id,
    kind: 'content' as const,
    required: true,
  }));
  const postProcessingSteps: TemplateWorkflowComposition['postProcessingSteps'] =
    state.processingSteps.map((post) => {
      const sourceStepIds = post.sourceStepIds?.length
        ? post.sourceStepIds
        : post.sourceStepId
          ? [post.sourceStepId]
          : [];
      const outputNames = sourceStepIds.map((id) => buildStepContentOutputName(id));
      const outputName = outputNames[0] || buildStepContentOutputName(post.sourceStepId);

      if (post.type === 'workflow_skill') {
        return {
          id: post.id,
          type: 'workflow_skill',
          skillId: post.targetId.trim(),
          releaseId: post.targetVersion.trim(),
          inputProjection: 'ops-report-projection/v1',
          runWhen: post.runWhen,
          sourceStepId: sourceStepIds[0] || post.sourceStepId,
          ...(sourceStepIds.length > 1 ? { sourceStepIds } : {}),
        };
      }
      const isCustom = post.processingMode === 'custom';
      const inputBindings: Record<string, unknown> = isCustom
        ? {
            content: {
              source: 'node_output',
              path: outputNames.length > 1 ? outputNames.join(',') : outputName,
              ...(outputNames.length > 1 ? { paths: outputNames } : {}),
              transform: 'resolve_text_content',
            },
            instruction: { source: 'literal', value: post.customPrompt.trim() },
          }
        : {
            text: {
              source: 'node_output',
              path: outputNames.length > 1 ? outputNames.join(',') : outputName,
              ...(outputNames.length > 1 ? { paths: outputNames } : {}),
              transform: 'resolve_text_content',
            },
          };
      return {
        id: post.id,
        type: 'llm_operation',
        operationId: isCustom ? 'transform_text' : 'summarize_text',
        operationVersion: post.targetVersion.trim() || '1',
        inputBindings,
        runWhen: post.runWhen,
        sourceStepId: sourceStepIds[0] || post.sourceStepId,
        sourceStepIds,
        processingMode: post.processingMode,
        ...(isCustom ? { promptTemplate: post.customPrompt.trim() } : {}),
      };
    });

  return {
    schemaVersion: 'browser-template-workflow-composition/v1',
    pageAliases,
    outputDeclarations,
    postProcessingSteps,
    finalNodeId:
      state.finalNodeId && postProcessingSteps.some((post) => post.id === state.finalNodeId)
        ? state.finalNodeId
        : postProcessingSteps[postProcessingSteps.length - 1]?.id,
  };
};

export const applyTemplateWorkflowComposition = (
  config: Record<string, unknown>,
  composition: TemplateWorkflowComposition | undefined
): Record<string, unknown> => {
  const nextConfig = { ...config };
  delete nextConfig.composition;
  delete nextConfig.workflowComposition;
  if (composition) nextConfig.workflowComposition = composition;

  const skillDraft = asRecord(config.skillDraft);
  const publishPayload = asRecord(skillDraft?.publishPayload);
  if (!skillDraft || !publishPayload) return nextConfig;
  const apiEndpoints = asRecord(publishPayload.apiEndpoints) || {};
  const runtimeMetadata = { ...(asRecord(apiEndpoints.runtimeMetadata) || {}) };
  delete runtimeMetadata.composition;
  delete runtimeMetadata.compositePlan;
  delete runtimeMetadata.compositionSource;
  if (composition) {
    runtimeMetadata.composition = composition;
    runtimeMetadata.compositionSource = 'template_step_editor';
  }
  nextConfig.skillDraft = {
    ...skillDraft,
    publishPayload: {
      ...publishPayload,
      apiEndpoints: { ...apiEndpoints, runtimeMetadata },
    },
  };
  return nextConfig;
};

export const validateTemplateWorkflowCompositionEditor = (
  steps: TemplateStep[],
  state: TemplateWorkflowCompositionEditorState
): string[] => {
  const errors: string[] = [];
  const ids = new Set<string>();
  const stepsById = new Map(steps.map((step) => [step.step_id, step]));
  state.processingSteps.forEach((post, index) => {
    const label = `处理步骤 ${index + 1}`;
    if (!post.id.trim()) errors.push(`${label}的步骤 ID 不能为空`);
    if (ids.has(post.id.trim())) errors.push(`处理步骤 ID “${post.id.trim()}”重复`);
    ids.add(post.id.trim());

    const sourceStepIds = post.sourceStepIds?.length
      ? post.sourceStepIds
      : post.sourceStepId
        ? [post.sourceStepId]
        : [];
    if (sourceStepIds.length === 0) {
      errors.push(`${label}必须至少选择一个已有浏览器步骤`);
    } else {
      sourceStepIds.forEach((stepId) => {
        const source = stepsById.get(stepId);
        if (!source) {
          errors.push(`${label}引用的步骤“${stepId}”不存在`);
        } else if (!source.capture_profile?.capture.mainContent) {
          errors.push(`${label}绑定的“${source.step_id}”必须勾选“清理正文”`);
        }
      });
    }

    if (!post.targetVersion.trim()) errors.push(`${label}的版本不能为空`);
    if (
      post.type === 'llm_operation' &&
      post.processingMode === 'custom' &&
      !post.customPrompt.trim()
    ) {
      errors.push(`${label}的自定义提示词不能为空`);
    }
    if (post.type === 'workflow_skill' && !post.targetId.trim()) {
      errors.push(`${label}的工作流 ID 不能为空`);
    }
  });
  return errors;
};
