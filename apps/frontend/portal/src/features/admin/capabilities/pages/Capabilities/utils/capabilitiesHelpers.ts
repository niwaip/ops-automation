import type { CapabilityRelease, CapabilityReleaseDetail } from '@/api/capabilities';
import type { TemporalWorkflowDTO, WorkflowInputParamDefinition } from '@/api/temporal';
import type { ParamSchemaFieldDraft } from '@/components/capability-release/ParamSchemaEditor';
import { templateApi } from '@/api/template';

export type SnapshotDiffStatus = 'same' | 'changed' | 'added' | 'removed';

export interface SnapshotDiffRow {
  path: string;
  leftValue: string;
  rightValue: string;
  status: SnapshotDiffStatus;
}

export interface ApiEndpointDraft {
  id: string;
  key: string;
  method: string;
  url: string;
  description: string;
  extraJson: string;
}

export type DeploymentEnvironment = 'staging' | 'prod';

export const DEPLOY_ENV_OPTIONS: { label: string; value: DeploymentEnvironment }[] = [
  { label: 'staging（预发布）', value: 'staging' },
  { label: 'prod（生产）', value: 'prod' },
];

export const MISSING_VALUE = '__capability_snapshot_missing__';

export const SOURCE_TYPE_OPTIONS = [
  { label: '模版型', value: 'execution_flow_template' },
  { label: '编排型', value: 'temporal_workflow' },
  { label: '浏览器录制', value: 'browser_recording' },
] as const;

export interface CapabilitySourceOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface TemporalDeployReadiness {
  hasExecutableCode: boolean;
  message?: string;
  source?: 'build' | 'snapshot' | 'workflow' | 'missing';
}

export const statusColor = (status: string) => {
  switch (status) {
    case 'draft_ready':
    case 'approved':
    case 'published':
    case 'deployed':
      return 'green';
    case 'pending_approval':
      return 'gold';
    case 'build_failed':
    case 'validation_failed':
    case 'deploy_failed':
      return 'red';
    case 'building':
    case 'validating':
    case 'deploying':
      return 'processing';
    default:
      return 'default';
  }
};

export const getSourceTypeLabel = (value: string) => {
  if (value === 'temporal_workflow') return '编排型';
  if (value === 'browser_recording') return '浏览器录制';
  return '模版型';
};

export const getValidationTypeLabel = (value: string) => {
  if (value === 'sandbox') return '真实验证';
  if (value === 'post_deploy_smoke') return '部署后冒烟';
  if (value === 'static') return '静态校验';
  return value;
};

export const getNextStepHint = (release: CapabilityRelease): { label: string; color: string } => {
  if (
    release.deploymentStatus === 'succeeded' ||
    release.deploymentStatus === 'deployed' ||
    release.status === 'deployed'
  )
    return { label: '观察运行/回滚', color: 'green' };
  if (release.status === 'deploying' || release.deploymentStatus === 'deploying')
    return { label: '正在部署...', color: 'processing' };
  if (release.status === 'build_failed') return { label: '重新绑定工件', color: 'red' };
  if (release.status === 'validation_failed') return { label: '重新校验', color: 'volcano' };
  if (release.status === 'deploy_failed') return { label: '重新部署', color: 'magenta' };
  if (release.status === 'rolled_back') return { label: '确认回滚结果', color: 'orange' };

  if (release.sourceType === 'temporal_workflow' && release.latestSuccessfulValidationId) {
    return { label: '部署 / 发布 Skill', color: 'blue' };
  }
  if (release.sourceType === 'browser_recording' && release.latestSuccessfulValidationId) {
    return { label: '发布 Browser Skill', color: 'cyan' };
  }
  if (release.publishedSkillId) {
    return {
      label: release.sourceType === 'browser_recording' ? '部署浏览器能力' : '代码部署',
      color: 'blue',
    };
  }
  if (release.approvalStatus === 'approved') return { label: '发布 Skill', color: 'cyan' };
  if (release.currentSkillDraftId) return { label: '发布 Skill', color: 'gold' };
  if (release.latestSuccessfulValidationId) {
    return {
      label: release.sourceType === 'browser_recording' ? '发布 Browser Skill' : '发布 Skill',
      color: 'lime',
    };
  }
  if (release.currentBuildId || release.latestSuccessfulBuildId)
    return { label: 'Sandbox 校验', color: 'purple' };
  if (release.sourceType === 'browser_recording')
    return { label: '准备浏览器回放校验', color: 'default' };

  return { label: '绑定 Workflow 工件', color: 'default' };
};

export const canEnterReleaseCenter = (release: CapabilityRelease): boolean =>
  Boolean(release.publishedSkillId) ||
  ['published', 'deployed', 'rolled_back'].includes(release.status) ||
  ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus);

export const flattenSnapshotPayload = (
  value: unknown,
  prefix = '',
  output: Record<string, string> = {}
): Record<string, string> => {
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) {
      output[prefix] = '[]';
      return output;
    }

    value.forEach((item, index) => {
      const nextPath = `${prefix}[${index}]`;
      flattenSnapshotPayload(item, nextPath, output);
    });
    return output;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );

    if (entries.length === 0 && prefix) {
      output[prefix] = '{}';
      return output;
    }

    entries.forEach(([key, nestedValue]) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      flattenSnapshotPayload(nestedValue, nextPath, output);
    });
    return output;
  }

  output[prefix || '$'] =
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return output;
};

export const buildSnapshotDiffRows = (
  leftPayload: Record<string, unknown> = {},
  rightPayload: Record<string, unknown> = {}
): SnapshotDiffRow[] => {
  const leftMap = flattenSnapshotPayload(leftPayload);
  const rightMap = flattenSnapshotPayload(rightPayload);
  const allPaths = Array.from(new Set([...Object.keys(leftMap), ...Object.keys(rightMap)])).sort(
    (a, b) => a.localeCompare(b)
  );

  return allPaths.map((path) => {
    const leftExists = Object.prototype.hasOwnProperty.call(leftMap, path);
    const rightExists = Object.prototype.hasOwnProperty.call(rightMap, path);
    const leftValue = leftExists ? leftMap[path] : MISSING_VALUE;
    const rightValue = rightExists ? rightMap[path] : MISSING_VALUE;

    let status: SnapshotDiffStatus = 'same';
    if (!leftExists && rightExists) {
      status = 'added';
    } else if (leftExists && !rightExists) {
      status = 'removed';
    } else if (leftValue !== rightValue) {
      status = 'changed';
    }

    return {
      path,
      leftValue: leftExists ? leftMap[path] : '<<missing>>',
      rightValue: rightExists ? rightMap[path] : '<<missing>>',
      status,
    };
  });
};

export const hasNonEmptyCode = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const getTemporalDeployReadiness = (
  detail: CapabilityReleaseDetail | undefined,
  sourceWorkflow?: TemporalWorkflowDTO | null
): TemporalDeployReadiness => {
  if (!detail || detail.release.sourceType !== 'temporal_workflow') {
    return { hasExecutableCode: true };
  }

  const successfulBuild = detail.builds?.find(
    (build) => build.status === 'succeeded' && hasNonEmptyCode(build.generatedCode)
  );
  if (successfulBuild) {
    return { hasExecutableCode: true, source: 'build' };
  }

  const snapshotCode = detail.currentSourceSnapshot?.sourcePayload?.generatedCode;
  if (hasNonEmptyCode(snapshotCode)) {
    return { hasExecutableCode: true, source: 'snapshot' };
  }

  if (hasNonEmptyCode(sourceWorkflow?.generatedCode)) {
    if (sourceWorkflow.validationStatus && sourceWorkflow.validationStatus !== 'validated') {
      return {
        hasExecutableCode: false,
        source: 'workflow',
        message:
          '关联的 Workflow 已有代码，但当前工件尚未完成端到端验证。请先在 Workflow 页面执行“生成并保存代码”和“端到端验证”，再继续部署。',
      };
    }
    return { hasExecutableCode: true, source: 'workflow' };
  }

  return {
    hasExecutableCode: false,
    source: 'missing',
    message:
      '当前 Release 还没有可部署的 Workflow artifact。请先在 Workflow 页面完成“生成并保存代码”和“端到端验证”，再进行部署。',
  };
};

export const parseJsonDraft = <T,>(
  raw: string,
  fallbackLabel: string
): { valid: true; value: T } | { valid: false; error: string } => {
  try {
    return { valid: true, value: JSON.parse(raw) as T };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? `${fallbackLabel}: ${error.message}`
          : `${fallbackLabel}: JSON 解析失败`,
    };
  }
};

export const createParamFieldId = () => `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const createApiEndpointId = () =>
  `endpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const parseParamSchemaToDraft = (
  schema: Record<string, unknown> | undefined
): { fields: ParamSchemaFieldDraft[]; extras: Record<string, unknown> } => {
  const normalized = schema && typeof schema === 'object' ? schema : {};
  const properties =
    normalized.properties && typeof normalized.properties === 'object'
      ? (normalized.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(normalized.required)
    ? normalized.required.filter((item): item is string => typeof item === 'string')
    : [];
  const extras = Object.fromEntries(
    Object.entries(normalized).filter(([key]) => key !== 'properties' && key !== 'required')
  );

  const fields = Object.entries(properties).map(([name, config]) => ({
    id: createParamFieldId(),
    name,
    type: typeof config?.type === 'string' ? config.type : 'string',
    description: typeof config?.description === 'string' ? config.description : '',
    required: required.includes(name) || Boolean(config?.required),
    defaultValue:
      config?.default === undefined
        ? ''
        : typeof config.default === 'string'
          ? config.default
          : JSON.stringify(config.default),
    extractionPrompt: typeof config?.extractionPrompt === 'string' ? config.extractionPrompt : '',
    enumValues: Array.isArray(config?.enum)
      ? config.enum.filter((item): item is string => typeof item === 'string')
      : [],
  }));

  return { fields, extras };
};

export const normalizeParamDefaultValue = (type: string, raw: string): unknown => {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }

  if (type === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  if (type === 'boolean') {
    return value === 'true';
  }

  if (type === 'array' || type === 'object') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
};

export const buildParamSchemaFromDraft = (
  fields: ParamSchemaFieldDraft[],
  extras: Record<string, unknown>
): Record<string, unknown> => {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  fields.forEach((field) => {
    const name = field.name.trim();
    if (!name) {
      return;
    }

    const property: Record<string, unknown> = {
      type: field.type || 'string',
      description: field.description.trim(),
      required: field.required,
    };

    const normalizedDefault = normalizeParamDefaultValue(field.type, field.defaultValue);
    if (normalizedDefault !== undefined) {
      property.default = normalizedDefault;
    }
    if (field.extractionPrompt.trim()) {
      property.extractionPrompt = field.extractionPrompt.trim();
    }
    if (field.enumValues.length > 0) {
      property.enum = field.enumValues.map((item) => item.trim()).filter(Boolean);
    }

    properties[name] = property;
    if (field.required) {
      required.push(name);
    }
  });

  return {
    ...extras,
    type: extras.type || 'object',
    properties,
    required,
  };
};

export const parseApiEndpointsToDraft = (
  value: Record<string, unknown> | null | undefined
): ApiEndpointDraft[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).map(([key, rawConfig]) => {
    const config =
      rawConfig && typeof rawConfig === 'object' ? (rawConfig as Record<string, unknown>) : {};
    const extras = Object.fromEntries(
      Object.entries(config).filter(
        ([entryKey]) => !['url', 'method', 'description'].includes(entryKey)
      )
    );

    return {
      id: createApiEndpointId(),
      key,
      method: typeof config.method === 'string' ? config.method : 'POST',
      url: typeof config.url === 'string' ? config.url : '',
      description: typeof config.description === 'string' ? config.description : '',
      extraJson: Object.keys(extras).length > 0 ? JSON.stringify(extras, null, 2) : '',
    };
  });
};

export const normalizeBrowserWorkflowAction = (action: string): string => {
  const normalized = action.trim().toLowerCase();
  switch (normalized) {
    case 'goto':
      return 'navigate';
    case 'press':
      return 'press_key';
    case 'type':
      return 'type_text';
    default:
      return normalized;
  }
};

export const looksLikeTemplatePlaceholder = (value: string): boolean => {
  const target = value.trim();
  return /^\$\{[^{}]+\}$/.test(target) || /^\{[^{}]+\}$/.test(target);
};

export const looksLikeBrowserSelector = (value: string): boolean => {
  const target = value.trim();
  if (!target) {
    return false;
  }
  if (/^e\d+$/i.test(target)) {
    return true;
  }
  if (/^(role|text|xpath)=/i.test(target)) {
    return true;
  }
  if (/^[#.[]/.test(target) || target.startsWith('//') || target.startsWith('..')) {
    return true;
  }
  if (/(^|[a-z-])\[name=.+\]$/i.test(target)) {
    return true;
  }
  return false;
};

export const normalizeBrowserWorkflowLocator = (locator: unknown): Record<string, unknown> | undefined => {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    return undefined;
  }

  const raw = locator as Record<string, unknown>;
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!type || !value) {
    return undefined;
  }

  return {
    type,
    value,
  };
};

export const browserPlaceholder = (name: string) => `\${${name}}`;

export const inferBrowserWorkflowParamDefinition = (
  stepName: string,
  config: Record<string, unknown>
): { name: string; definition: WorkflowInputParamDefinition } | undefined => {
  const action = normalizeBrowserWorkflowAction(
    typeof config.action === 'string' ? config.action : ''
  );
  const locator = normalizeBrowserWorkflowLocator(config.locator);
  const url = typeof config.url === 'string' ? config.url.trim() : '';
  const value =
    config.value === undefined || config.value === null ? '' : String(config.value).trim();
  const hint = [
    stepName,
    typeof config.selector === 'string' ? config.selector : '',
    typeof config.target === 'string' ? config.target : '',
    typeof locator?.value === 'string' ? locator.value : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (action === 'navigate' && url) {
    return {
      name: 'startUrl',
      definition: {
        description: '起始页面地址',
        required: false,
        defaultValue: url,
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: url,
      },
    };
  }

  if (!['fill', 'type_text'].includes(action)) {
    return undefined;
  }

  if (/(用户名|账号|账户|user\s*name|username|account|email|邮箱|手机号|mobile)/i.test(hint)) {
    return {
      name: 'username',
      definition: {
        description: '登录用户名',
        required: true,
        defaultValue: value,
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: value || 'test',
      },
    };
  }

  if (/(密码|password|passwd|passcode|pin|secret)/i.test(hint)) {
    return {
      name: 'loginCredential',
      definition: {
        description: '登录密码',
        required: true,
        defaultValue: value,
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: value || 'test123',
      },
    };
  }

  return undefined;
};

export const normalizeBrowserWorkflowStepConfig = (
  config: Record<string, unknown>
): Record<string, unknown> => {
  const action = normalizeBrowserWorkflowAction(
    typeof config.action === 'string' ? config.action : ''
  );
  const url = typeof config.url === 'string' ? config.url.trim() : '';
  const selector = typeof config.selector === 'string' ? config.selector.trim() : '';
  const rawTarget = typeof config.target === 'string' ? config.target.trim() : '';
  const locator = normalizeBrowserWorkflowLocator(config.locator);
  const valueCandidate = [config.value, config.text, config.query].find(
    (item) => item !== undefined && item !== null && String(item).trim() !== ''
  );
  const keyCandidate = [config.key, config.value].find(
    (item) => item !== undefined && item !== null && String(item).trim() !== ''
  );
  const normalized: Record<string, unknown> = {
    ...(action ? { action } : {}),
  };

  if (action === 'navigate' && url) {
    normalized.url = url;
  }
  if (selector) {
    normalized.selector = selector;
  }
  if (locator) {
    normalized.locator = locator;
  }

  const targetLooksSuspicious =
    rawTarget &&
    !looksLikeBrowserSelector(rawTarget) &&
    (looksLikeTemplatePlaceholder(rawTarget) ||
      (valueCandidate !== undefined && String(valueCandidate).trim() === rawTarget));
  const shouldKeepTarget =
    rawTarget &&
    (action === 'navigate' ||
      /^e\d+$/i.test(rawTarget) ||
      (!targetLooksSuspicious && (!selector || rawTarget !== selector)));
  if (shouldKeepTarget) {
    normalized.target = rawTarget;
  }

  if (valueCandidate !== undefined) {
    normalized.value = valueCandidate;
  }
  if (keyCandidate !== undefined && action === 'press_key') {
    normalized.key = keyCandidate;
  }
  if (config.timeoutMs !== undefined) {
    normalized.timeoutMs = config.timeoutMs;
  }
  if (config.duration !== undefined) {
    normalized.duration = config.duration;
  }

  return normalized;
};

export const parameterizeBrowserWorkflowStepConfig = (
  stepName: string,
  config: Record<string, unknown>
): {
  config: Record<string, unknown>;
  inferredParam?: { name: string; definition: WorkflowInputParamDefinition };
} => {
  const normalizedConfig = normalizeBrowserWorkflowStepConfig(config);
  const inferredParam = inferBrowserWorkflowParamDefinition(stepName, normalizedConfig);
  if (!inferredParam) {
    return { config: normalizedConfig };
  }

  const nextConfig: Record<string, unknown> = {
    ...normalizedConfig,
  };

  if (inferredParam.name === 'startUrl') {
    nextConfig.url = browserPlaceholder(inferredParam.name);
    delete nextConfig.target;
  } else if (['fill', 'type_text'].includes(String(nextConfig.action || ''))) {
    nextConfig.value = browserPlaceholder(inferredParam.name);
  }

  return {
    config: nextConfig,
    inferredParam,
  };
};

export const buildBrowserWorkflowParamsSchema = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
  inferredParams?: Record<string, WorkflowInputParamDefinition>
): Record<string, unknown> => {
  const entries = Object.entries({
    ...(inferredParams || {}),
    ...(inputParams || {}),
  });
  return {
    type: 'object',
    properties: Object.fromEntries(
      entries.map(([key, definition]) => [
        key,
        {
          type: definition?.type || 'string',
          description: definition?.description || '',
          default: definition?.defaultValue,
          required: Boolean(definition?.required),
        },
      ])
    ),
    required: entries.filter(([, definition]) => Boolean(definition?.required)).map(([key]) => key),
  };
};

export const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

export const asRecordArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];

export const hasConcreteBrowserLoopDraft = (value: unknown): value is Record<string, unknown> => {
  const loopDraft = asRecord(value);
  const eachIteration = asRecord(loopDraft?.eachIteration);
  const stepIds = Array.isArray(eachIteration?.stepIds)
    ? eachIteration.stepIds.filter(
        (stepId): stepId is string => typeof stepId === 'string' && stepId.trim().length > 0
      )
    : [];
  return stepIds.length > 0;
};

export const stripLoopDraftSuffix = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.replace(/（包含循环处理草稿）\s*$/u, '').trim();
  return normalized || undefined;
};

export const resolveBrowserWorkflowTemplateId = (workflow: TemporalWorkflowDTO): string | undefined => {
  const sourceTemplate =
    workflow.sourceTemplate ||
    workflow.sourceContext?.sourceTemplate ||
    workflow.workflowDsl?.sourceContext?.sourceTemplate;
  const templateId = sourceTemplate?.templateId;
  return typeof templateId === 'string' && templateId.trim() ? templateId.trim() : undefined;
};

export const extractBrowserTemplateRuntimeMetadata = (
  template: Awaited<ReturnType<typeof templateApi.getById>>
): Record<string, unknown> => {
  const config = asRecord(template.config) || {};
  const configExecutionPlan = asRecord(config.executionPlan) || {};
  const executionPlanTemplateSteps = asRecordArray(configExecutionPlan.templateSteps);
  const configTemplateSteps =
    asRecordArray(config.templateSteps).length > 0
      ? asRecordArray(config.templateSteps)
      : executionPlanTemplateSteps.length > 0
        ? executionPlanTemplateSteps
        : asRecordArray(template.steps);
  const rawConfigLoopDraft =
    asRecord(configExecutionPlan.loopDraft) || asRecord(config.loopDraft) || undefined;
  const configLoopDraft = hasConcreteBrowserLoopDraft(rawConfigLoopDraft)
    ? rawConfigLoopDraft
    : undefined;
  const rawConfigLoopPlanPreview =
    asRecordArray(config.loopPlanPreview).length > 0
      ? asRecordArray(config.loopPlanPreview)
      : asRecordArray(configExecutionPlan.loopPlanPreview);
  const configLoopPlanPreview = configLoopDraft ? rawConfigLoopPlanPreview : [];
  const executionPlan =
    Object.keys(configExecutionPlan).length > 0
      ? (() => {
          const nextExecutionPlan: Record<string, unknown> = {
            ...configExecutionPlan,
            ...(executionPlanTemplateSteps.length > 0
              ? {}
              : configTemplateSteps.length > 0
                ? { templateSteps: configTemplateSteps }
                : {}),
          };
          if (configLoopDraft) {
            nextExecutionPlan.loopDraft = configLoopDraft;
          } else {
            delete nextExecutionPlan.loopDraft;
          }
          if (configLoopPlanPreview.length > 0) {
            nextExecutionPlan.loopPlanPreview = configLoopPlanPreview;
          } else {
            delete nextExecutionPlan.loopPlanPreview;
          }
          return nextExecutionPlan;
        })()
      : {};

  const skillDraft = asRecord(config.skillDraft);
  const publishPayload = asRecord(skillDraft?.publishPayload);
  const apiEndpoints = asRecord(publishPayload?.apiEndpoints);
  const publishRuntimeMetadata = asRecord(apiEndpoints?.runtimeMetadata);
  const rawComposition =
    asRecord(config.workflowComposition) ||
    asRecord(publishRuntimeMetadata?.composition);
  const composition =
    rawComposition &&
    Array.isArray(rawComposition.postProcessingSteps) &&
    rawComposition.postProcessingSteps.length > 0
      ? rawComposition
      : undefined;

  return {
    ...(Object.keys(executionPlan).length > 0 ? { executionPlan } : {}),
    ...(configTemplateSteps.length > 0 ? { templateSteps: configTemplateSteps } : {}),
    ...(configLoopDraft ? { loopDraft: configLoopDraft } : {}),
    ...(configLoopPlanPreview.length > 0 ? { loopPlanPreview: configLoopPlanPreview } : {}),
    ...(composition ? { composition, compositionSource: 'template_step_editor' } : {}),
  };
};

export const extractBrowserWorkflowSteps = (
  workflow: TemporalWorkflowDTO
): Array<Record<string, unknown>> => {
  const activities = Array.isArray(workflow.activityDsl?.activities)
    ? workflow.activityDsl.activities
    : [];
  return activities.flatMap((activity) => {
    if (!activity) {
      return [];
    }
    if (activity.handler !== 'browser') {
      const config =
        activity.config && typeof activity.config === 'object'
          ? (activity.config as Record<string, unknown>)
          : {};
      const steps = Array.isArray(config.steps) ? config.steps : [];
      if (!steps.some((step) => step && typeof step === 'object')) {
        return [];
      }
    }

    const config =
      activity.config && typeof activity.config === 'object'
        ? (activity.config as Record<string, unknown>)
        : {};
    return Array.isArray(config.steps)
      ? config.steps.filter(
          (step): step is Record<string, unknown> =>
            Boolean(step) && typeof step === 'object' && !Array.isArray(step)
        )
      : [];
  });
};

export const buildBrowserRecordingSourcePayload = async (
  workflow: TemporalWorkflowDTO
): Promise<Record<string, unknown>> => {
  const workflowSteps = extractBrowserWorkflowSteps(workflow);
  const workflowDescription = stripLoopDraftSuffix(workflow.description || '') || '';
  const workflowGoal = stripLoopDraftSuffix(workflow.description || workflow.name) || workflow.name;
  const inferredParams: Record<string, WorkflowInputParamDefinition> = {};
  const normalizedSteps = workflowSteps.map((step, index) => {
    const config =
      step.config && typeof step.config === 'object'
        ? (step.config as Record<string, unknown>)
        : {};
    const stepName = String(step.name || `${index + 1}. browser_action`);
    const { config: normalizedConfig, inferredParam } = parameterizeBrowserWorkflowStepConfig(
      stepName,
      config
    );
    if (inferredParam && !inferredParams[inferredParam.name]) {
      inferredParams[inferredParam.name] = inferredParam.definition;
    }
    const action =
      String(normalizedConfig.action || step.action || 'browser_action').trim() || 'browser_action';
    return {
      id: String(step.id || `step_${index + 1}`),
      name: stepName || `${index + 1}. ${action}`,
      type: 'browser',
      config: normalizedConfig,
    };
  });

  const executionFlow = normalizedSteps.map((step) => {
    const config = step.config as Record<string, unknown>;
    const action = String(config.action || '').trim();
    const params: Record<string, unknown> = {};
    if (action === 'navigate' && config.url !== undefined) {
      params.url = config.url;
    }
    if (['fill', 'type_text'].includes(action) && config.value !== undefined) {
      params.value = config.value;
    }
    if (action === 'press_key' && config.key !== undefined) {
      params.key = config.key;
    }
    if (config.duration !== undefined) {
      params.duration = config.duration;
    } else if (config.timeoutMs !== undefined) {
      params.duration = config.timeoutMs;
    }

    return {
      name: String(step.name || 'browser_step'),
      tool: { name: 'browser_step' },
      input: {
        action,
        ...(typeof config.target === 'string' && config.target.trim()
          ? { target: config.target }
          : {}),
        ...(typeof config.selector === 'string' && config.selector.trim()
          ? { selector: config.selector }
          : {}),
        ...(config.locator && typeof config.locator === 'object'
          ? { locator: config.locator }
          : {}),
        ...(Object.keys(params).length > 0 ? { params } : {}),
      },
    };
  });

  const sourcePayload: Record<string, unknown> = {
    id: workflow.id,
    name: workflow.name,
    description: workflowDescription,
    goal: workflowGoal,
    sourceType: 'browser_recording',
    sourceTemplate: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ...(workflow.sourceTemplate || {}),
    },
    paramsSchema: buildBrowserWorkflowParamsSchema(
      workflow.workflowDsl?.inputParams,
      inferredParams
    ),
    steps: normalizedSteps,
    executionFlow,
    tools: ['skill_match', 'browser_step'],
    executionFlowKeys: [workflow.name].filter(Boolean),
    backend: 'cli',
    apiEndpoints: {
      runtimeMetadata: {
        sourceType: 'browser_recording',
        backend: 'cli',
        goal: workflowGoal,
        ...(() => {
          const sourceContext = asRecord(workflow.workflowDsl?.sourceContext);
          const rawComposition =
            asRecord(sourceContext?.browserWorkflowComposition) ||
            asRecord(sourceContext?.workflowComposition);
          return rawComposition &&
            Array.isArray(rawComposition.postProcessingSteps) &&
            rawComposition.postProcessingSteps.length > 0
            ? { composition: rawComposition, compositionSource: 'template_step_editor' }
            : {};
        })(),
      },
    },
  };

  const templateId = resolveBrowserWorkflowTemplateId(workflow);
  if (templateId) {
    try {
      const template = await templateApi.getById(templateId);
      const runtimeMetadata = extractBrowserTemplateRuntimeMetadata(template);
      sourcePayload.apiEndpoints = {
        runtimeMetadata: {
          ...(asRecord((sourcePayload.apiEndpoints as Record<string, unknown>)?.runtimeMetadata) ||
            {}),
          ...runtimeMetadata,
        },
      };
    } catch {
      // Ignore if template lookup fails
    }
  }

  return sourcePayload;
};
