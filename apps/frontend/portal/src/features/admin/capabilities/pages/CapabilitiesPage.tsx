import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreAddOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CapabilityRelease,
  CapabilityReleaseDetail,
  ReleaseAuditEvent,
  capabilityReleaseApi,
} from '@/api/capabilities';
import { executionFlowApi } from '@/api/flows';
import {
  TemporalWorkflowDTO,
  temporalWorkflowApi,
  WorkflowInputParamDefinition,
} from '@/api/temporal';
import { templateApi } from '@/api/template';
import { skillApi } from '@/api/skill';
import ParamSchemaEditor, {
  ParamSchemaFieldDraft,
} from '@/components/capability-release/ParamSchemaEditor';
import { ListSectionHeader } from '@/components/page/PageScaffold';

const { Title, Text } = Typography;
const { TextArea } = Input;
const studioPaneStyle: React.CSSProperties = {
  margin: 0,
  maxHeight: 320,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  padding: 12,
};

const modalJsonPaneStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-color)',
  borderRadius: 8,
  color: 'var(--text-primary)',
};

type SnapshotDiffStatus = 'same' | 'changed' | 'added' | 'removed';

interface SnapshotDiffRow {
  path: string;
  leftValue: string;
  rightValue: string;
  status: SnapshotDiffStatus;
}

interface ApiEndpointDraft {
  id: string;
  key: string;
  method: string;
  url: string;
  description: string;
  extraJson: string;
}

type DeploymentEnvironment = 'staging' | 'prod';

const DEPLOY_ENV_OPTIONS: { label: string; value: DeploymentEnvironment }[] = [
  { label: 'staging（预发布）', value: 'staging' },
  { label: 'prod（生产）', value: 'prod' },
];

const MISSING_VALUE = '__capability_snapshot_missing__';

const SOURCE_TYPE_OPTIONS = [
  { label: '模版型', value: 'execution_flow_template' },
  { label: '编排型', value: 'temporal_workflow' },
  { label: '浏览器录制', value: 'browser_recording' },
] as const;

interface CapabilitySourceOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface TemporalDeployReadiness {
  hasExecutableCode: boolean;
  message?: string;
  source?: 'build' | 'snapshot' | 'workflow' | 'missing';
}

const statusColor = (status: string) => {
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

const getSourceTypeLabel = (value: string) => {
  if (value === 'temporal_workflow') return '编排型';
  if (value === 'browser_recording') return '浏览器录制';
  return '模版型';
};

const getValidationTypeLabel = (value: string) => {
  if (value === 'sandbox') return '真实验证';
  if (value === 'post_deploy_smoke') return '部署后冒烟';
  if (value === 'static') return '静态校验';
  return value;
};

const getNextStepHint = (release: CapabilityRelease): { label: string; color: string } => {
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

const canEnterReleaseCenter = (release: CapabilityRelease): boolean =>
  Boolean(release.publishedSkillId) ||
  ['published', 'deployed', 'rolled_back'].includes(release.status) ||
  ['running', 'succeeded', 'deployed', 'rolled_back'].includes(release.deploymentStatus);

const flattenSnapshotPayload = (
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

const buildSnapshotDiffRows = (
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

const hasNonEmptyCode = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const getTemporalDeployReadiness = (
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

const parseJsonDraft = <T,>(
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

const createParamFieldId = () => `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createApiEndpointId = () =>
  `endpoint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parseParamSchemaToDraft = (
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

const normalizeParamDefaultValue = (type: string, raw: string): unknown => {
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

const buildParamSchemaFromDraft = (
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

const parseApiEndpointsToDraft = (
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

const normalizeBrowserWorkflowAction = (action: string): string => {
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

const looksLikeTemplatePlaceholder = (value: string): boolean => {
  const target = value.trim();
  return /^\$\{[^{}]+\}$/.test(target) || /^\{[^{}]+\}$/.test(target);
};

const looksLikeBrowserSelector = (value: string): boolean => {
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

const normalizeBrowserWorkflowLocator = (locator: unknown): Record<string, unknown> | undefined => {
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

const browserPlaceholder = (name: string) => `\${${name}}`;

const inferBrowserWorkflowParamDefinition = (
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

const normalizeBrowserWorkflowStepConfig = (
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

const parameterizeBrowserWorkflowStepConfig = (
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

const buildBrowserWorkflowParamsSchema = (
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

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const asRecordArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
    : [];

const resolveBrowserWorkflowTemplateId = (workflow: TemporalWorkflowDTO): string | undefined => {
  const sourceTemplate =
    workflow.sourceTemplate ||
    workflow.sourceContext?.sourceTemplate ||
    workflow.workflowDsl?.sourceContext?.sourceTemplate;
  const templateId = sourceTemplate?.templateId;
  return typeof templateId === 'string' && templateId.trim() ? templateId.trim() : undefined;
};

const extractBrowserTemplateRuntimeMetadata = (
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
  const configLoopDraft =
    asRecord(config.loopDraft) || asRecord(configExecutionPlan.loopDraft) || undefined;
  const configLoopPlanPreview =
    asRecordArray(config.loopPlanPreview).length > 0
      ? asRecordArray(config.loopPlanPreview)
      : asRecordArray(configExecutionPlan.loopPlanPreview);
  const executionPlan =
    Object.keys(configExecutionPlan).length > 0
      ? {
          ...configExecutionPlan,
          ...(executionPlanTemplateSteps.length > 0
            ? {}
            : configTemplateSteps.length > 0
              ? { templateSteps: configTemplateSteps }
              : {}),
          ...(configExecutionPlan.loopDraft
            ? {}
            : configLoopDraft
              ? { loopDraft: configLoopDraft }
              : {}),
        }
      : {};

  return {
    ...(Object.keys(executionPlan).length > 0 ? { executionPlan } : {}),
    ...(configTemplateSteps.length > 0 ? { templateSteps: configTemplateSteps } : {}),
    ...(configLoopDraft ? { loopDraft: configLoopDraft } : {}),
    ...(configLoopPlanPreview.length > 0 ? { loopPlanPreview: configLoopPlanPreview } : {}),
  };
};

const extractBrowserWorkflowSteps = (
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

const buildBrowserRecordingSourcePayload = async (
  workflow: TemporalWorkflowDTO
): Promise<Record<string, unknown>> => {
  const workflowSteps = extractBrowserWorkflowSteps(workflow);
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
    description: workflow.description || '',
    goal: workflow.description || workflow.name,
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
        goal: workflow.description || workflow.name,
      },
    },
  };

  const templateId = resolveBrowserWorkflowTemplateId(workflow);
  if (!templateId) {
    return sourcePayload;
  }

  const template = await templateApi.getById(templateId);
  const templateRuntimeMetadata = extractBrowserTemplateRuntimeMetadata(template);
  if (Object.keys(templateRuntimeMetadata).length === 0) {
    return sourcePayload;
  }

  return {
    ...sourcePayload,
    apiEndpoints: {
      ...(asRecord(sourcePayload.apiEndpoints) || {}),
      runtimeMetadata: {
        ...(asRecord(asRecord(sourcePayload.apiEndpoints)?.runtimeMetadata) || {}),
        ...templateRuntimeMetadata,
      },
    },
  };
};

interface CapabilitiesPageProps {
  mode?: 'manager' | 'studio';
}

const CapabilitiesPage: React.FC<CapabilitiesPageProps> = ({ mode = 'manager' }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStudioMode = mode === 'studio';
  const [searchText, setSearchText] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [diffLeftSnapshotId, setDiffLeftSnapshotId] = useState<string | null>(null);
  const [diffRightSnapshotId, setDiffRightSnapshotId] = useState<string | null>(null);
  const [showOnlyDiff, setShowOnlyDiff] = useState(true);
  const [isEditingSource, setIsEditingSource] = useState(false);
  const [sourceNameDraft, setSourceNameDraft] = useState('');
  const [sourcePayloadDraft, setSourcePayloadDraft] = useState('{}');
  const [deployVisible, setDeployVisible] = useState(false);
  const [deployTargetReleaseId, setDeployTargetReleaseId] = useState<string | null>(null);
  const [deployEnvironment, setDeployEnvironment] = useState<DeploymentEnvironment>('staging');
  const [deployStrategy, setDeployStrategy] = useState<
    'hot_reload' | 'rolling_restart' | 'full_restart'
  >('rolling_restart');
  const [deployOverridesDraft, setDeployOverridesDraft] = useState('{}');
  const [createWizardStep, setCreateWizardStep] = useState(0);
  const [wizardReleaseId, setWizardReleaseId] = useState<string | null>(null);
  const [wizardValidationCasesDraft, setWizardValidationCasesDraft] = useState('');
  const [wizardValidationUserInput, setWizardValidationUserInput] = useState('');
  const [wizardAssistExplanation, setWizardAssistExplanation] = useState('');
  const [wizardValidationExecuted, setWizardValidationExecuted] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit' | null>(null);

  const [selectedAuditEvent, setSelectedAuditEvent] = useState<ReleaseAuditEvent | null>(null);
  const [isAuditModalVisible, setIsAuditModalVisible] = useState(false);

  const [jsonViewVisible, setJsonViewVisible] = useState(false);
  const [jsonViewTitle, setJsonViewTitle] = useState('');
  const [jsonViewData, setJsonViewData] = useState<any>(null);

  // AI 失败分析相关状态
  const [analysisResult, setAnalysisResult] = useState<{
    analysis: string;
    explanation: string;
    isParameterIssue: boolean;
    suggestedParams?: Record<string, unknown> | null;
    suggestedAction?: string | null;
  } | null>(null);
  const [analysisVisible, setAnalysisVisible] = useState(false);

  const analyzeFailureMutation = useMutation(
    (data: { id: string; recordId: string; recordType: 'build' | 'validation' | 'deployment' }) =>
      capabilityReleaseApi.analyzeFailure(data.id, {
        recordId: data.recordId,
        recordType: data.recordType,
      }),
    {
      onSuccess: (result) => {
        setAnalysisResult(result);
        setAnalysisVisible(true);
      },
      onError: (error: any) => {
        message.error(error?.message || 'AI 分析失败');
      },
    }
  );

  const [isEditingSkillDraft, setIsEditingSkillDraft] = useState(false);
  const [skillDraftName, setSkillDraftName] = useState('');
  const [skillDraftDescription, setSkillDraftDescription] = useState('');
  const [skillDraftTriggerKeywords, setSkillDraftTriggerKeywords] = useState<string[]>([]);
  const [skillDraftTools, setSkillDraftTools] = useState<string[]>([]);
  const [skillDraftTemplateIds, setSkillDraftTemplateIds] = useState<string[]>([]);
  const [skillDraftParamFields, setSkillDraftParamFields] = useState<ParamSchemaFieldDraft[]>([]);
  const [skillDraftParamSchemaExtras, setSkillDraftParamSchemaExtras] = useState<
    Record<string, unknown>
  >({
    type: 'object',
  });
  const [skillDraftApiEndpointFields, setSkillDraftApiEndpointFields] = useState<
    ApiEndpointDraft[]
  >([]);
  const [createForm] = Form.useForm();
  const createSourceType = Form.useWatch('sourceType', createForm);
  const createSourceId = Form.useWatch('sourceId', createForm);

  const releasesQuery = useQuery(['capabilities'], capabilityReleaseApi.list);
  const temporalWorkflowOptionsQuery = useQuery(
    ['temporal-options'],
    () => temporalWorkflowApi.list(),
    { staleTime: 30_000 }
  );
  const executionFlowOptionsQuery = useQuery(
    ['flow-options'],
    () => executionFlowApi.list({ limit: 200, isActive: true }),
    { staleTime: 30_000 }
  );
  const detailQuery = useQuery(
    ['capability-detail', selectedReleaseId],
    () => capabilityReleaseApi.getById(selectedReleaseId as string),
    { enabled: Boolean(selectedReleaseId) }
  );
  const wizardDetailQuery = useQuery(
    ['capability-wizard-detail', wizardReleaseId],
    () => capabilityReleaseApi.getById(wizardReleaseId as string),
    { enabled: Boolean(wizardReleaseId && createVisible) }
  );

  const createSourceOptions = useMemo<CapabilitySourceOption[]>(() => {
    if (createSourceType === 'temporal_workflow') {
      return (temporalWorkflowOptionsQuery.data || [])
        .filter(
          (workflow: TemporalWorkflowDTO) =>
            workflow.validationStatus === 'validated' && Boolean(workflow.generatedCode?.trim())
        )
        .map((workflow: TemporalWorkflowDTO) => ({
          label: workflow.name || `Workflow ${workflow.id.slice(0, 8)}`,
          value: workflow.id,
          description: [
            workflow.description || null,
            `Artifact v${Number(workflow.artifactVersion || 0)}`,
            `状态: ${workflow.validationStatus || 'draft'}`,
            workflow.validatedAt
              ? `验证时间: ${new Date(workflow.validatedAt).toLocaleString()}`
              : null,
            `Task Queue: ${workflow.taskQueue}`,
          ]
            .filter(Boolean)
            .join(' | '),
        }));
    }

    if (createSourceType === 'execution_flow_template') {
      return (executionFlowOptionsQuery.data?.templates || []).map((template) => ({
        label: template.name || `Template ${template.id.slice(0, 8)}`,
        value: template.id,
        description: template.description || template.goal || template.category,
      }));
    }

    if (createSourceType === 'browser_recording') {
      return (temporalWorkflowOptionsQuery.data || [])
        .filter(
          (workflow: TemporalWorkflowDTO) =>
            workflow.sourceContext?.sourceType === 'browser_template'
        )
        .map((workflow: TemporalWorkflowDTO) => ({
          label: workflow.name || `Browser Workflow ${workflow.id.slice(0, 8)}`,
          value: workflow.id,
          description: workflow.description || `Task Queue: ${workflow.taskQueue}`,
        }));
    }

    return [];
  }, [
    createSourceType,
    executionFlowOptionsQuery.data?.templates,
    temporalWorkflowOptionsQuery.data,
  ]);
  const isCreateSourceLoading =
    createSourceType === 'temporal_workflow'
      ? temporalWorkflowOptionsQuery.isLoading
      : createSourceType === 'execution_flow_template'
        ? executionFlowOptionsQuery.isLoading
        : createSourceType === 'browser_recording'
          ? temporalWorkflowOptionsQuery.isLoading
          : false;
  const temporalWorkflowMap = useMemo(
    () =>
      new Map((temporalWorkflowOptionsQuery.data || []).map((workflow) => [workflow.id, workflow])),
    [temporalWorkflowOptionsQuery.data]
  );

  useEffect(() => {
    if (!createVisible) {
      return;
    }

    createForm.setFieldsValue({
      sourceId: undefined,
      sourceName: undefined,
    });
  }, [createForm, createSourceType, createVisible]);

  useEffect(() => {
    if (!createVisible || !createSourceType || !createSourceId) {
      return;
    }

    const selectedSource = createSourceOptions.find((item) => item.value === createSourceId);
    if (!selectedSource) {
      return;
    }

    const currentName = createForm.getFieldValue('sourceName');
    if (!currentName || currentName === '') {
      createForm.setFieldsValue({ sourceName: selectedSource.label });
    }
  }, [createForm, createSourceId, createSourceOptions, createSourceType, createVisible]);

  const refreshQueries = async (releaseId?: string) => {
    await queryClient.invalidateQueries(['capabilities']);
    if (releaseId) {
      await queryClient.invalidateQueries(['capability-detail', releaseId]);
      await queryClient.invalidateQueries(['capability-wizard-detail', releaseId]);
    }
  };

  const createMutation = useMutation(capabilityReleaseApi.create, {
    onSuccess: async (result) => {
      message.success('Capability Release 已创建');
      const createdId = result.release.release.id;
      setWizardReleaseId(createdId);
      setCreateWizardStep(1);
      await refreshQueries(createdId);
    },
    onError: (error: any) => {
      message.error(error?.message || '创建失败');
    },
  });

  const validateStaticMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.validateStatic(id),
    {
      onSuccess: async (result, variables) => {
        message.success(result.validation.success ? '静态校验通过' : '静态校验未通过');
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '静态校验失败');
      },
    }
  );

  const generateDraftMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.generateSkillDraft(id),
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 草案已生成: ${result.skillDraft.name}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '生成 Skill 草案失败');
      },
    }
  );

  const publishMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.publishSkill(id),
    {
      onSuccess: async (result, variables) => {
        message.success(`Skill 发布成功: ${result.publishedSkillId}`);
        if (wizardReleaseId === variables.id) {
          setCreateWizardStep(3);
        }
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '发布 Skill 失败');
      },
    }
  );

  const approveMutation = useMutation(
    ({ id }: { id: string }) =>
      capabilityReleaseApi.approveRelease(id, { decision: 'approved', comment: 'Portal 审批通过' }),
    {
      onSuccess: async (result, variables) => {
        message.success(`Release 已审批: ${result.release.release.status}`);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '审批失败');
      },
    }
  );

  const deployMutation = useMutation(
    ({
      id,
      environment,
      strategy,
      configOverrides,
    }: {
      id: string;
      environment: DeploymentEnvironment;
      strategy: 'hot_reload' | 'rolling_restart' | 'full_restart';
      configOverrides?: Record<string, unknown>;
    }) => capabilityReleaseApi.deploy(id, { environment, strategy, configOverrides }),
    {
      onSuccess: async (result, variables) => {
        message.success(`部署完成: ${result.deployment.status}`);
        setDeployVisible(false);
        setDeployOverridesDraft('{}');
        if (wizardReleaseId === variables.id) {
          setCreateWizardStep(2);
        }
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '部署失败');
      },
    }
  );

  const validateSkillMutation = useMutation(
    ({ skillId }: { skillId: string }) => skillApi.validate(skillId),
    {
      onSuccess: async (result) => {
        const score = result.validation.score;
        message.success(`Skill 校验完成，分数 ${score}`);
      },
      onError: (error: any) => {
        message.error(error?.message || 'Skill 校验失败');
      },
    }
  );

  const realValidateMutation = useMutation(
    ({
      id,
      input,
      testUserInput,
      testCases,
      fn,
    }: {
      id: string;
      input?: Record<string, unknown>;
      testUserInput?: string;
      testCases?: string[];
      fn?: string;
    }) => capabilityReleaseApi.validateSandbox(id, { input, testUserInput, testCases, fn }),
    {
      onSuccess: async (result, variables) => {
        message.success(result.validation.success ? '真实校验通过' : '真实校验未通过');
        setWizardValidationExecuted(true);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '真实校验失败');
      },
    }
  );
  const wizardAssistMutation = useMutation(
    ({ id, environment }: { id: string; environment: DeploymentEnvironment }) =>
      capabilityReleaseApi.suggestWizardAssist(id, { environment }),
    {
      onSuccess: (result) => {
        setWizardAssistExplanation(result.explanation);
        if (Object.keys(result.deployConfig || {}).length > 0) {
          setDeployOverridesDraft(JSON.stringify(result.deployConfig, null, 2));
        }
        if (result.testUserInput) {
          setWizardValidationCasesDraft((prev) =>
            [prev, result.testUserInput].filter((item) => item && item.trim()).join('\n')
          );
          setWizardValidationUserInput(result.testUserInput);
        }
        message.success('AI 已生成部署与测试建议');
      },
      onError: (error: any) => {
        message.error(error?.message || 'AI 辅助建议生成失败');
      },
    }
  );

  const archiveReleaseMutation = useMutation(
    ({ id }: { id: string }) => capabilityReleaseApi.archive(id),
    {
      onSuccess: async (_, variables) => {
        message.success('Release 已删除');
        if (selectedReleaseId === variables.id) {
          setSelectedReleaseId(null);
          setSearchParams({});
        }
        await refreshQueries();
      },
      onError: (error: any) => {
        message.error(error?.message || '删除 Release 失败');
      },
    }
  );

  const updateSourceMutation = useMutation(
    ({
      id,
      sourceName,
      sourcePayload,
    }: {
      id: string;
      sourceName?: string;
      sourcePayload: Record<string, unknown>;
    }) => capabilityReleaseApi.updateSource(id, { sourceName, sourcePayload }),
    {
      onSuccess: async (result, variables) => {
        message.success('源定义已保存为新快照');
        setIsEditingSource(false);
        setSourceNameDraft(result.release.release.sourceName || '');
        setSourcePayloadDraft(
          JSON.stringify(result.release.currentSourceSnapshot?.sourcePayload || {}, null, 2)
        );
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '保存源定义失败');
      },
    }
  );

  const updateSkillDraftMutation = useMutation(
    ({
      id,
      payload,
    }: {
      id: string;
      payload: Parameters<typeof capabilityReleaseApi.updateSkillDraft>[1];
    }) => capabilityReleaseApi.updateSkillDraft(id, payload),
    {
      onSuccess: async (_, variables) => {
        message.success('Skill 草案已更新');
        setIsEditingSkillDraft(false);
        await refreshQueries(variables.id);
      },
      onError: (error: any) => {
        message.error(error?.message || '更新 Skill 草案失败');
      },
    }
  );

  const filteredReleases = useMemo(() => {
    const releases = releasesQuery.data?.releases || [];
    if (!searchText.trim()) {
      return releases;
    }
    const keyword = searchText.toLowerCase();
    return releases.filter((release) => {
      const nextStepHint = getNextStepHint(release);
      return (
        release.id.toLowerCase().includes(keyword) ||
        String(release.sourceName || '')
          .toLowerCase()
          .includes(keyword) ||
        release.sourceType.toLowerCase().includes(keyword) ||
        release.status.toLowerCase().includes(keyword) ||
        nextStepHint.label.toLowerCase().includes(keyword)
      );
    });
  }, [releasesQuery.data?.releases, searchText]);

  const columns: ColumnsType<CapabilityRelease> = [
    {
      title: <div style={{ textAlign: 'center' }}>能力名称</div>,
      dataIndex: 'sourceName',
      key: 'sourceName',
      width: 170,
      align: 'center',
      render: (value: string | null | undefined, record) => {
        const displayName = value || record.sourceId || '未命名';
        return (
          <Button
            type="link"
            size="small"
            style={{ padding: 0, maxWidth: 140 }}
            onClick={() => {
              setSelectedReleaseId(record.id);
              setDrawerMode('view');
              setSearchParams({ releaseId: record.id, mode: 'view' });
            }}
          >
            <Text style={{ maxWidth: 140 }} ellipsis={{ tooltip: displayName }}>
              {displayName}
            </Text>
          </Button>
        );
      },
    },
    {
      title: <div style={{ textAlign: 'center' }}>类型</div>,
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 120,
      align: 'center',
      render: (value: string) => (
        <Tag
          color={
            value === 'temporal_workflow'
              ? 'purple'
              : value === 'browser_recording'
                ? 'cyan'
                : 'blue'
          }
        >
          {getSourceTypeLabel(value)}
        </Tag>
      ),
    },
    {
      title: <div style={{ textAlign: 'center' }}>状态</div>,
      dataIndex: 'status',
      key: 'status',
      width: 120,
      align: 'center',
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: <div style={{ textAlign: 'center' }}>审批状态</div>,
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 120,
      align: 'center',
      render: (value: string) => <Tag color={value === 'approved' ? 'green' : 'gold'}>{value}</Tag>,
    },
    {
      title: <div style={{ textAlign: 'center' }}>部署状态</div>,
      key: 'deploymentStatus',
      width: 180,
      align: 'center',
      render: (_, record) => {
        const status = record.deploymentStatus || '未部署';
        const env = record.lastDeploymentEnvironment;
        return (
          <Space direction="vertical" size={0} style={{ width: '100%', textAlign: 'center' }}>
            {env && (
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 2 }}>
                环境: <Text strong>{env}</Text>
              </div>
            )}
            <Tag color={statusColor(status)} style={{ marginRight: 0 }}>
              {status}
            </Tag>
          </Space>
        );
      },
    },
    {
      title: <div style={{ textAlign: 'center' }}>操作</div>,
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_, record) => (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Space size="small" wrap>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setSelectedReleaseId(record.id);
                setDrawerMode('edit');
                setSearchParams({ releaseId: record.id, mode: 'edit' });
              }}
            >
              编辑
            </Button>
            <Button
              danger
              type="link"
              size="small"
              icon={<DeleteOutlined />}
              loading={archiveReleaseMutation.isLoading}
              onClick={() => handleArchiveRelease(record.id)}
            >
              删除
            </Button>
          </Space>
        </div>
      ),
    },
  ];

  const selectedDetail: CapabilityReleaseDetail | undefined = detailQuery.data?.release;
  const wizardDetail: CapabilityReleaseDetail | undefined = wizardDetailQuery.data?.release;
  const selectedSourceWorkflow = useMemo(
    () =>
      selectedDetail?.release.sourceId
        ? temporalWorkflowMap.get(selectedDetail.release.sourceId) || null
        : null,
    [selectedDetail?.release.sourceId, temporalWorkflowMap]
  );
  const wizardSourceWorkflow = useMemo(
    () =>
      wizardDetail?.release.sourceId
        ? temporalWorkflowMap.get(wizardDetail.release.sourceId) || null
        : null,
    [wizardDetail?.release.sourceId, temporalWorkflowMap]
  );
  const selectedDeployReadiness = useMemo(
    () => getTemporalDeployReadiness(selectedDetail, selectedSourceWorkflow),
    [selectedDetail, selectedSourceWorkflow]
  );
  const wizardDeployReadiness = useMemo(
    () => getTemporalDeployReadiness(wizardDetail, wizardSourceWorkflow),
    [wizardDetail, wizardSourceWorkflow]
  );
  const currentSkillDraftRuntimeMetadata = useMemo(() => {
    const runtimeMetadata =
      selectedDetail?.currentSkillDraft?.apiEndpoints &&
      typeof selectedDetail.currentSkillDraft.apiEndpoints === 'object'
        ? (selectedDetail.currentSkillDraft.apiEndpoints as Record<string, unknown>).runtimeMetadata
        : undefined;
    return runtimeMetadata && typeof runtimeMetadata === 'object'
      ? (runtimeMetadata as Record<string, unknown>)
      : {};
  }, [selectedDetail?.currentSkillDraft?.id, selectedDetail?.currentSkillDraft?.updatedAt]);
  const wizardRelease =
    wizardDetail?.release ||
    (releasesQuery.data?.releases || []).find((item) => item.id === wizardReleaseId);
  const wizardLatestValidation =
    wizardDetail?.validations?.find((item) => item.validationType === 'sandbox') ||
    wizardDetail?.validations?.[0];
  const wizardValidationCaseResults = useMemo(() => {
    const raw = wizardLatestValidation?.resultSnapshot?.caseResults;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        caseIndex: typeof item.caseIndex === 'number' ? item.caseIndex : 0,
        testUserInput: typeof item.testUserInput === 'string' ? item.testUserInput : '',
        success: Boolean(item.success),
        score: typeof item.score === 'number' ? item.score : 0,
        error: typeof item.error === 'string' ? item.error : '',
        logs: Array.isArray(item.logs)
          ? item.logs.filter((log): log is string => typeof log === 'string')
          : [],
      }));
  }, [wizardLatestValidation]);
  const latestBuild = selectedDetail?.builds?.[0];
  const latestValidation = selectedDetail?.validations?.[0];
  const latestDeployment = selectedDetail?.deployments?.[0];
  const latestSmokeValidation =
    selectedDetail?.validations?.find(
      (item) =>
        item.validationType === 'post_deploy_smoke' &&
        item.id === latestDeployment?.smokeValidationId
    ) || selectedDetail?.validations?.find((item) => item.validationType === 'post_deploy_smoke');
  const latestAuditEvents = selectedDetail?.auditEvents?.slice(0, 12) || [];
  const deploymentProfiles = useMemo(() => {
    const raw = selectedDetail?.currentSourceSnapshot?.sourcePayload?.deploymentProfiles;
    return raw && typeof raw === 'object' ? (raw as Record<string, Record<string, unknown>>) : {};
  }, [selectedDetail?.currentSourceSnapshot?.id]);
  const activeDeployProfile =
    (deployVisible && deployTargetReleaseId === selectedDetail?.release.id
      ? deploymentProfiles[deployEnvironment]
      : undefined) || {};
  const sourceSnapshots = useMemo(
    () =>
      [...(selectedDetail?.sourceSnapshots || [])].sort((left, right) => {
        if (right.snapshotVersion !== left.snapshotVersion) {
          return right.snapshotVersion - left.snapshotVersion;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [selectedDetail?.sourceSnapshots]
  );
  const activeDetailTab = searchParams.get('tab') === 'studio' ? 'studio' : 'ops';

  const handleDetailTabChange = (tab: 'ops' | 'studio') => {
    if (!selectedReleaseId) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('releaseId', selectedReleaseId);
    nextParams.set('mode', drawerMode || 'view');
    if (tab === 'studio') {
      nextParams.set('tab', 'studio');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams);
  };

  useEffect(() => {
    const releaseIdFromQuery = searchParams.get('releaseId');
    const modeFromQuery = searchParams.get('mode') as 'view' | 'edit' | null;

    if (releaseIdFromQuery && releaseIdFromQuery !== selectedReleaseId) {
      setSelectedReleaseId(releaseIdFromQuery);
      if (modeFromQuery) {
        setDrawerMode(modeFromQuery);
      } else if (!drawerMode) {
        setDrawerMode('edit');
      }
    }
    if (!releaseIdFromQuery && selectedReleaseId) {
      setSelectedReleaseId(null);
      setDrawerMode(null);
    }
  }, [searchParams, selectedReleaseId, drawerMode]);

  useEffect(() => {
    if (!selectedDetail) {
      setDiffLeftSnapshotId(null);
      setDiffRightSnapshotId(null);
      return;
    }

    const currentSnapshotId =
      selectedDetail.currentSourceSnapshot?.id || sourceSnapshots[0]?.id || null;
    const previousSnapshotId =
      sourceSnapshots.find((snapshot) => snapshot.id !== currentSnapshotId)?.id ||
      currentSnapshotId;

    setDiffLeftSnapshotId(previousSnapshotId);
    setDiffRightSnapshotId(currentSnapshotId);
  }, [selectedDetail?.release.id, selectedDetail?.currentSourceSnapshot?.id, sourceSnapshots]);

  useEffect(() => {
    if (!selectedDetail) {
      setIsEditingSource(false);
      setSourceNameDraft('');
      setSourcePayloadDraft('{}');
      return;
    }

    setSourceNameDraft(selectedDetail.release.sourceName || '');
    setSourcePayloadDraft(
      JSON.stringify(selectedDetail.currentSourceSnapshot?.sourcePayload || {}, null, 2)
    );
    setIsEditingSource(false);
  }, [
    selectedDetail?.release.id,
    selectedDetail?.release.sourceName,
    selectedDetail?.currentSourceSnapshot?.id,
  ]);

  useEffect(() => {
    const draft = selectedDetail?.currentSkillDraft;
    if (!draft) {
      setIsEditingSkillDraft(false);
      setSkillDraftName('');
      setSkillDraftDescription('');
      setSkillDraftTriggerKeywords([]);
      setSkillDraftTools([]);
      setSkillDraftTemplateIds([]);
      setSkillDraftParamFields([]);
      setSkillDraftParamSchemaExtras({ type: 'object' });
      setSkillDraftApiEndpointFields([]);
      return;
    }

    const parsedParamSchema = parseParamSchemaToDraft(draft.paramsSchema);
    setSkillDraftName(draft.name || '');
    setSkillDraftDescription(draft.description || '');
    setSkillDraftTriggerKeywords(draft.triggerKeywords || []);
    setSkillDraftTools(draft.tools || []);
    setSkillDraftTemplateIds(draft.executionFlowTemplateIds || []);
    setSkillDraftParamFields(parsedParamSchema.fields);
    setSkillDraftParamSchemaExtras(parsedParamSchema.extras);
    setSkillDraftApiEndpointFields(parseApiEndpointsToDraft(draft.apiEndpoints ?? null));
    setIsEditingSkillDraft(false);
  }, [
    selectedDetail?.release.id,
    selectedDetail?.currentSkillDraft?.id,
    selectedDetail?.currentSkillDraft?.updatedAt,
  ]);

  const leftSnapshot =
    sourceSnapshots.find((snapshot) => snapshot.id === diffLeftSnapshotId) ||
    sourceSnapshots[1] ||
    null;
  const rightSnapshot =
    sourceSnapshots.find((snapshot) => snapshot.id === diffRightSnapshotId) ||
    selectedDetail?.currentSourceSnapshot ||
    sourceSnapshots[0] ||
    null;
  const snapshotDiffRows = useMemo(
    () =>
      leftSnapshot && rightSnapshot
        ? buildSnapshotDiffRows(leftSnapshot.sourcePayload, rightSnapshot.sourcePayload)
        : [],
    [leftSnapshot, rightSnapshot]
  );
  const visibleSnapshotDiffRows = useMemo(
    () =>
      showOnlyDiff ? snapshotDiffRows.filter((row) => row.status !== 'same') : snapshotDiffRows,
    [showOnlyDiff, snapshotDiffRows]
  );
  const snapshotDiffSummary = useMemo(
    () =>
      snapshotDiffRows.reduce(
        (summary, row) => {
          if (row.status === 'added') {
            summary.added += 1;
          } else if (row.status === 'removed') {
            summary.removed += 1;
          } else if (row.status === 'changed') {
            summary.changed += 1;
          } else {
            summary.same += 1;
          }
          return summary;
        },
        { added: 0, removed: 0, changed: 0, same: 0 }
      ),
    [snapshotDiffRows]
  );
  const hasSnapshotDrift = Boolean(
    selectedDetail?.currentSourceSnapshot?.id &&
    latestBuild?.sourceSnapshotId &&
    selectedDetail.currentSourceSnapshot.id !== latestBuild.sourceSnapshotId
  );
  const hasNoBuild = !latestBuild;
  const hasNoValidation = !latestValidation;
  const sourcePayloadDraftState = useMemo(
    () => parseJsonDraft<Record<string, unknown>>(sourcePayloadDraft || '{}', '源定义 JSON'),
    [sourcePayloadDraft]
  );
  const skillDraftParamsSchemaValue = useMemo(
    () => buildParamSchemaFromDraft(skillDraftParamFields, skillDraftParamSchemaExtras),
    [skillDraftParamFields, skillDraftParamSchemaExtras]
  );
  const skillDraftParamFieldErrors = useMemo(() => {
    const nameSet = new Set<string>();
    const errors: string[] = [];

    skillDraftParamFields.forEach((field, index) => {
      const name = field.name.trim();
      if (!name) {
        errors.push(`第 ${index + 1} 个参数缺少字段名`);
      } else if (nameSet.has(name)) {
        errors.push(`参数名重复: ${name}`);
      } else {
        nameSet.add(name);
      }

      if (!field.type.trim()) {
        errors.push(`参数 ${name || index + 1} 缺少类型`);
      }
    });

    return errors;
  }, [skillDraftParamFields]);
  const skillDraftApiEndpointErrors = useMemo(() => {
    const errors: string[] = [];
    const endpointKeySet = new Set<string>();

    skillDraftApiEndpointFields.forEach((endpoint, index) => {
      const key = endpoint.key.trim();
      if (!key) {
        errors.push(`第 ${index + 1} 个 API Endpoint 缺少标识名`);
      } else if (endpointKeySet.has(key)) {
        errors.push(`API Endpoint 标识重复: ${key}`);
      } else {
        endpointKeySet.add(key);
      }

      if (!endpoint.url.trim()) {
        errors.push(`API Endpoint ${key || index + 1} 缺少 URL`);
      }

      if (endpoint.extraJson.trim()) {
        const parsed = parseJsonDraft<Record<string, unknown>>(
          endpoint.extraJson,
          `API Endpoint ${key || index + 1} 额外 JSON`
        );
        if (!parsed.valid) {
          errors.push(parsed.error);
        }
      }
    });

    return errors;
  }, [skillDraftApiEndpointFields]);
  const skillDraftApiEndpointsValue = useMemo(() => {
    const endpoints: Record<string, unknown> = {};

    skillDraftApiEndpointFields.forEach((endpoint) => {
      const key = endpoint.key.trim();
      if (!key) {
        return;
      }

      const parsedExtra = endpoint.extraJson.trim()
        ? parseJsonDraft<Record<string, unknown>>(
            endpoint.extraJson,
            `API Endpoint ${key} 额外 JSON`
          )
        : { valid: true as const, value: {} as Record<string, unknown> };

      endpoints[key] = {
        url: endpoint.url.trim(),
        method: endpoint.method,
        description: endpoint.description.trim(),
        ...(parsedExtra.valid ? parsedExtra.value : {}),
      };
    });

    return Object.keys(endpoints).length > 0 ? endpoints : null;
  }, [skillDraftApiEndpointFields]);
  const deployOverridesState = useMemo(
    () =>
      parseJsonDraft<Record<string, unknown>>(deployOverridesDraft || '{}', '部署覆盖参数 JSON'),
    [deployOverridesDraft]
  );
  const wizardValidationCases = useMemo(
    () =>
      wizardValidationCasesDraft
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    [wizardValidationCasesDraft]
  );
  const wizardActiveDeployProfile =
    wizardDetail?.currentSourceSnapshot?.sourcePayload?.deploymentProfiles &&
    typeof wizardDetail.currentSourceSnapshot.sourcePayload.deploymentProfiles === 'object'
      ? ((
          wizardDetail.currentSourceSnapshot.sourcePayload.deploymentProfiles as Record<
            string,
            unknown
          >
        )[deployEnvironment] as Record<string, unknown> | undefined) || {}
      : {};
  const hasSuccessfulStagingDeployment = useMemo(
    () =>
      Boolean(
        selectedDetail?.deployments?.some(
          (deployment) => deployment.environment === 'staging' && deployment.status === 'succeeded'
        )
      ),
    [selectedDetail?.deployments]
  );
  const wizardHasSuccessfulStagingDeployment = useMemo(
    () =>
      Boolean(
        wizardDetail?.deployments?.some(
          (deployment) => deployment.environment === 'staging' && deployment.status === 'succeeded'
        )
      ),
    [wizardDetail?.deployments]
  );

  const resetCreateWizard = () => {
    setCreateVisible(false);
    setCreateWizardStep(0);
    setWizardReleaseId(null);
    setWizardValidationCasesDraft('');
    setWizardValidationUserInput('');
    setWizardAssistExplanation('');
    setWizardValidationExecuted(false);
    createForm.resetFields();
  };

  const openCreateWizard = () => {
    setSelectedReleaseId(null);
    setSearchParams({});
    setCreateWizardStep(0);
    setWizardReleaseId(null);
    setWizardValidationCasesDraft('');
    setWizardValidationUserInput('');
    setWizardAssistExplanation('');
    setWizardValidationExecuted(false);
    setCreateVisible(true);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      if (!values.sourceId && !values.sourcePayload?.trim()) {
        message.error('请选择已有源对象，或填写源定义 JSON');
        return;
      }
      let sourcePayload: Record<string, unknown> | undefined;
      if (values.sourceType === 'browser_recording') {
        if (values.sourcePayload?.trim()) {
          sourcePayload = JSON.parse(values.sourcePayload);
        } else if (values.sourceId) {
          const workflowDetail = await temporalWorkflowApi.getById(values.sourceId);
          sourcePayload = await buildBrowserRecordingSourcePayload(workflowDetail);
        }
      } else if (values.sourcePayload?.trim()) {
        sourcePayload = JSON.parse(values.sourcePayload);
      }
      createMutation.mutate({
        sourceType: values.sourceType,
        sourceId: values.sourceId || undefined,
        sourceName: values.sourceName || undefined,
        sourcePayload,
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const openDeployModal = (releaseId: string) => {
    setSelectedReleaseId(releaseId);
    setDeployTargetReleaseId(releaseId);
    setDeployEnvironment('staging');
    setDeployStrategy('rolling_restart');
    setDeployOverridesDraft('{}');
    setDeployVisible(true);
  };

  const handleDeploy = async () => {
    if (!deployTargetReleaseId) {
      return;
    }
    if (!selectedDeployReadiness.hasExecutableCode) {
      message.warning(selectedDeployReadiness.message || '请先生成可执行代码后再部署');
      return;
    }
    if (deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment) {
      message.warning('请先完成一次 staging 成功部署，再发布到 prod');
      return;
    }
    if (!deployOverridesState.valid) {
      message.error(deployOverridesState.error);
      return;
    }

    deployMutation.mutate({
      id: deployTargetReleaseId,
      environment: deployEnvironment,
      strategy: deployStrategy,
      configOverrides: deployOverridesState.value,
    });
  };

  const handlePublishSkill = async (release: CapabilityRelease) => {
    try {
      let latestRelease = release;

      if (!latestRelease.currentSkillDraftId) {
        const draftResult = await capabilityReleaseApi.generateSkillDraft(release.id);
        message.success(`Skill 草案已生成: ${draftResult.skillDraft.name}`);
        latestRelease = draftResult.release;
      }

      if (
        latestRelease.approvalStatus !== 'approved' &&
        latestRelease.approvalStatus !== 'not_required'
      ) {
        const approveResult = await capabilityReleaseApi.approveRelease(release.id, {
          decision: 'approved',
          comment: 'Portal 自动审批通过',
        });
        message.success(`Release 已审批: ${approveResult.release.release.status}`);
        latestRelease = approveResult.release.release;
      }

      const publishResult = await capabilityReleaseApi.publishSkill(release.id);
      message.success(`Skill 发布成功: ${publishResult.publishedSkillId}`);
      if (wizardReleaseId === release.id) {
        setCreateWizardStep(3);
      }
      await refreshQueries(release.id);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '发布 Skill 失败';
      message.error(messageText);
    }
  };

  const handleWizardDeploy = () => {
    if (!wizardReleaseId) {
      return;
    }
    if (!wizardDeployReadiness.hasExecutableCode) {
      message.warning(wizardDeployReadiness.message || '请先生成可执行代码后再部署');
      return;
    }
    if (deployEnvironment === 'prod' && !wizardHasSuccessfulStagingDeployment) {
      message.warning('请先完成一次 staging 成功部署，再发布到 prod');
      return;
    }
    if (!deployOverridesState.valid) {
      message.error(deployOverridesState.error);
      return;
    }

    deployMutation.mutate({
      id: wizardReleaseId,
      environment: deployEnvironment,
      strategy: deployStrategy,
      configOverrides: deployOverridesState.value,
    });
  };

  const handleWizardValidate = async () => {
    if (!wizardReleaseId) {
      return;
    }
    const mergedCases = [
      ...wizardValidationCases,
      ...(wizardValidationUserInput.trim() ? [wizardValidationUserInput.trim()] : []),
    ].filter(Boolean);
    const dedupedCases = Array.from(new Set(mergedCases));
    if (dedupedCases.length === 0) {
      message.error('请至少填写一条自然语言测试用例（每行一条）');
      return;
    }
    await realValidateMutation.mutateAsync({
      id: wizardReleaseId,
      testCases: dedupedCases,
    });
  };

  const handleArchiveRelease = (releaseId: string) => {
    Modal.confirm({
      title: '删除 Capability Release',
      content: '删除后将归档当前 Release，列表中不再显示。是否继续？',
      okText: '删除',
      okButtonProps: { danger: true, loading: archiveReleaseMutation.isLoading },
      cancelText: '取消',
      onOk: async () => {
        await archiveReleaseMutation.mutateAsync({ id: releaseId });
      },
    });
  };

  const handleSaveSource = async () => {
    if (!selectedReleaseId) {
      return;
    }

    if (!sourcePayloadDraftState.valid) {
      message.error(sourcePayloadDraftState.error);
      return;
    }

    try {
      updateSourceMutation.mutate({
        id: selectedReleaseId,
        sourceName: sourceNameDraft.trim() || undefined,
        sourcePayload: sourcePayloadDraftState.value,
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(`源定义 JSON 解析失败: ${error.message}`);
        return;
      }
      message.error('源定义 JSON 解析失败');
    }
  };

  const resetSkillDraftEditor = () => {
    const draft = selectedDetail?.currentSkillDraft;
    if (!draft) {
      setIsEditingSkillDraft(false);
      return;
    }

    setSkillDraftName(draft.name || '');
    setSkillDraftDescription(draft.description || '');
    setSkillDraftTriggerKeywords(draft.triggerKeywords || []);
    setSkillDraftTools(draft.tools || []);
    setSkillDraftTemplateIds(draft.executionFlowTemplateIds || []);
    const parsedParamSchema = parseParamSchemaToDraft(draft.paramsSchema);
    setSkillDraftParamFields(parsedParamSchema.fields);
    setSkillDraftParamSchemaExtras(parsedParamSchema.extras);
    setSkillDraftApiEndpointFields(parseApiEndpointsToDraft(draft.apiEndpoints ?? null));
    setIsEditingSkillDraft(false);
  };

  const handleSaveSkillDraft = async () => {
    if (!selectedReleaseId || !selectedDetail?.currentSkillDraft) {
      return;
    }

    if (skillDraftParamFieldErrors.length > 0) {
      message.error(skillDraftParamFieldErrors[0]);
      return;
    }
    if (skillDraftApiEndpointErrors.length > 0) {
      message.error(skillDraftApiEndpointErrors[0]);
      return;
    }

    try {
      updateSkillDraftMutation.mutate({
        id: selectedReleaseId,
        payload: {
          name: skillDraftName.trim(),
          description: skillDraftDescription.trim(),
          triggerKeywords: skillDraftTriggerKeywords.map((item) => item.trim()).filter(Boolean),
          tools: skillDraftTools.map((item) => item.trim()).filter(Boolean),
          executionFlowTemplateIds: skillDraftTemplateIds
            .map((item) => item.trim())
            .filter(Boolean),
          paramsSchema: skillDraftParamsSchemaValue,
          apiEndpoints: skillDraftApiEndpointsValue,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        message.error(`Skill 草案 JSON 解析失败: ${error.message}`);
        return;
      }
      message.error('Skill 草案 JSON 解析失败');
    }
  };

  const addSkillDraftParamField = () => {
    setSkillDraftParamFields((current) => [
      ...current,
      {
        id: createParamFieldId(),
        name: '',
        type: 'string',
        description: '',
        required: false,
        defaultValue: '',
        extractionPrompt: '',
        enumValues: [],
      },
    ]);
  };

  const updateSkillDraftParamField = (id: string, patch: Partial<ParamSchemaFieldDraft>) => {
    setSkillDraftParamFields((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeSkillDraftParamField = (id: string) => {
    setSkillDraftParamFields((current) => current.filter((item) => item.id !== id));
  };

  const moveSkillDraftParamField = (id: string, direction: 'up' | 'down') => {
    setSkillDraftParamFields((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) {
        return current;
      }

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const studioContent = selectedDetail ? (
    <Row gutter={[16, 16]} align="top">
      <Col span={24}>
        {(hasSnapshotDrift || hasNoBuild || hasNoValidation) && (
          <Alert
            type="warning"
            showIcon
            message="Studio 下一步建议"
            description={
              <Text>
                {hasSnapshotDrift
                  ? '当前快照与最近一次工件绑定记录不一致，建议重新绑定。'
                  : hasNoBuild
                    ? '当前 Release 还没有工件绑定记录，建议先绑定已验证 Workflow artifact。'
                    : hasNoValidation
                      ? '当前 Release 还没有验证记录，建议完成验证。'
                      : '建议重新执行工件绑定检查与校验。'}
              </Text>
            }
            style={{ marginBottom: 16 }}
          />
        )}
      </Col>

      <Col span={12}>
        <Card
          size="small"
          title="源定义 / DSL 快照"
          extra={
            <Space>
              <Button
                size="small"
                type="link"
                icon={<EyeOutlined />}
                onClick={() => {
                  setJsonViewTitle('源定义 JSON');
                  setJsonViewData(selectedDetail.currentSourceSnapshot?.sourcePayload || {});
                  setJsonViewVisible(true);
                }}
              >
                详情
              </Button>
              <Button size="small" type="link" onClick={() => setIsEditingSource(true)}>
                编辑
              </Button>
            </Space>
          }
        >
          {isEditingSource ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Input
                placeholder="能力名称"
                value={sourceNameDraft}
                onChange={(event) => setSourceNameDraft(event.target.value)}
              />
              <TextArea
                rows={10}
                value={sourcePayloadDraft}
                onChange={(event) => setSourcePayloadDraft(event.target.value)}
                placeholder="请输入 sourcePayload JSON"
                spellCheck={false}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              {!sourcePayloadDraftState.valid && (
                <Alert type="error" showIcon message={sourcePayloadDraftState.error} />
              )}
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setIsEditingSource(false)}>
                  取消
                </Button>
                <Button
                  type="primary"
                  size="small"
                  disabled={!sourcePayloadDraftState.valid}
                  loading={updateSourceMutation.isLoading}
                  onClick={() => void handleSaveSource()}
                >
                  保存快照
                </Button>
              </Space>
            </Space>
          ) : (
            <div style={{ padding: '8px 0' }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="名称">
                  {selectedDetail.release.sourceName || '未命名能力'}
                </Descriptions.Item>
                <Descriptions.Item label="版本">
                  v{selectedDetail.currentSourceSnapshot?.snapshotVersion || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="类型">
                  {getSourceTypeLabel(selectedDetail.release.sourceType)}
                </Descriptions.Item>
              </Descriptions>
              <Text type="secondary" style={{ fontSize: 12 }}>
                包含核心逻辑定义、输入输出 Schema 及部署配置。
              </Text>
            </div>
          )}
        </Card>
      </Col>

      <Col span={12}>
        <Card
          size="small"
          title="Skill 设计草案"
          extra={
            selectedDetail.currentSkillDraft && (
              <Space>
                <Button
                  size="small"
                  type="link"
                  icon={<EyeOutlined />}
                  onClick={() => {
                    setJsonViewTitle('Skill 草案详情');
                    setJsonViewData(selectedDetail.currentSkillDraft?.draftPayload || {});
                    setJsonViewVisible(true);
                  }}
                >
                  详情
                </Button>
                <Button size="small" type="link" onClick={() => setIsEditingSkillDraft(true)}>
                  编辑
                </Button>
              </Space>
            )
          }
        >
          {selectedDetail.currentSkillDraft ? (
            isEditingSkillDraft ? (
              <div style={{ maxHeight: 500, overflowY: 'auto', paddingRight: 4 }}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="Skill Draft 职责"
                    description="description 只写业务说明；触发与匹配走 triggerKeywords / matchSummary；参数补充与校验说明放在运行时元数据里，不再塞进 description。"
                  />
                  <Input
                    placeholder="Skill 名称"
                    value={skillDraftName}
                    onChange={(event) => setSkillDraftName(event.target.value)}
                  />
                  <TextArea
                    rows={2}
                    placeholder="Skill 描述"
                    value={skillDraftDescription}
                    onChange={(event) => setSkillDraftDescription(event.target.value)}
                  />
                  <Select
                    mode="tags"
                    placeholder="触发词"
                    value={skillDraftTriggerKeywords}
                    onChange={(value) => setSkillDraftTriggerKeywords(value)}
                    style={{ width: '100%' }}
                  />
                  <ParamSchemaEditor
                    fields={skillDraftParamFields}
                    errors={skillDraftParamFieldErrors}
                    schemaPreview={skillDraftParamsSchemaValue}
                    onAddField={addSkillDraftParamField}
                    onRemoveField={removeSkillDraftParamField}
                    onMoveField={moveSkillDraftParamField}
                    onChangeField={updateSkillDraftParamField}
                  />
                  <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
                    <Button size="small" onClick={resetSkillDraftEditor}>
                      取消
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      disabled={skillDraftParamFieldErrors.length > 0}
                      loading={updateSkillDraftMutation.isLoading}
                      onClick={() => void handleSaveSkillDraft()}
                    >
                      保存草案
                    </Button>
                  </Space>
                </Space>
              </div>
            ) : (
              <div style={{ padding: '8px 0' }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="名称">
                    {selectedDetail.currentSkillDraft.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color="blue">{selectedDetail.currentSkillDraft.status}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="描述">
                    {selectedDetail.currentSkillDraft.description || '无'}
                  </Descriptions.Item>
                  <Descriptions.Item label="匹配摘要">
                    {typeof currentSkillDraftRuntimeMetadata.matchSummary === 'string'
                      ? currentSkillDraftRuntimeMetadata.matchSummary
                      : '无'}
                  </Descriptions.Item>
                  <Descriptions.Item label="触发词">
                    {selectedDetail.currentSkillDraft.triggerKeywords?.slice(0, 3).join(', ') ||
                      '无'}
                    {(selectedDetail.currentSkillDraft.triggerKeywords?.length || 0) > 3 && ' ...'}
                  </Descriptions.Item>
                  <Descriptions.Item label="参数补充情报">
                    {typeof currentSkillDraftRuntimeMetadata.paramCollectionGuidance === 'string'
                      ? currentSkillDraftRuntimeMetadata.paramCollectionGuidance
                      : '无'}
                  </Descriptions.Item>
                  <Descriptions.Item label="校验规则">
                    {typeof currentSkillDraftRuntimeMetadata.validationRules === 'string'
                      ? currentSkillDraftRuntimeMetadata.validationRules
                      : '无'}
                  </Descriptions.Item>
                </Descriptions>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  description 负责说明能力本身；参数补充情报与校验规则已拆到独立元数据，避免继续污染
                  skill match。
                </Text>
              </div>
            )
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Text type="secondary">暂无 Skill 草案</Text>
            </div>
          )}
        </Card>
      </Col>

      <Col span={24}>
        <Card
          size="small"
          title="Snapshot 对比 (版本演进)"
          extra={
            sourceSnapshots.length > 1 ? (
              <Space>
                <Button size="small" onClick={() => setShowOnlyDiff((current) => !current)}>
                  {showOnlyDiff ? '显示全部' : '只看差异'}
                </Button>
              </Space>
            ) : null
          }
        >
          {sourceSnapshots.length > 1 && leftSnapshot && rightSnapshot ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space wrap>
                <Select
                  style={{ width: 200 }}
                  size="small"
                  value={diffLeftSnapshotId || undefined}
                  onChange={(value) => setDiffLeftSnapshotId(value)}
                  options={sourceSnapshots.map((snapshot) => ({
                    label: `v${snapshot.snapshotVersion} (${new Date(snapshot.createdAt).toLocaleDateString()})`,
                    value: snapshot.id,
                  }))}
                />
                <Text type="secondary">对比</Text>
                <Select
                  style={{ width: 200 }}
                  size="small"
                  value={diffRightSnapshotId || undefined}
                  onChange={(value) => setDiffRightSnapshotId(value)}
                  options={sourceSnapshots.map((snapshot) => ({
                    label: `v${snapshot.snapshotVersion} (${new Date(snapshot.createdAt).toLocaleDateString()})`,
                    value: snapshot.id,
                  }))}
                />
                <Tag color="gold">变更 {snapshotDiffSummary.changed}</Tag>
                <Tag color="green">新增 {snapshotDiffSummary.added}</Tag>
                <Tag color="red">删除 {snapshotDiffSummary.removed}</Tag>
              </Space>

              <div
                style={{
                  maxHeight: 300,
                  overflowY: 'auto',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                }}
              >
                {visibleSnapshotDiffRows.length > 0 ? (
                  visibleSnapshotDiffRows.map((row) => (
                    <div
                      key={row.path}
                      onClick={() => {
                        setJsonViewTitle(`字段对比: ${row.path}`);
                        setJsonViewData({ left: row.leftValue, right: row.rightValue });
                        setJsonViewVisible(true);
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background:
                          row.status === 'changed'
                            ? 'rgba(245, 158, 11, 0.12)'
                            : row.status === 'added'
                              ? 'rgba(16, 185, 129, 0.12)'
                              : row.status === 'removed'
                                ? 'rgba(239, 68, 68, 0.12)'
                                : 'transparent',
                      }}
                    >
                      <Text code>{row.path}</Text>
                      <Tag
                        color={
                          row.status === 'changed'
                            ? 'gold'
                            : row.status === 'added'
                              ? 'green'
                              : row.status === 'removed'
                                ? 'red'
                                : 'default'
                        }
                      >
                        {row.status}
                      </Tag>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 16, textAlign: 'center' }}>
                    <Text type="secondary">无差异内容</Text>
                  </div>
                )}
              </div>
            </Space>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Text type="secondary">需要至少两个快照版本进行对比</Text>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  ) : null;

  const operationsContent = selectedDetail ? (
    <Row gutter={16} align="top">
      {['draft_ready', 'approved', 'published'].includes(selectedDetail.release.status) && (
        <Col span={24}>
          <Alert
            type="success"
            message="推荐操作：代码部署"
            description={
              <Space direction="vertical" size="small">
                <Text>当前 Release 已准备就绪，建议将其部署到测试环境进行最后的冒烟验证。</Text>
                {!selectedDeployReadiness.hasExecutableCode ? (
                  <Alert type="warning" showIcon message={selectedDeployReadiness.message} />
                ) : null}
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<RocketOutlined />}
                  disabled={!selectedDeployReadiness.hasExecutableCode}
                  onClick={() => openDeployModal(selectedDetail.release.id)}
                >
                  前往部署配置
                </Button>
              </Space>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
        </Col>
      )}
      <Col span={12}>
        <Card
          size="small"
          title="最近一次部署"
          extra={
            latestDeployment?.status === 'failed' && (
              <Button
                size="small"
                icon={<SafetyCertificateOutlined />}
                loading={analyzeFailureMutation.isLoading}
                onClick={() =>
                  analyzeFailureMutation.mutate({
                    id: selectedDetail.release.id,
                    recordId: latestDeployment.id,
                    recordType: 'deployment',
                  })
                }
              >
                AI 分析
              </Button>
            )
          }
        >
          {latestDeployment ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space wrap>
                <Tag color="blue">环境: {latestDeployment.environment}</Tag>
                <Tag color={statusColor(latestDeployment.status)}>{latestDeployment.status}</Tag>
                <Tag color="purple">{latestDeployment.runtimeType}</Tag>
                <Tag>策略: {latestDeployment.reloadStrategy || '无'}</Tag>
              </Space>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="制品">
                  {latestDeployment.artifactUri || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="回滚目标">
                  {latestDeployment.rollbackTargetReleaseId || '无'}
                </Descriptions.Item>
                <Descriptions.Item label="发起时间">
                  {latestDeployment.startedAt
                    ? new Date(latestDeployment.startedAt).toLocaleString()
                    : '无'}
                </Descriptions.Item>
                <Descriptions.Item label="完成时间">
                  {latestDeployment.finishedAt
                    ? new Date(latestDeployment.finishedAt).toLocaleString()
                    : '无'}
                </Descriptions.Item>
                {latestSmokeValidation && (
                  <Descriptions.Item label="Smoke Test">
                    {latestSmokeValidation.success ? '通过' : '失败'} / 分数{' '}
                    {latestSmokeValidation.score}
                  </Descriptions.Item>
                )}
              </Descriptions>
              <Space wrap>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => {
                    setJsonViewTitle('部署日志');
                    setJsonViewData(latestDeployment.logs);
                    setJsonViewVisible(true);
                  }}
                >
                  查看部署日志
                </Button>
                {latestSmokeValidation && (
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setJsonViewTitle('Smoke Test 日志');
                      setJsonViewData(latestSmokeValidation.logs);
                      setJsonViewVisible(true);
                    }}
                  >
                    查看 Smoke 日志
                  </Button>
                )}
              </Space>
            </Space>
          ) : (
            <Text type="secondary">暂无部署记录</Text>
          )}
        </Card>
      </Col>

      <Col span={12}>
        <Card
          size="small"
          title={
            <Space>
              <span>审计轨迹</span>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                (点击卡片查看详细 JSON)
              </Text>
            </Space>
          }
        >
          {latestAuditEvents.length > 0 ? (
            <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {latestAuditEvents.map((event) => (
                  <Card
                    key={event.id}
                    size="small"
                    hoverable
                    onClick={() => {
                      setSelectedAuditEvent(event);
                      setIsAuditModalVisible(true);
                    }}
                    style={{
                      borderLeft: `4px solid ${event.success ? 'var(--success-color)' : 'var(--error-color)'}`,
                      marginBottom: 8,
                    }}
                    styles={{ body: { padding: '8px 12px' } }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 'bold',
                            marginBottom: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {event.summary}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
                          {new Date(event.createdAt).toLocaleString()} ·{' '}
                          {event.actorName || 'System'}
                        </div>
                      </div>
                      <Tag color={event.success ? 'success' : 'error'} style={{ marginRight: 0 }}>
                        {event.eventType}
                      </Tag>
                    </div>
                  </Card>
                ))}
              </Space>
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <Text type="secondary">暂无审计事件</Text>
            </div>
          )}
        </Card>
      </Col>
    </Row>
  ) : null;

  if (isStudioMode) {
    return (
      <div>
        <Space
          style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
          align="start"
          wrap
        >
          <Space direction="vertical" size={4}>
            <Title level={4} style={{ margin: 0 }}>
              Capability Studio
            </Title>
            <Text type="secondary">
              面向设计与验证的独立工作台，聚焦源定义、构建、校验、草案生成与快照对比。
            </Text>
          </Space>
          <Space wrap>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/admin/capabilities')}>
              返回 Release 管理
            </Button>
            <Button
              disabled={!selectedDetail?.release.publishedSkillId}
              onClick={() =>
                selectedDetail?.release.publishedSkillId
                  ? navigate(
                      `/published-skills/${selectedDetail.release.publishedSkillId}?releaseId=${selectedDetail.release.id}`
                    )
                  : undefined
              }
            >
              查看 Published Skill
            </Button>
          </Space>
        </Space>

        <Card style={{ marginBottom: 16 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Select
              showSearch
              allowClear
              style={{ minWidth: 360 }}
              placeholder="选择要进入的 Release"
              value={selectedReleaseId || undefined}
              optionFilterProp="label"
              loading={releasesQuery.isLoading}
              onChange={(value) => {
                setSelectedReleaseId(value || null);
                setSearchParams(value ? { releaseId: value } : {});
              }}
              options={(releasesQuery.data?.releases || []).map((release) => ({
                value: release.id,
                label: `${release.sourceName || release.sourceId || '未命名能力'} · ${release.id.slice(0, 8)} · ${release.status}`,
              }))}
            />
            <Space wrap>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => refreshQueries(selectedReleaseId || undefined)}
              >
                刷新
              </Button>
              {selectedReleaseId ? (
                <Button
                  onClick={() => navigate(`/admin/capabilities?releaseId=${selectedReleaseId}`)}
                >
                  查看完整 Release
                </Button>
              ) : null}
            </Space>
          </Space>
        </Card>

        {selectedDetail ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card size="small">
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="Release ID">
                  {selectedDetail.release.id}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={statusColor(selectedDetail.release.status)}>
                    {selectedDetail.release.status}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="能力名称">
                  {selectedDetail.release.sourceName || '未命名'}
                </Descriptions.Item>
                <Descriptions.Item label="能力类型">
                  {getSourceTypeLabel(selectedDetail.release.sourceType)}
                </Descriptions.Item>
                <Descriptions.Item label="审批状态">
                  {selectedDetail.release.approvalStatus}
                </Descriptions.Item>
                <Descriptions.Item label="部署状态">
                  {selectedDetail.release.deploymentStatus}
                </Descriptions.Item>
              </Descriptions>
            </Card>
            {studioContent}
          </Space>
        ) : (
          <Card>
            <Text type="secondary">
              {releasesQuery.isLoading
                ? '正在加载 Release 列表...'
                : '请选择一个 Release 进入 Capability Studio。'}
            </Text>
          </Card>
        )}

        <Modal
          title="代码部署到 ops-temporal"
          open={deployVisible}
          onCancel={() => setDeployVisible(false)}
          onOk={handleDeploy}
          okText="开始代码部署"
          confirmLoading={deployMutation.isLoading}
          okButtonProps={{
            disabled:
              !deployOverridesState.valid ||
              (deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment),
          }}
          width={760}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap style={{ width: '100%' }}>
              <Select
                style={{ width: 180 }}
                value={deployEnvironment}
                onChange={(value) => setDeployEnvironment(value as DeploymentEnvironment)}
                options={DEPLOY_ENV_OPTIONS}
              />
              <Select
                style={{ width: 220 }}
                value={deployStrategy}
                onChange={(value) =>
                  setDeployStrategy(value as 'hot_reload' | 'rolling_restart' | 'full_restart')
                }
                options={[
                  { label: 'hot_reload', value: 'hot_reload' },
                  { label: 'rolling_restart', value: 'rolling_restart' },
                  { label: 'full_restart', value: 'full_restart' },
                ]}
              />
            </Space>

            <Card size="small" title={`环境 Profile 预览: ${deployEnvironment}`}>
              <pre style={{ ...studioPaneStyle, maxHeight: 200 }}>
                {JSON.stringify(activeDeployProfile, null, 2)}
              </pre>
            </Card>

            <TextArea
              rows={8}
              value={deployOverridesDraft}
              onChange={(event) => setDeployOverridesDraft(event.target.value)}
              placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
              spellCheck={false}
              style={{ fontFamily: 'monospace' }}
            />
            {!deployOverridesState.valid && (
              <Alert type="error" showIcon message={deployOverridesState.error} />
            )}
            {deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment ? (
              <Alert
                type="error"
                showIcon
                message="prod 发布门禁"
                description="当前 Release 尚无 staging 成功部署记录，不能直接发布到 prod。"
              />
            ) : null}
            <Text type="secondary">
              最终部署参数 = 当前环境 profile + 本次覆盖参数。profile 推荐放在
              `sourcePayload.deploymentProfiles` 下维护。
            </Text>
          </Space>
        </Modal>
      </div>
    );
  }

  const countsSource = releasesQuery.data?.releases || [];
  const stats = {
    entered: countsSource.filter((release) => canEnterReleaseCenter(release)).length,
    published: countsSource.filter((release) => Boolean(release.publishedSkillId)).length,
    deployed: countsSource.filter(
      (release) =>
        release.deploymentStatus === 'succeeded' ||
        release.deploymentStatus === 'deployed' ||
        release.status === 'deployed'
    ).length,
    visible: filteredReleases.length,
  };

  const capabilityOverviewStats = [
    {
      key: 'entered',
      label: '已进入发布中心',
      value: stats.entered,
      color: 'var(--text-primary)',
      icon: <RocketOutlined style={{ color: 'var(--primary-color)' }} />,
    },
    {
      key: 'published',
      label: '已发布 Skill',
      value: stats.published,
      color: 'var(--success-color)',
      icon: <SafetyCertificateOutlined style={{ color: 'var(--success-color)' }} />,
    },
    {
      key: 'deployed',
      label: '已部署版本',
      value: stats.deployed,
      color: 'var(--warning-color)',
      icon: <RocketOutlined style={{ color: 'var(--accent-color)' }} />,
    },
    {
      key: 'visible',
      label: '当前显示',
      value: stats.visible,
      color: 'var(--info-color)',
      icon: <SearchOutlined style={{ color: 'var(--info-color)' }} />,
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {capabilityOverviewStats.map((item) => (
          <Card
            key={item.key}
            size="small"
            style={{
              borderRadius: 14,
              border: '1px solid var(--bg-secondary)',
              boxShadow: 'var(--shadow-md)',
            }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Space size={10} align="center">
                <span style={{ display: 'inline-flex', fontSize: 16 }}>{item.icon}</span>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {item.label}
                </Text>
              </Space>
              <Text style={{ fontSize: 24, fontWeight: 700, color: item.color, lineHeight: 1 }}>
                {item.value}
              </Text>
            </div>
          </Card>
        ))}
      </div>

      <Card
        style={{
          borderRadius: 16,
          border: '1px solid var(--bg-secondary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <ListSectionHeader
          title={
            <Space wrap size={12}>
              <Text strong style={{ fontSize: 16 }}>
                流程发布列表
              </Text>
              <Input
                size="large"
                placeholder="搜索 Release / 能力名称 / 状态"
                prefix={<SearchOutlined />}
                variant="borderless"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                allowClear
                style={{
                  width: 360,
                  height: 44,
                  background: 'var(--bg-secondary)',
                  borderRadius: 12,
                }}
              />
              <Tooltip title="查看、筛选并管理能力发布的生命周期，包括构建、校验、部署及 Skill 发布。">
                <InfoCircleOutlined
                  style={{ color: 'var(--text-secondary)', fontSize: 14, cursor: 'help' }}
                />
              </Tooltip>
            </Space>
          }
          extra={
            <Space wrap size={12}>
              <Text type="secondary">当前显示 {filteredReleases.length} 条</Text>
              <Button
                size="large"
                icon={<ReloadOutlined />}
                onClick={() => refreshQueries(selectedReleaseId || undefined)}
                className="btn-pill"
              >
                刷新
              </Button>
              <Button
                size="large"
                type="primary"
                icon={<AppstoreAddOutlined />}
                onClick={openCreateWizard}
                className="btn-pill"
              >
                新建 Release
              </Button>
            </Space>
          }
        />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredReleases}
          loading={releasesQuery.isLoading}
          pagination={{ showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        />
      </Card>

      <Modal
        title="创建流程发布向导"
        open={createVisible}
        onCancel={resetCreateWizard}
        footer={null}
        width={960}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="4 步快速发布"
            description="按“基础信息 -> 部署 -> 发布 Skills -> 真实校验”顺序推进，每一步都会保留当前 Release 上下文。"
          />

          <Steps
            current={createWizardStep}
            items={[
              {
                title: '创建基础信息',
                description: wizardReleaseId
                  ? `已创建 ${wizardReleaseId.slice(0, 8)}`
                  : '填写源信息',
              },
              {
                title: '部署',
                description:
                  wizardRelease?.sourceType === 'execution_flow_template'
                    ? '模板型能力可按需跳过部署'
                    : wizardRelease?.sourceType === 'browser_recording'
                      ? '配置浏览器运行环境并执行回放部署'
                      : '配置运行环境与策略',
              },
              {
                title: '发布 Skills',
                description: wizardRelease?.publishedSkillId ? '已发布' : '生成并发布 Skill',
              },
              {
                title: '真实校验',
                description: wizardDetail?.validations?.length
                  ? '执行后可查看结果'
                  : '输入真实参数执行',
              },
            ]}
          />

          {createWizardStep === 0 ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card
                size="small"
                title="基础信息"
                style={{ borderRadius: 12 }}
                styles={{ body: { paddingBottom: 8 } }}
              >
                <Form form={createForm} layout="vertical">
                  <Form.Item
                    name="sourceType"
                    label="能力类型"
                    rules={[{ required: true, message: '请选择能力类型' }]}
                  >
                    <Select
                      options={SOURCE_TYPE_OPTIONS as unknown as { label: string; value: string }[]}
                    />
                  </Form.Item>
                  {createSourceType ? (
                    <Form.Item
                      name="sourceId"
                      label={
                        createSourceType === 'temporal_workflow'
                          ? '选择编排工作流'
                          : createSourceType === 'browser_recording'
                            ? '选择浏览器工作流'
                            : '选择模版'
                      }
                    >
                      <Select
                        allowClear
                        showSearch
                        loading={isCreateSourceLoading}
                        placeholder={
                          createSourceType === 'temporal_workflow'
                            ? '选择一个已验证的 Workflow artifact'
                            : createSourceType === 'browser_recording'
                              ? '选择一个浏览器工作流'
                              : '选择一个已有模版'
                        }
                        optionFilterProp="label"
                        options={createSourceOptions}
                        optionRender={(option) => {
                          const data = option.data as CapabilitySourceOption;
                          return (
                            <Space direction="vertical" size={0}>
                              <Text>{data.label}</Text>
                              {data.description ? (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {data.description}
                                </Text>
                              ) : null}
                            </Space>
                          );
                        }}
                      />
                    </Form.Item>
                  ) : null}
                  {createSourceType &&
                  !isCreateSourceLoading &&
                  createSourceOptions.length === 0 ? (
                    <Alert
                      style={{ marginBottom: 16 }}
                      type="warning"
                      showIcon
                      message={
                        createSourceType === 'temporal_workflow'
                          ? '当前没有可选的已验证 Workflow artifact'
                          : createSourceType === 'browser_recording'
                            ? '当前没有可选的浏览器工作流'
                            : '当前没有可选的模版'
                      }
                      description={
                        createSourceType === 'temporal_workflow'
                          ? '请先在 Workflow 页面完成“生成并保存代码”和“端到端验证”，再回来创建 Release。'
                          : createSourceType === 'browser_recording'
                            ? '请先在 Temporal 页面生成浏览器工作流后再回来。'
                            : '请先在模板页面创建后再回来。'
                      }
                    />
                  ) : null}
                  <Form.Item name="sourceName" label="显示名称">
                    <Input placeholder="可选。若不填，系统会自动从已选源推断" />
                  </Form.Item>
                  {createSourceType !== 'temporal_workflow' ? (
                    <>
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="源定义 JSON（可选）"
                        description="用于直接覆盖或补充当前 Release 的源快照，例如 deploymentProfiles、paramsSchema。"
                      />
                      <Form.Item name="sourcePayload" label="源定义 JSON">
                        <TextArea
                          rows={6}
                          placeholder='可选。直接贴 JSON，例如 {"name":"示例模版","deploymentProfiles":{"test":{}}}'
                        />
                      </Form.Item>
                    </>
                  ) : null}
                </Form>
              </Card>

              <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
                <Button onClick={resetCreateWizard}>取消</Button>
                <Button type="primary" loading={createMutation.isLoading} onClick={handleCreate}>
                  创建并进入部署
                </Button>
              </Space>
            </Space>
          ) : null}

          {createWizardStep === 1 ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card size="small" title="部署配置" style={{ borderRadius: 12 }}>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Release ID">
                    {wizardRelease?.id || wizardReleaseId}
                  </Descriptions.Item>
                  <Descriptions.Item label="能力类型">
                    {wizardRelease?.sourceType ? getSourceTypeLabel(wizardRelease.sourceType) : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="能力名称">
                    {wizardRelease?.sourceName || '未命名'}
                  </Descriptions.Item>
                  <Descriptions.Item label="当前状态">
                    {wizardRelease?.status || '-'}
                  </Descriptions.Item>
                </Descriptions>

                {wizardRelease?.sourceType === 'execution_flow_template' ? (
                  <Alert
                    type="success"
                    showIcon
                    message="模版型能力可按需跳过部署"
                    description="当前步骤可直接跳过，进入 Skills 发布。"
                    style={{ marginTop: 12 }}
                  />
                ) : (
                  <>
                    <Alert
                      type="info"
                      showIcon
                      message={
                        wizardRelease?.sourceType === 'browser_recording'
                          ? '这一步是在配置“浏览器运行部署”'
                          : '这一步是在配置“本次运行部署”'
                      }
                      description={
                        wizardRelease?.sourceType === 'browser_recording'
                          ? '建议先部署到 staging，并完成一次浏览器回放/冒烟验证，再推广到 prod。环境、策略、覆盖参数只影响本次部署记录。'
                          : '建议先部署到 staging 完成最终验证，再发布到 prod。环境、策略、覆盖参数只影响本次部署记录。'
                      }
                      style={{ marginTop: 12 }}
                    />
                    <Alert
                      type="warning"
                      showIcon
                      message={
                        wizardRelease?.sourceType === 'browser_recording'
                          ? '浏览器能力发布建议'
                          : '生产发布建议'
                      }
                      description={
                        wizardRelease?.sourceType === 'browser_recording'
                          ? 'prod 建议先小流量验证目标站点可达性、选择器稳定性与凭证有效期，确认无异常后再全量；保留回滚路径。'
                          : 'prod 建议使用 rolling_restart 并先小流量观察，确认无异常后再全量；保留回滚路径。'
                      }
                    />
                    {!wizardDeployReadiness.hasExecutableCode ? (
                      <Alert
                        type="error"
                        showIcon
                        message="缺少可执行代码"
                        description={wizardDeployReadiness.message}
                      />
                    ) : null}
                    <Space wrap style={{ width: '100%' }}>
                      <Select
                        style={{ width: 180 }}
                        value={deployEnvironment}
                        onChange={(value) => setDeployEnvironment(value as DeploymentEnvironment)}
                        options={DEPLOY_ENV_OPTIONS}
                      />
                      <Select
                        style={{ width: 220 }}
                        value={deployStrategy}
                        onChange={(value) =>
                          setDeployStrategy(
                            value as 'hot_reload' | 'rolling_restart' | 'full_restart'
                          )
                        }
                        options={[
                          { label: 'hot_reload', value: 'hot_reload' },
                          { label: 'rolling_restart', value: 'rolling_restart' },
                          { label: 'full_restart', value: 'full_restart' },
                        ]}
                      />
                      <Button
                        loading={wizardAssistMutation.isLoading}
                        disabled={!wizardReleaseId}
                        onClick={() =>
                          wizardReleaseId
                            ? wizardAssistMutation.mutate({
                                id: wizardReleaseId,
                                environment: deployEnvironment,
                              })
                            : undefined
                        }
                      >
                        AI 辅助设置
                      </Button>
                    </Space>

                    <Card
                      size="small"
                      title={`环境 Profile 预览: ${deployEnvironment}`}
                      extra={
                        <Text type="secondary">
                          说明：读取当前 Release 快照里该环境的默认部署参数
                        </Text>
                      }
                    >
                      <pre style={{ ...studioPaneStyle, maxHeight: 120 }}>
                        {JSON.stringify(wizardActiveDeployProfile, null, 2)}
                      </pre>
                    </Card>

                    {wizardAssistExplanation ? (
                      <Alert
                        type="success"
                        showIcon
                        message="AI 建议已生成"
                        description={wizardAssistExplanation}
                      />
                    ) : null}

                    <Alert
                      type="info"
                      showIcon
                      message="部署覆盖参数"
                      description="这里填写的是“本次部署额外覆盖”的 JSON。系统会将它与上面的环境默认参数合并，最终形成本次 deploy 实际使用的配置。"
                    />
                    <TextArea
                      rows={5}
                      value={deployOverridesDraft}
                      onChange={(event) => setDeployOverridesDraft(event.target.value)}
                      placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
                      spellCheck={false}
                      style={{ fontFamily: 'monospace' }}
                    />
                    {!deployOverridesState.valid ? (
                      <Alert type="error" showIcon message={deployOverridesState.error} />
                    ) : null}
                    {deployEnvironment === 'prod' && !wizardHasSuccessfulStagingDeployment ? (
                      <Alert
                        type="error"
                        showIcon
                        message="prod 发布门禁"
                        description="请先完成 staging 成功部署，再发布到 prod。"
                      />
                    ) : null}
                  </>
                )}
              </Card>

              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Button onClick={resetCreateWizard}>稍后继续</Button>
                {wizardRelease?.sourceType === 'execution_flow_template' ? (
                  <Button type="primary" onClick={() => setCreateWizardStep(2)}>
                    跳过部署，继续发布 Skills
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    loading={deployMutation.isLoading}
                    disabled={
                      !wizardDeployReadiness.hasExecutableCode ||
                      (deployEnvironment === 'prod' && !wizardHasSuccessfulStagingDeployment)
                    }
                    onClick={handleWizardDeploy}
                  >
                    部署到 {deployEnvironment}
                  </Button>
                )}
              </Space>
            </Space>
          ) : null}

          {createWizardStep === 2 ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card size="small" title="Skills 发布" style={{ borderRadius: 12 }}>
                <Alert
                  type="info"
                  showIcon
                  message="发布 Skills"
                  description="这里会自动串联“生成草案 -> 审批 -> 发布”，完成后进入真实校验。"
                  style={{ marginBottom: 12 }}
                />
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Release">
                    {wizardRelease?.sourceName || '未命名'}
                  </Descriptions.Item>
                  <Descriptions.Item label="部署状态">
                    {wizardRelease?.deploymentStatus || '未部署'}
                  </Descriptions.Item>
                  <Descriptions.Item label="审批状态">
                    {wizardRelease?.approvalStatus || '未审批'}
                  </Descriptions.Item>
                  <Descriptions.Item label="已发布 Skill">
                    {wizardRelease?.publishedSkillId || '尚未发布'}
                  </Descriptions.Item>
                </Descriptions>
                <Alert
                  type="success"
                  showIcon
                  message="发布策略说明"
                  description="每个 Release 发布都会新建一个新的托管 Skill，不会覆盖旧的 Skill；旧的 Skill 可被其他地方继续引用。"
                  style={{ marginTop: 12 }}
                />
              </Card>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Button onClick={resetCreateWizard}>稍后继续</Button>
                <Button
                  type="primary"
                  loading={
                    publishMutation.isLoading ||
                    generateDraftMutation.isLoading ||
                    approveMutation.isLoading
                  }
                  disabled={!wizardRelease}
                  onClick={() =>
                    wizardRelease ? void handlePublishSkill(wizardRelease) : undefined
                  }
                >
                  自动发布 Skills
                </Button>
              </Space>
            </Space>
          ) : null}

          {createWizardStep === 3 ? (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Card size="small" title="真实校验" style={{ borderRadius: 12 }}>
                <Alert
                  type="warning"
                  showIcon
                  message="真实校验"
                  description="请填入真实业务参数或自然语言测试语句，系统会执行真实校验并把结果写回当前 Release。"
                  style={{ marginBottom: 12 }}
                />
                <Space wrap>
                  <Button
                    loading={wizardAssistMutation.isLoading}
                    disabled={!wizardReleaseId}
                    onClick={() =>
                      wizardReleaseId
                        ? wizardAssistMutation.mutate({
                            id: wizardReleaseId,
                            environment: deployEnvironment,
                          })
                        : undefined
                    }
                  >
                    AI 辅助设置
                  </Button>
                  {wizardAssistExplanation ? (
                    <Text type="secondary">{wizardAssistExplanation}</Text>
                  ) : null}
                </Space>
                <TextArea
                  rows={4}
                  value={wizardValidationCasesDraft}
                  onChange={(event) => setWizardValidationCasesDraft(event.target.value)}
                  placeholder={
                    '自然语言测试用例（每行一条）\n例如：\n查询北京天气\n查询上海天气，格式json'
                  }
                  style={{ marginTop: 12 }}
                />
                <Text type="secondary">
                  已识别 {wizardValidationCases.length}{' '}
                  条用例；点击“开始真实校验”后会按顺序逐条执行。
                </Text>
                <Input
                  value={wizardValidationUserInput}
                  onChange={(event) => setWizardValidationUserInput(event.target.value)}
                  placeholder="可选：单条快速测试（会自动追加到上面多用例）"
                  style={{ marginTop: 12 }}
                  onPressEnter={(event) => {
                    const value = (event.target as HTMLInputElement).value.trim();
                    if (!value) return;
                    setWizardValidationCasesDraft((prev) =>
                      [prev, value].filter(Boolean).join('\n')
                    );
                    setWizardValidationUserInput('');
                  }}
                />
              </Card>
              {wizardValidationExecuted && wizardLatestValidation ? (
                <Card size="small" title="最近一次真实校验结果">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Text>结果：{wizardLatestValidation.success ? '通过' : '失败'}</Text>
                    <Text>
                      类型：{getValidationTypeLabel(wizardLatestValidation.validationType)}
                    </Text>
                    <Text>分数：{wizardLatestValidation.score}</Text>
                    {wizardLatestValidation.errorSummary ? (
                      <Alert
                        type="error"
                        showIcon
                        message="失败原因"
                        description={wizardLatestValidation.errorSummary}
                      />
                    ) : null}
                    {wizardValidationCaseResults.length > 0 ? (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        {wizardValidationCaseResults.map((item) => (
                          <Card
                            key={`${wizardLatestValidation.id}-${item.caseIndex}-${item.testUserInput}`}
                            size="small"
                            title={`Case ${item.caseIndex || '-'}：${item.testUserInput || '未命名用例'}`}
                          >
                            <Space direction="vertical" style={{ width: '100%' }}>
                              <Text>结果：{item.success ? '通过' : '失败'}</Text>
                              <Text>分数：{item.score}</Text>
                              {item.error ? (
                                <Alert
                                  type="error"
                                  showIcon
                                  message="失败原因"
                                  description={item.error}
                                />
                              ) : null}
                              <pre style={{ ...studioPaneStyle, maxHeight: 180 }}>
                                {item.logs.join('\n') || '暂无日志'}
                              </pre>
                            </Space>
                          </Card>
                        ))}
                      </Space>
                    ) : (
                      <pre style={{ ...studioPaneStyle, maxHeight: 220 }}>
                        {wizardLatestValidation.logs.join('\n') || '暂无日志'}
                      </pre>
                    )}
                    {!wizardLatestValidation.success ? (
                      <Button
                        size="small"
                        loading={analyzeFailureMutation.isLoading}
                        onClick={() =>
                          analyzeFailureMutation.mutate({
                            id: wizardReleaseId as string,
                            recordId: wizardLatestValidation.id,
                            recordType: 'validation',
                          })
                        }
                      >
                        AI 分析失败原因
                      </Button>
                    ) : null}
                  </Space>
                </Card>
              ) : null}
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Button onClick={resetCreateWizard}>完成并关闭</Button>
                <Button
                  type="primary"
                  loading={realValidateMutation.isLoading}
                  onClick={handleWizardValidate}
                >
                  开始真实校验
                </Button>
              </Space>
            </Space>
          ) : null}
        </Space>
      </Modal>

      <Modal
        title="代码部署到 ops-temporal"
        open={deployVisible}
        onCancel={() => setDeployVisible(false)}
        onOk={handleDeploy}
        okText="开始代码部署"
        confirmLoading={deployMutation.isLoading}
        okButtonProps={{
          disabled:
            !deployOverridesState.valid ||
            !selectedDeployReadiness.hasExecutableCode ||
            (deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment),
        }}
        width={760}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%' }}>
            <Select
              style={{ width: 180 }}
              value={deployEnvironment}
              onChange={(value) => setDeployEnvironment(value as DeploymentEnvironment)}
              options={[
                { label: 'dev', value: 'dev' },
                { label: 'test', value: 'test' },
                { label: 'staging', value: 'staging' },
                { label: 'prod', value: 'prod' },
              ]}
            />
            <Select
              style={{ width: 220 }}
              value={deployStrategy}
              onChange={(value) =>
                setDeployStrategy(value as 'hot_reload' | 'rolling_restart' | 'full_restart')
              }
              options={[
                { label: 'hot_reload', value: 'hot_reload' },
                { label: 'rolling_restart', value: 'rolling_restart' },
                { label: 'full_restart', value: 'full_restart' },
              ]}
            />
          </Space>

          <Card
            size="small"
            title={`环境 Profile 预览: ${deployEnvironment}`}
            extra={<Text type="secondary">说明：读取当前 Release 快照里该环境的默认部署参数</Text>}
          >
            <pre style={{ ...studioPaneStyle, maxHeight: 120 }}>
              {JSON.stringify(activeDeployProfile, null, 2)}
            </pre>
          </Card>

          <Alert
            type="info"
            showIcon
            message="部署覆盖参数"
            description="这里填写的是“本次部署额外覆盖”的 JSON。系统会将它与上面的环境默认参数合并，最终形成本次 deploy 实际使用的配置。"
          />
          {deployEnvironment === 'prod' ? (
            <Alert
              type="warning"
              showIcon
              message="当前为生产环境发布"
              description="建议先在 staging 完成最终验证；生产优先 rolling_restart，并准备好回滚目标。"
            />
          ) : null}
          <TextArea
            rows={5}
            value={deployOverridesDraft}
            onChange={(event) => setDeployOverridesDraft(event.target.value)}
            placeholder='部署覆盖参数 JSON，例如 {"taskQueue":"SKILL_STAGING_QUEUE","workerReload":true}'
            spellCheck={false}
            style={{ fontFamily: 'monospace' }}
          />
          {!deployOverridesState.valid && (
            <Alert type="error" showIcon message={deployOverridesState.error} />
          )}
          {deployEnvironment === 'prod' && !hasSuccessfulStagingDeployment ? (
            <Alert
              type="error"
              showIcon
              message="prod 发布门禁"
              description="当前 Release 尚无 staging 成功部署记录，不能直接发布到 prod。"
            />
          ) : null}
          {!selectedDeployReadiness.hasExecutableCode ? (
            <Alert
              type="error"
              showIcon
              message="缺少可执行代码"
              description={selectedDeployReadiness.message}
            />
          ) : null}
          <Text type="secondary">
            最终部署参数 = 当前环境 profile + 本次覆盖参数。profile 推荐放在
            `sourcePayload.deploymentProfiles` 下维护。
          </Text>
        </Space>
      </Modal>

      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: 'var(--primary-color)' }} />
            <span>AI 失败原因分析</span>
          </Space>
        }
        open={analysisVisible}
        onCancel={() => setAnalysisVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAnalysisVisible(false)}>
            关闭
          </Button>,
          analysisResult?.isParameterIssue && (
            <Button
              key="apply"
              type="primary"
              onClick={() => {
                if (analysisResult.suggestedParams) {
                  setDeployOverridesDraft(JSON.stringify(analysisResult.suggestedParams, null, 2));
                  setAnalysisVisible(false);
                  setDeployVisible(true);
                  message.success('已自动填入建议参数');
                }
              }}
            >
              应用建议参数并重试
            </Button>
          ),
        ]}
        width={700}
      >
        {analysisResult ? (
          <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
            <Alert
              type={analysisResult.isParameterIssue ? 'warning' : 'error'}
              message={analysisResult.explanation}
              description={analysisResult.suggestedAction}
              showIcon
            />
            <div style={{ marginTop: 16 }}>
              <Title level={5}>详细分析</Title>
              <div
                style={{
                  ...modalJsonPaneStyle,
                  padding: '12px 16px',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {analysisResult.analysis}
              </div>
            </div>
            {analysisResult.suggestedParams && (
              <div style={{ marginTop: 16 }}>
                <Title level={5}>建议参数 (JSON)</Title>
                <pre
                  style={{
                    ...modalJsonPaneStyle,
                    padding: 12,
                    maxHeight: 200,
                    overflow: 'auto',
                    margin: 0,
                  }}
                >
                  {JSON.stringify(analysisResult.suggestedParams, null, 2)}
                </pre>
              </div>
            )}
          </Space>
        ) : (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <ReloadOutlined spin style={{ fontSize: 24, marginBottom: 16 }} />
            <br />
            <Text type="secondary">AI 正在深度分析失败日志，请稍候...</Text>
          </div>
        )}
      </Modal>

      <Modal
        title={
          <Space>
            <EyeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>审计事件详情</span>
          </Space>
        }
        open={isAuditModalVisible}
        onCancel={() => setIsAuditModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setIsAuditModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={700}
      >
        {selectedAuditEvent ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="事件摘要" span={2}>
                {selectedAuditEvent.summary}
              </Descriptions.Item>
              <Descriptions.Item label="事件类型">
                <Tag color={selectedAuditEvent.success ? 'success' : 'error'}>
                  {selectedAuditEvent.eventType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="执行结果">
                {selectedAuditEvent.success ? '成功' : '失败'}
              </Descriptions.Item>
              <Descriptions.Item label="操作人">
                {selectedAuditEvent.actorName || 'System'}
              </Descriptions.Item>
              <Descriptions.Item label="执行时间">
                {new Date(selectedAuditEvent.createdAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>
            {selectedAuditEvent.details && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>详细信息 (JSON):</div>
                <pre
                  style={{
                    ...modalJsonPaneStyle,
                    padding: 12,
                    maxHeight: 400,
                    overflow: 'auto',
                    margin: 0,
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(selectedAuditEvent.details, null, 2)}
                </pre>
              </div>
            )}
          </Space>
        ) : null}
      </Modal>

      <Modal
        title={
          <Space>
            <EyeOutlined style={{ color: 'var(--primary-color)' }} />
            <span>{jsonViewTitle}</span>
          </Space>
        }
        open={jsonViewVisible}
        onCancel={() => setJsonViewVisible(false)}
        footer={[
          <Button key="close" onClick={() => setJsonViewVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        <pre
          style={{
            ...modalJsonPaneStyle,
            padding: 16,
            maxHeight: 600,
            overflow: 'auto',
            margin: 0,
            fontSize: 13,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {JSON.stringify(jsonViewData, null, 2)}
        </pre>
      </Modal>

      <Drawer
        title={
          <Space>
            <RocketOutlined />
            <span>{drawerMode === 'view' ? 'Release 详情' : 'Release 操作与编辑'}</span>
            <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 14 }}>
              {selectedDetail?.release.sourceName || selectedDetail?.release.id}
            </Text>
          </Space>
        }
        width={1200}
        open={Boolean(selectedReleaseId) && !createVisible}
        onClose={() => {
          setSelectedReleaseId(null);
          setDrawerMode(null);
          setSearchParams({});
        }}
        styles={{ body: { padding: '12px 24px' } }}
      >
        {selectedDetail ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions
              column={4}
              size="small"
              bordered
              items={[
                {
                  label: '状态',
                  children: (
                    <Tag color={statusColor(selectedDetail.release.status)}>
                      {selectedDetail.release.status}
                    </Tag>
                  ),
                },
                { label: '类型', children: getSourceTypeLabel(selectedDetail.release.sourceType) },
                { label: '审批', children: selectedDetail.release.approvalStatus },
                { label: '部署', children: selectedDetail.release.deploymentStatus || '未部署' },
              ]}
            />

            {drawerMode === 'view' ? (
              <Tabs
                size="small"
                activeKey={activeDetailTab}
                onChange={(key) => handleDetailTabChange(key as 'ops' | 'studio')}
                items={[
                  { key: 'studio', label: '设计详情 (Studio)', children: studioContent },
                  { key: 'ops', label: '运维详情', children: operationsContent },
                ]}
              />
            ) : (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Row gutter={[12, 12]}>
                  <Col span={6} style={{ display: 'flex' }}>
                    <Card
                      size="small"
                      hoverable
                      style={{ textAlign: 'center', width: '100%' }}
                      styles={{
                        body: {
                          minHeight: 130,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        },
                      }}
                    >
                      <SafetyCertificateOutlined
                        style={{ fontSize: 24, color: 'var(--primary-color)', marginBottom: 8 }}
                      />
                      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>1. 检查</div>
                      <Button
                        type="primary"
                        size="small"
                        ghost
                        loading={validateStaticMutation.isLoading}
                        onClick={() =>
                          validateStaticMutation.mutate({ id: selectedDetail.release.id })
                        }
                      >
                        静态校验
                      </Button>
                    </Card>
                  </Col>
                  <Col span={6} style={{ display: 'flex' }}>
                    <Card
                      size="small"
                      hoverable
                      style={{ textAlign: 'center', width: '100%' }}
                      styles={{
                        body: {
                          minHeight: 130,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        },
                      }}
                    >
                      <RocketOutlined
                        style={{ fontSize: 24, color: 'var(--success-color)', marginBottom: 8 }}
                      />
                      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>2. 重新部署</div>
                      <Button
                        type="primary"
                        size="small"
                        ghost
                        loading={deployMutation.isLoading}
                        disabled={!selectedDeployReadiness.hasExecutableCode}
                        onClick={() => openDeployModal(selectedDetail.release.id)}
                      >
                        代码部署
                      </Button>
                    </Card>
                  </Col>
                  <Col span={6} style={{ display: 'flex' }}>
                    <Card
                      size="small"
                      hoverable
                      style={{ textAlign: 'center', width: '100%' }}
                      styles={{
                        body: {
                          minHeight: 130,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        },
                      }}
                    >
                      <AppstoreAddOutlined
                        style={{ fontSize: 24, color: 'var(--accent-color)', marginBottom: 8 }}
                      />
                      <Tooltip title="将当前 Release 的设计（触发词、参数 Schema、API 端点）发布到 Skill Center。发布后，AI 即可通过这些配置识别并调用此能力。">
                        <div style={{ fontWeight: 'bold', marginBottom: 4, cursor: 'help' }}>
                          3. 发布 Skill <QuestionCircleOutlined style={{ fontSize: 12 }} />
                        </div>
                      </Tooltip>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Button
                          type="primary"
                          size="small"
                          ghost
                          loading={
                            publishMutation.isLoading ||
                            generateDraftMutation.isLoading ||
                            approveMutation.isLoading
                          }
                          onClick={() => void handlePublishSkill(selectedDetail.release)}
                        >
                          发布 Skill
                        </Button>
                        <Button
                          size="small"
                          type="link"
                          disabled={!selectedDetail.release.publishedSkillId}
                          loading={validateSkillMutation.isLoading}
                          onClick={() =>
                            selectedDetail.release.publishedSkillId
                              ? validateSkillMutation.mutate({
                                  skillId: selectedDetail.release.publishedSkillId,
                                })
                              : undefined
                          }
                          style={{ fontSize: 11 }}
                        >
                          质量评估 (AI 模拟)
                        </Button>
                      </Space>
                    </Card>
                  </Col>
                  <Col span={6} style={{ display: 'flex' }}>
                    <Card
                      size="small"
                      hoverable
                      style={{ textAlign: 'center', width: '100%' }}
                      styles={{
                        body: {
                          minHeight: 130,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        },
                      }}
                    >
                      <CheckCircleOutlined
                        style={{ fontSize: 24, color: 'var(--warning-color)', marginBottom: 8 }}
                      />
                      <Tooltip title="在隔离的 Sandbox 或连接真实插件环境执行测试用例，验证代码逻辑与环境集成是否正常。建议在发布到生产环境前完成此步骤。">
                        <div style={{ fontWeight: 'bold', marginBottom: 4, cursor: 'help' }}>
                          4. 验证 <QuestionCircleOutlined style={{ fontSize: 12 }} />
                        </div>
                      </Tooltip>
                      <Button
                        type="primary"
                        size="small"
                        ghost
                        onClick={() => {
                          setWizardReleaseId(selectedDetail.release.id);
                          setCreateWizardStep(3);
                          setCreateVisible(true);
                        }}
                      >
                        真实校验
                      </Button>
                    </Card>
                  </Col>
                </Row>

                <Tabs
                  size="small"
                  activeKey={activeDetailTab}
                  onChange={(key) => handleDetailTabChange(key as 'ops' | 'studio')}
                  items={[
                    { key: 'ops', label: '运维详情', children: operationsContent },
                    { key: 'studio', label: '设计详情 (Studio)', children: studioContent },
                  ]}
                />
              </Space>
            )}
          </Space>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <ReloadOutlined spin style={{ fontSize: 24, color: 'var(--primary-color)' }} />
            <div style={{ marginTop: 12, color: 'var(--text-light)' }}>正在加载详情...</div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default CapabilitiesPage;
