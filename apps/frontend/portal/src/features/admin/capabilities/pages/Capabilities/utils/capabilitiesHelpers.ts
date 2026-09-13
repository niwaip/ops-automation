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

export type CapabilityPipelineStage =
  | 'configured'        // 1. 已创建/配置，待部署验证
  | 'deploying'         // 2. 部署中
  | 'deployed_pending'  // 3. 部署验证成功，待发布为技能
  | 'published'         // 4. 技能已发布上线
  | 'failed';           // 异常状态

export interface CapabilityPipelineInfo {
  stage: CapabilityPipelineStage;
  currentStep: number; // 1 | 2 | 3
  stepTitle: string;
  badgeText: string;
  badgeColor: 'orange' | 'processing' | 'cyan' | 'success' | 'error';
  actionPrompt: string;
  primaryAction: {
    key: 'deploy' | 'publish' | 'validate' | 'retry';
    label: string;
    stepTarget: number; // wizard step to open: 1=deploy, 2=publish, 3=validate
  };
}

export const resolvePipelineInfo = (release: CapabilityRelease): CapabilityPipelineInfo => {
  const isFailed =
    release.status === 'build_failed' ||
    release.status === 'validation_failed' ||
    release.status === 'deploy_failed' ||
    release.deploymentStatus === 'deploy_failed' ||
    release.deploymentStatus === 'failed';

  if (isFailed) {
    return {
      stage: 'failed',
      currentStep: 2,
      stepTitle: '部署/校验失败',
      badgeText: '部署/校验失败',
      badgeColor: 'error',
      actionPrompt: '上一轮部署或验证未通过，建议重新部署或排查参数',
      primaryAction: {
        key: 'retry',
        label: '重新部署',
        stepTarget: 1,
      },
    };
  }

  const isDeploying =
    release.status === 'deploying' ||
    release.deploymentStatus === 'deploying' ||
    release.deploymentStatus === 'running';

  if (isDeploying) {
    return {
      stage: 'deploying',
      currentStep: 2,
      stepTitle: '正在部署',
      badgeText: '正在部署...',
      badgeColor: 'processing',
      actionPrompt: '后台正在拉起容器环境并执行验证测试...',
      primaryAction: {
        key: 'deploy',
        label: '查看部署',
        stepTarget: 1,
      },
    };
  }

  const isPublished =
    Boolean(release.publishedSkillId) ||
    release.status === 'published';

  if (isPublished) {
    return {
      stage: 'published',
      currentStep: 3,
      stepTitle: '已发布上线',
      badgeText: '已发布上线',
      badgeColor: 'success',
      actionPrompt: '技能已在线运行，支持真实验证与重部署',
      primaryAction: {
        key: 'validate',
        label: '真实验证',
        stepTarget: 3,
      },
    };
  }

  const isDeployed =
    release.deploymentStatus === 'deployed' ||
    release.deploymentStatus === 'succeeded' ||
    release.status === 'deployed';

  if (isDeployed) {
    return {
      stage: 'deployed_pending',
      currentStep: 2,
      stepTitle: '部署就绪·待发布',
      badgeText: '部署就绪·待发布',
      badgeColor: 'cyan',
      actionPrompt: '测试环境部署与验证通过，可一键发布为技能',
      primaryAction: {
        key: 'publish',
        label: '发布为 Skill',
        stepTarget: 2,
      },
    };
  }

  // Otherwise: newly configured / draft / not started
  return {
    stage: 'configured',
    currentStep: 1,
    stepTitle: '待部署验证',
    badgeText: '待部署验证',
    badgeColor: 'orange',
    actionPrompt: '源配置已就绪，请在 staging 执行部署与验证',
    primaryAction: {
      key: 'deploy',
      label: '去部署验证',
      stepTarget: 1,
    },
  };
};

export const formatRelativeTime = (isoString?: string | null): string => {
  if (!isoString) return '-';
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return '-';
  const now = Date.now();
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return new Date(time).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

export const getNextStepHint = (release: CapabilityRelease): { label: string; color: string } => {
  const info = resolvePipelineInfo(release);
  return { label: info.badgeText, color: info.badgeColor };
};

export const canEnterReleaseCenter = (_release: CapabilityRelease): boolean => true;

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
        defaultValue: undefined,
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
        defaultValue: undefined,
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
      entries.map(([key, definition]) => {
        const desc = definition?.description || '';
        const isSecret =
          /password|passwd|devicekey|device_key|secret|credential|token|apikey|api_key/i.test(key) ||
          /(密码|口令|密钥|凭证|私钥|token)/i.test(desc);
        const isBasicAuth =
          /pass|credential|user|account/i.test(key) || /(密码|口令|账户|用户名)/i.test(desc);

        return [
          key,
          {
            type: definition?.type || 'string',
            description: desc,
            default: isSecret ? undefined : definition?.defaultValue,
            required: Boolean(definition?.required),
            ...(isSecret
              ? {
                  isSecret: true,
                  format: 'password',
                  credentialCategory: isBasicAuth ? 'basic_auth' : 'api_key',
                }
              : {}),
          },
        ];
      })
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
