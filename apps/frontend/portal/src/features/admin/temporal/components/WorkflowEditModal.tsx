import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Card, Button, Input, Space, Tag, Typography, Modal, message, Form, Select,
  Divider, Alert, Collapse, Popconfirm, Row, Col, Timeline, Switch, Tooltip, InputNumber, Segmented, Drawer, Tabs, Checkbox
} from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, PlayCircleOutlined,
  ReloadOutlined, CodeOutlined, ApiOutlined, ThunderboltOutlined,
  CheckCircleOutlined, RobotOutlined, ExperimentOutlined, InfoCircleOutlined, SendOutlined
} from '@ant-design/icons';

import { useQuery, useMutation, useQueryClient } from 'react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import '@/features/chat/ChatMessage.css';
import {
  temporalWorkflowApi, TemporalWorkflowDTO, CreateTemporalWorkflowDTO,
  WorkflowDsl, ActivityDsl, TemporalValidationResult, DEFAULT_WORKFLOW_DSL, DEFAULT_ACTIVITY_DSL,
  WorkflowCodeResult, WorkflowCodeStreamEvent, WorkflowRealValidationResult, TemplateWorkflowDraft, TemporalWorkflowSourceTemplate, TemporalWorkflowSourceContext, HttpRequestOptimizeResult, HttpRequestPreviewResult, AiWorkflowDraft, AiWorkflowDraftSession, AiWorkflowDraftSessionListItem, AiWorkflowDraftSessionMessage, BrowserDraftCommandInput, WorkflowInputParamDefinition
} from '@/api/temporal';
import { carboneAPI, CarboneSkill, CarboneTemplate } from '@/api/carbone';
import { templateApi, Template } from '@/api/template';
import { activityApi } from '@/api/activity';
import { executionApi } from '@/api/execution';
import { normalizeExecutionResult } from '@/api/execution-normalizer';

const { Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const MAX_LOG_LINES = 1000;
type DurationUnit = 's' | 'm' | 'h';
type StepDurationField = 'startToCloseTimeout' | 'scheduleToCloseTimeout' | 'heartbeatTimeout';
type WorkflowDurationField = 'workflowExecutionTimeout' | 'workflowRunTimeout' | 'workflowTaskTimeout';
type ActivityResourceSource = 'builtin' | 'custom';
type HttpResponseMode = 'body' | 'full' | 'bodyPath' | 'bodyMap';
type TemplateModalMode = 'document' | 'browser';
const DEFAULT_DURATION_UNIT: DurationUnit = 's';
const HTTP_REQUEST_STEP_CONFIG_KEY = '__httpRequest';
const STRUCTURED_TRANSFORM_STEP_CONFIG_KEY = '__structuredTransform';
const DURATION_UNIT_OPTIONS = [
  { label: 'S', value: 's' },
  { label: 'M', value: 'm' },
  { label: 'H', value: 'h' },
];
const STEP_DURATION_DEFAULTS: Record<StepDurationField, string> = {
  startToCloseTimeout: '60s',
  scheduleToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
};
const PARAMETER_DESCRIPTION_PREVIEW_LIMIT = 120;

const SECTION_CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

const SECTION_CARD_BODY_STYLE: React.CSSProperties = {
  padding: 14,
};

const SOFT_PANEL_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  padding: 12,
  borderRadius: 10,
  background: 'var(--bg-card)',
};

const CONFIG_SECTION_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  padding: 12,
  marginBottom: 12,
};

const TWO_COLUMN_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

// 美化文本内容，处理连续换行
const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n') // 统一换行符
    .replace(/[ \t]+\n/g, '\n') // 去除行尾空格
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n') // 将3个及以上的连续换行替换为分割线
    .replace(/^[\s\n]+|[\s\n]+$/g, ''); // 去除首尾空白
};

const truncateText = (text: string, maxLength = PARAMETER_DESCRIPTION_PREVIEW_LIMIT): string => {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const DURATION_INPUT_WIDTH = 64;
const DURATION_SEGMENTED_WIDTH = 78;
const COLLAPSED_SIDEBAR_WIDTH = 44;
const RESOURCE_SIDEBAR_WIDTH = 260;
const STEPS_SIDEBAR_WIDTH = 320;

const parseDurationValue = (duration?: string): { value?: number; unit: DurationUnit } => {
  if (!duration) {
    return { value: undefined, unit: DEFAULT_DURATION_UNIT };
  }
  const trimmed = duration.trim();
  const explicitMatch = trimmed.match(/^(\d+)\s*([smh])$/i);
  if (explicitMatch) {
    return {
      value: Number(explicitMatch[1]),
      unit: explicitMatch[2].toLowerCase() as DurationUnit,
    };
  }
  const numberOnly = trimmed.match(/^(\d+)$/);
  if (numberOnly) {
    return {
      value: Number(numberOnly[1]),
      unit: DEFAULT_DURATION_UNIT,
    };
  }
  return { value: undefined, unit: DEFAULT_DURATION_UNIT };
};

const formatDurationValue = (value?: number | null, unit: DurationUnit = DEFAULT_DURATION_UNIT): string | undefined => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return `${Math.max(0, Number(value))}${unit}`;
};

const resolveApiErrorMessage = (error: unknown, fallback = '请求失败'): string => {
  const errorRecord = typeof error === 'object' && error !== null
    ? error as {
      message?: unknown;
      response?: {
        data?: {
          message?: unknown;
          code?: unknown;
          error?: unknown;
        };
      };
    }
    : undefined;
  const responseData = errorRecord?.response?.data;
  const messageText = typeof responseData?.message === 'string'
    ? responseData.message
    : typeof errorRecord?.message === 'string'
      ? errorRecord.message
      : fallback;
  const codeText = typeof responseData?.code === 'string'
    ? responseData.code
    : typeof responseData?.error === 'string'
      ? responseData.error
      : '';
  return codeText ? `${messageText} (${codeText})` : messageText;
};

const deriveWorkflowSourceTemplate = (
  workflowDsl?: WorkflowDsl | null,
  activityDsl?: ActivityDsl | null,
): TemporalWorkflowSourceTemplate | null => {
  const workflowDslRecord = workflowDsl as unknown as Record<string, unknown> | undefined;
  const workflowSource = workflowDslRecord && typeof workflowDslRecord.sourceTemplate === 'object'
    ? (workflowDsl as unknown as { sourceTemplate?: TemporalWorkflowSourceTemplate }).sourceTemplate
    : undefined;
  const workflowSourceContext = workflowDslRecord && typeof workflowDslRecord.sourceContext === 'object'
    ? (workflowDsl as unknown as { sourceContext?: TemporalWorkflowSourceContext }).sourceContext
    : undefined;
  const workflowSourceTemplate = workflowSourceContext?.sourceTemplate;
  const activities = Array.isArray(activityDsl?.activities) ? activityDsl.activities : [];
  const carboneActivity = activities.find((activity) => {
    if (activity?.handler === 'carbone') {
      return true;
    }
    const steps = Array.isArray(activity?.config?.steps) ? activity.config.steps : [];
    return steps.some((step: Record<string, any>) => step?.type === 'carbone');
  });
  const carboneStep = Array.isArray(carboneActivity?.config?.steps)
    ? carboneActivity?.config?.steps.find((step: Record<string, any>) => step?.type === 'carbone')
    : null;
  const sourceTemplate: TemporalWorkflowSourceTemplate = {
    templateId: workflowSource?.templateId || workflowSourceTemplate?.templateId || carboneStep?.config?.templateId || carboneActivity?.config?.templateId,
    skillId: workflowSource?.skillId || workflowSourceTemplate?.skillId || carboneActivity?.config?.skillId || undefined,
    fileName: workflowSource?.fileName || workflowSourceTemplate?.fileName || carboneActivity?.config?.fileName || undefined,
    format: workflowSource?.format || workflowSourceTemplate?.format || carboneStep?.config?.format || carboneActivity?.config?.format || undefined,
    variableCount: workflowSource?.variableCount || workflowSourceTemplate?.variableCount || carboneActivity?.config?.variableCount || Object.keys(workflowDsl?.inputParams || {}).length || undefined,
  };
  if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
    return null;
  }
  return sourceTemplate;
};

const deriveWorkflowSourceContext = (
  workflowDsl?: WorkflowDsl | null,
  activityDsl?: ActivityDsl | null,
): TemporalWorkflowSourceContext | null => {
  const workflowDslRecord = workflowDsl as unknown as Record<string, unknown> | undefined;
  const workflowSourceContext = workflowDslRecord && typeof workflowDslRecord.sourceContext === 'object'
    ? (workflowDsl as unknown as { sourceContext?: TemporalWorkflowSourceContext }).sourceContext
    : undefined;
  const sourceTemplate = deriveWorkflowSourceTemplate(workflowDsl, activityDsl);
  if (
    !workflowSourceContext?.sourceType
    && !workflowSourceContext?.referenceUrl
    && !workflowSourceContext?.userDescription
    && !workflowSourceContext?.generatedAt
    && !workflowSourceContext?.warnings?.length
    && !sourceTemplate
  ) {
    return null;
  }
  return {
    ...workflowSourceContext,
    sourceType: workflowSourceContext?.sourceType || (sourceTemplate ? 'template' : undefined),
    sourceTemplate: workflowSourceContext?.sourceTemplate || sourceTemplate,
  };
};

const buildWorkflowDraftSignature = (
  workflowDsl: WorkflowDsl,
  activityDsl: ActivityDsl,
  workflowName?: string,
): string => JSON.stringify({
  workflowDsl: {
    ...workflowDsl,
    name: workflowName || workflowDsl.name || '',
  },
  activityDsl,
});

interface HttpRequestStepConfig {
  method?: string;
  urlTemplate?: string;
  queryTemplate?: Record<string, string>;
  headersTemplate?: Record<string, string>;
  jsonTemplate?: Record<string, string>;
  dataTemplate?: Record<string, string>;
  timeout?: number;
  responseMode?: HttpResponseMode;
  responseBodyPath?: string;
  responseFieldMappings?: Record<string, string>;
}

type StructuredTransformContentType = 'text' | 'html' | 'json';
type StructuredTransformOutputMode = 'json' | 'text';

interface StructuredTransformStepConfig {
  contentType?: StructuredTransformContentType;
  contentTemplate?: string;
  instructionTemplate?: string;
  outputMode?: StructuredTransformOutputMode;
  outputSchema?: Record<string, any>;
  contextTemplate?: string;
  fieldMappings?: Record<string, string>;
  textTemplate?: string;
}

const DEFAULT_HTTP_REQUEST_STEP_CONFIG: HttpRequestStepConfig = {
  method: 'GET',
  urlTemplate: '',
  queryTemplate: {},
  headersTemplate: {},
  jsonTemplate: {},
  dataTemplate: {},
  timeout: 30,
  responseMode: 'body',
  responseBodyPath: '',
  responseFieldMappings: {},
};

const DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG: StructuredTransformStepConfig = {
  contentType: 'text',
  contentTemplate: '',
  instructionTemplate: '',
  outputMode: 'json',
  outputSchema: {},
  contextTemplate: '',
  fieldMappings: {},
  textTemplate: '',
};

const asPlainRecord = (value: unknown): Record<string, any> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const getStepInputPublicEntries = (step?: WorkflowDsl['steps'][number]): Array<[string, any]> => (
  Object.entries(step?.input || {}).filter(([key]) => key !== 'timeout' && !key.startsWith('__'))
);

const collectTemplateVariablesFromValue = (value: unknown, target: Set<string> = new Set<string>()): Set<string> => {
  if (typeof value === 'string') {
    Array.from(value.matchAll(/\{([^{}]+)\}/g)).forEach((match) => {
      const variable = String(match[1] || '').trim();
      if (variable) {
        target.add(variable);
      }
    });
    return target;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTemplateVariablesFromValue(item, target));
    return target;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectTemplateVariablesFromValue(item, target));
  }
  return target;
};

const normalizeWorkflowInputParamMap = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
): Record<string, WorkflowInputParamDefinition> => {
  if (!inputParams || typeof inputParams !== 'object') {
    return {};
  }
  return Object.entries(inputParams).reduce<Record<string, WorkflowInputParamDefinition>>((acc, [rawKey, value]) => {
    const key = String(rawKey || '').trim();
    if (!key) {
      return acc;
    }
    acc[key] = {
      description: typeof value?.description === 'string' ? value.description : '',
      required: value?.required === true,
      defaultValue: value?.defaultValue === undefined || value?.defaultValue === null ? '' : String(value.defaultValue),
      source: value?.source,
      type: value?.type,
      exampleValue: value?.exampleValue,
      displayName: typeof value?.displayName === 'string' ? value.displayName : '',
      groupLabel: typeof value?.groupLabel === 'string' ? value.groupLabel : '',
      paramKind: value?.paramKind,
      arrayPath: typeof value?.arrayPath === 'string' ? value.arrayPath : '',
      fieldName: typeof value?.fieldName === 'string' ? value.fieldName : '',
    };
    return acc;
  }, {});
};

const normalizeActivityInputParams = (
  inputParams: unknown
): Array<{ key: string; value: string; required: boolean }> => {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams.map((item: any) => ({
      key: item?.key || '',
      value: item?.value || '',
      required: Boolean(item?.required),
    }));
  }
  if (typeof inputParams === 'object') {
    return Object.entries(inputParams as Record<string, any>).map(([key, value]) => ({
      key,
      value: value || '',
      required: !value,
    }));
  }
  return [];
};

const buildWorkflowInputParamsFromActivityDsl = (
  activityDsl?: ActivityDsl,
): Record<string, WorkflowInputParamDefinition> => {
  const merged: Record<string, WorkflowInputParamDefinition> = {};
  (activityDsl?.activities || []).forEach((activity) => {
    const config = activity?.config as Record<string, any> | undefined;
    const steps = Array.isArray(config?.steps) ? config.steps : [];
    steps.forEach((step) => {
      normalizeActivityInputParams((step as Record<string, any>)?.inputParams).forEach((param) => {
        const key = String(param.key || '').trim();
        if (!key || merged[key]) {
          return;
        }
        merged[key] = {
          description: '',
          required: param.required,
          defaultValue: param.value || '',
          paramKind: key.includes('[].') ? 'array' : 'scalar',
          arrayPath: key.includes('[].') ? String(key).split('[].')[0] + '[]' : '',
          fieldName: key.includes('[].') ? String(key).split('[].')[1] || key : key,
        };
      });
    });
  });
  return merged;
};

const mergeWorkflowInputParamMaps = (
  preferred?: Record<string, WorkflowInputParamDefinition>,
  fallback?: Record<string, WorkflowInputParamDefinition>,
): Record<string, WorkflowInputParamDefinition> => {
  const base = normalizeWorkflowInputParamMap(fallback);
  const overlay = normalizeWorkflowInputParamMap(preferred);
  const mergedKeys = Array.from(new Set([
    ...Object.keys(base),
    ...Object.keys(overlay),
  ]));
  return mergedKeys.reduce<Record<string, WorkflowInputParamDefinition>>((acc, key) => {
    const fallbackValue = base[key] || {};
    const preferredValue = overlay[key] || {};
    acc[key] = {
      ...fallbackValue,
      ...preferredValue,
      description: preferredValue.description || fallbackValue.description || '',
      required: preferredValue.required ?? fallbackValue.required ?? false,
      defaultValue: preferredValue.defaultValue ?? fallbackValue.defaultValue ?? '',
      source: preferredValue.source ?? fallbackValue.source,
      type: preferredValue.type ?? fallbackValue.type,
      exampleValue: preferredValue.exampleValue ?? fallbackValue.exampleValue,
      displayName: preferredValue.displayName || fallbackValue.displayName || '',
      groupLabel: preferredValue.groupLabel || fallbackValue.groupLabel || '',
      paramKind: preferredValue.paramKind ?? fallbackValue.paramKind,
      arrayPath: preferredValue.arrayPath || fallbackValue.arrayPath || '',
      fieldName: preferredValue.fieldName || fallbackValue.fieldName || '',
    };
    return acc;
  }, {});
};

const withNormalizedWorkflowInputParams = (
  workflowDsl: WorkflowDsl,
  activityDsl?: ActivityDsl,
): WorkflowDsl => {
  const mergedInputParams = mergeWorkflowInputParamMaps(
    workflowDsl?.inputParams,
    buildWorkflowInputParamsFromActivityDsl(activityDsl),
  );
  if (Object.keys(mergedInputParams).length === 0) {
    return workflowDsl.inputParams ? { ...workflowDsl, inputParams: {} } : workflowDsl;
  }
  return {
    ...workflowDsl,
    inputParams: mergedInputParams,
  };
};

const normalizeWorkflowSkillParamKey = (name: unknown): string => (
  String(name || '')
    .trim()
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .replace(/^#/, '')
    .replace(/^\//, '')
    .replace(/^d\./, '')
    .trim()
);

const buildWorkflowInputParamMapFromSkill = (
  skill?: CarboneSkill | null,
): Record<string, Partial<WorkflowInputParamDefinition>> => {
  const parameters = Array.isArray(skill?.parameters) ? skill.parameters : [];
  return parameters.reduce<Record<string, Partial<WorkflowInputParamDefinition>>>((acc, rawParameter) => {
    const parameter = (rawParameter || {}) as Record<string, unknown>;
    const key = normalizeWorkflowSkillParamKey(parameter.name);
    if (!key || acc[key]) {
      return acc;
    }
    const arrayMatch = key.match(/^(.+\[\])\.(.+)$/);
    acc[key] = {
      description: typeof parameter.usage === 'string' ? parameter.usage : '',
      displayName: typeof parameter.displayName === 'string' ? parameter.displayName : '',
      groupLabel: [
        parameter.groupLabel,
        parameter.sheetName,
        parameter.chapter,
        parameter.section,
        parameter.group,
      ].find((value) => typeof value === 'string' && value.trim()) as string | undefined,
      paramKind: arrayMatch ? 'array' : 'scalar',
      arrayPath: arrayMatch?.[1] || '',
      fieldName: arrayMatch?.[2] || key,
    };
    return acc;
  }, {});
};

const enrichWorkflowInputParamsWithSkill = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
  skill?: CarboneSkill | null,
): Record<string, WorkflowInputParamDefinition> => {
  const normalizedInputParams = normalizeWorkflowInputParamMap(inputParams);
  if (Object.keys(normalizedInputParams).length === 0) {
    return normalizedInputParams;
  }
  const skillParamMap = buildWorkflowInputParamMapFromSkill(skill);
  return Object.entries(normalizedInputParams).reduce<Record<string, WorkflowInputParamDefinition>>((acc, [key, value]) => {
    const metadata = skillParamMap[key] || {};
    acc[key] = {
      ...value,
      description: value.description || metadata.description || '',
      displayName: value.displayName || metadata.displayName || '',
      groupLabel: value.groupLabel || metadata.groupLabel || '',
      paramKind: value.paramKind || metadata.paramKind || (key.includes('[].') ? 'array' : 'scalar'),
      arrayPath: value.arrayPath || metadata.arrayPath || (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
      fieldName: value.fieldName || metadata.fieldName || (key.includes('[].') ? (key.split('[].')[1] || key) : key),
    };
    return acc;
  }, {});
};

type GroupedWorkflowInputParams = {
  key: string;
  label: string;
  scalarEntries: Array<[string, WorkflowInputParamDefinition]>;
  arrayGroups: Array<{
    arrayPath: string;
    entries: Array<[string, WorkflowInputParamDefinition]>;
  }>;
};

const groupWorkflowInputParams = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
): GroupedWorkflowInputParams[] => {
  const groupMap = new Map<string, GroupedWorkflowInputParams>();
  const entries = Object.entries(inputParams || {});

  entries.forEach(([key, param]) => {
    const explicitLabel = String(param.groupLabel || '').trim();
    const groupLabel = explicitLabel || '参数';
    const existing = groupMap.get(groupLabel) || {
      key: groupLabel,
      label: groupLabel,
      scalarEntries: [],
      arrayGroups: [],
    };

    const isArray = (param.paramKind === 'array') || key.includes('[].');
    if (!isArray) {
      existing.scalarEntries.push([key, param]);
      groupMap.set(groupLabel, existing);
      return;
    }

    const arrayPath = String(param.arrayPath || '').trim() || `${key.split('[].')[0]}[]`;
    const arrayGroup = existing.arrayGroups.find((item) => item.arrayPath === arrayPath);
    if (arrayGroup) {
      arrayGroup.entries.push([key, param]);
    } else {
      existing.arrayGroups.push({
        arrayPath,
        entries: [[key, param]],
      });
    }

    groupMap.set(groupLabel, existing);
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      scalarEntries: group.scalarEntries.sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN')),
      arrayGroups: group.arrayGroups
        .map((arrayGroup) => ({
          ...arrayGroup,
          entries: arrayGroup.entries.sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN')),
        }))
        .sort((a, b) => a.arrayPath.localeCompare(b.arrayPath, 'zh-Hans-CN')),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
};

const extractTemplatePlaceholders = (template: string): string[] => (
  Array.from(String(template || '').matchAll(/\{([^{}]+)\}/g))
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean)
);

const collectContextReferenceKeys = (fieldMappings: Record<string, any>): string[] => (
  Object.values(fieldMappings || {})
    .filter((value): value is string => typeof value === 'string')
    .map((value) => String(value || '').trim().match(/^context\.([^.\s]+)$/)?.[1] || '')
    .filter(Boolean)
);

const hasUsableContextTemplate = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
};

const normalizeValidationInputValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const collectLeafPaths = (
  value: unknown,
  prefix = '',
  acc: Array<{ path: string; value: unknown }> = [],
  depth = 0,
): Array<{ path: string; value: unknown }> => {
  if (depth > 6) {
    return acc;
  }
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item, index) => {
      const nextPath = prefix ? `${prefix}.${index}` : String(index);
      collectLeafPaths(item, nextPath, acc, depth + 1);
    });
    return acc;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).slice(0, 20).forEach(([key, item]) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      collectLeafPaths(item, nextPath, acc, depth + 1);
    });
    return acc;
  }
  if (prefix) {
    acc.push({ path: prefix, value });
  }
  return acc;
};

const unwrapValidationResultPayload = (value: unknown): unknown => {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return current;
    }
    const record = current as Record<string, unknown>;
    if (!('result' in record)) {
      return current;
    }
    const hasExecutionEnvelope = ['success', 'error', 'logs', 'traceback', 'score'].some((key) => key in record);
    if (!hasExecutionEnvelope) {
      return current;
    }
    current = record.result;
  }
  return current;
};

const extractHttpPreviewBody = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const looksLikeHttpPreview = 'body' in record && (
    'statusCode' in record
    || 'headers' in record
    || 'ok' in record
    || 'text' in record
    || 'url' in record
  );
  return looksLikeHttpPreview ? record.body : value;
};

const getStringRecordField = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
};

interface RealValidationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowRealValidationResult | null;
  inputParams: Record<string, string>; // 用户输入的参数值
}

interface CodeGenerationState {
  visible: boolean;
  isStreaming: boolean;
  logs: string[];
  result: WorkflowCodeResult | null;
}

interface WorkflowSelectableActivity {
  id: string;
  source: ActivityResourceSource;
  ref: string;
  name: string;
  fn: string;
  timeout: string;
  retryPolicy?: { maxRetries?: number; backoffMs?: number } | null;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode?: string;
  isActive: boolean;
  readonly?: boolean;
  version?: string;
  description?: string;
}

type RealValidationAction =
  | { type: 'START' }
  | { type: 'OPEN'; payload?: Record<string, string> }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowRealValidationResult }
  | { type: 'SET_INPUT_PARAMS'; payload: Record<string, string> }
  | { type: 'CLOSE' };

type CodeGenerationAction =
  | { type: 'START' }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_RESULT'; payload: WorkflowCodeResult }
  | { type: 'CLOSE' };

const initialRealValidationState: RealValidationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
  inputParams: {},
};

const initialCodeGenerationState: CodeGenerationState = {
  visible: false,
  isStreaming: false,
  logs: [],
  result: null,
};

const realValidationReducer = (state: RealValidationState, action: RealValidationAction): RealValidationState => {
  switch (action.type) {
    case 'START':
      return {
        ...state,
        visible: true,
        isStreaming: true,
        logs: [],
        result: null,
      };
    case 'OPEN':
      return {
        ...state,
        visible: true,
        inputParams: action.payload || {},
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_RESULT':
      return {
        ...state,
        isStreaming: false,
        result: action.payload,
      };
    case 'SET_INPUT_PARAMS':
      return {
        ...state,
        inputParams: action.payload,
      };
    case 'CLOSE':
      return {
        ...initialRealValidationState,
      };
    default:
      return state;
  }
};

const codeGenerationReducer = (state: CodeGenerationState, action: CodeGenerationAction): CodeGenerationState => {
  switch (action.type) {
    case 'START':
      return {
        visible: true,
        isStreaming: true,
        logs: [],
        result: null,
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_RESULT':
      return {
        ...state,
        isStreaming: false,
        result: action.payload,
      };
    case 'CLOSE':
      return {
        ...initialCodeGenerationState,
      };
    default:
      return state;
  }
};

export const WorkflowEditModal: React.FC<WorkflowEditModalProps> = ({
  visible,
  onCancel,
  onSave,
  initialWorkflow,
  initialDraftDsl,
  loading,
  openTemplatePickerOnOpen = false,
  initialTemplatePickerMode = 'document',
}: WorkflowEditModalProps) => {

        useEffect(() => {
            if (visible) {
                if (initialWorkflow) {
                    // handleEdit logic
                    setEditingWorkflow(initialWorkflow);
                    didInitializeCodeSignatureRef.current = false;
                    form.setFieldsValue({ name: initialWorkflow.name, description: initialWorkflow.description, taskQueue: initialWorkflow.taskQueue });
                    setWorkflowDsl(initialWorkflow.workflowDsl || DEFAULT_WORKFLOW_DSL);
                    setActivityDsl(initialWorkflow.activityDsl || DEFAULT_ACTIVITY_DSL);
                    setGeneratedCode(initialWorkflow.generatedCode || null);
                    setLastGeneratedSignature(null);
                    setIsGeneratedCodeStale(false);
                    setSelectedStepIndexForConfig((initialWorkflow.workflowDsl?.steps?.length) ? 0 : null);
                } else if (initialDraftDsl) {
                    // Draft initialization
                    setEditingWorkflow(null);
                    didInitializeCodeSignatureRef.current = false;
                    form.resetFields();
                    setWorkflowDsl(initialDraftDsl.workflowDsl || DEFAULT_WORKFLOW_DSL);
                    setActivityDsl(initialDraftDsl.activityDsl || DEFAULT_ACTIVITY_DSL);
                    setGeneratedCode(null);
                    setLastGeneratedSignature(null);
                    setIsGeneratedCodeStale(false);
                    setSelectedStepIndexForConfig(initialDraftDsl.workflowDsl?.steps?.length ? 0 : null);
                } else {
                    // handleCreate logic
                    setEditingWorkflow(null);
                    didInitializeCodeSignatureRef.current = false;
                    form.resetFields();
                    setWorkflowDsl(DEFAULT_WORKFLOW_DSL);
                    setActivityDsl(DEFAULT_ACTIVITY_DSL);
                    setGeneratedCode(null);
                    setLastGeneratedSignature(null);
                    setIsGeneratedCodeStale(false);
                    setSelectedStepIndexForConfig(null);
                }
            }
        }, [visible, initialWorkflow, initialDraftDsl]);
        
  // const { t } = useTranslation(['admin']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [selectedWorkflow] = useState<TemporalWorkflowDTO | null>(null);
  const [validationResult, setValidationResult] = useState<TemporalValidationResult | null>(null);
  const [workflowDsl, setWorkflowDsl] = useState<WorkflowDsl>(DEFAULT_WORKFLOW_DSL);
  const [activityDsl, setActivityDsl] = useState<ActivityDsl>(DEFAULT_ACTIVITY_DSL);
  const [selectActivityModalVisible, setSelectActivityModalVisible] = useState(false);
  const [selectingStepIndex, setSelectingStepIndex] = useState<number | null>(null);
  const [selectedStepIndexForConfig, setSelectedStepIndexForConfig] = useState<number | null>(null);
  const [stepConfigActiveKeys, setStepConfigActiveKeys] = useState<string[]>([
    'execution-control',
    'activity-input',
    'result-processing',
  ]);
  const [httpAiOptimizePrompts, setHttpAiOptimizePrompts] = useState<Record<string, string>>({});
  const [httpAiPreviewResponses, setHttpAiPreviewResponses] = useState<Record<string, Record<string, any>>>({});
  const [httpAiResolvedRequests, setHttpAiResolvedRequests] = useState<Record<string, Record<string, any>>>({});
  const [httpAiSuggestedConfigs, setHttpAiSuggestedConfigs] = useState<Record<string, Record<string, any>>>({});
  const [httpAiSuggestedJsonDrafts, setHttpAiSuggestedJsonDrafts] = useState<Record<string, string>>({});
  const [httpAiExplanations, setHttpAiExplanations] = useState<Record<string, string>>({});
  const [httpAiErrors, setHttpAiErrors] = useState<Record<string, string>>({});
  const [httpAiApplySummaries, setHttpAiApplySummaries] = useState<Record<string, string[]>>({});
  const [httpAiSelectedLeafPaths, setHttpAiSelectedLeafPaths] = useState<Record<string, string[]>>({});
  const [httpAiLeafAliases, setHttpAiLeafAliases] = useState<Record<string, Record<string, string>>>({});
  const [activeHttpAiStepId, setActiveHttpAiStepId] = useState<string | null>(null);
  const [resourceSidebarCollapsed, setResourceSidebarCollapsed] = useState(false);
  const [stepsSidebarCollapsed, setStepsSidebarCollapsed] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [lastGeneratedSignature, setLastGeneratedSignature] = useState<string | null>(null);
  const [isGeneratedCodeStale, setIsGeneratedCodeStale] = useState(false);
  const [forceAiGeneration, setForceAiGeneration] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [codeGenerationState, dispatchCodeGeneration] = useReducer(codeGenerationReducer, initialCodeGenerationState);
  const [realValidationState, dispatchRealValidation] = useReducer(realValidationReducer, initialRealValidationState);
  const [realValidationInputParams, setRealValidationInputParams] = useState<Record<string, string>>({}); // 真实验证时的输入参数
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
  const [creatingExecutionWorkflowId, setCreatingExecutionWorkflowId] = useState<string | null>(null);
  const [aiDraftDrawerVisible, setAiDraftDrawerVisible] = useState(false);
  const [applyDraftConfirmVisible, setApplyDraftConfirmVisible] = useState(false);
  const [aiDraftSessionId, setAiDraftSessionId] = useState<string | null>(null);
  const [aiDraftMessages, setAiDraftMessages] = useState<AiWorkflowDraftSessionMessage[]>([]);
  const [aiDraftInput, setAiDraftInput] = useState('');
  const [currentAiDraft, setCurrentAiDraft] = useState<AiWorkflowDraft | null>(null);
  const [aiDraftDescription, setAiDraftDescription] = useState('');
  const [aiDraftReferenceUrl, setAiDraftReferenceUrl] = useState('');
  const [structuredTransformSchemaDrafts, setStructuredTransformSchemaDrafts] = useState<Record<string, string>>({});
  const [structuredTransformSchemaErrors, setStructuredTransformSchemaErrors] = useState<Record<string, string>>({});
  const didInitializeCodeSignatureRef = useRef(false);
  const watchedWorkflowName = Form.useWatch('name', form);
  const aiDraftSessionsQuery = useQuery(
    ['temporal-draft-sessions'],
    () => temporalWorkflowApi.listAiDraftSessions(),
    { enabled: aiDraftDrawerVisible },
  );
  const activitiesQuery = useQuery('activities', () => activityApi.list());
  const builtinActivitiesQuery = useQuery('builtin-activities', () => activityApi.listBuiltin());
  const activityResources = useMemo<WorkflowSelectableActivity[]>(() => {
    const customResources = (activitiesQuery.data || [])
      .filter((activity) => activity.isActive)
      .map((activity) => ({
        id: activity.id,
        source: 'custom' as const,
        ref: `custom:${activity.id}`,
        name: activity.name,
        fn: activity.fn,
        timeout: activity.timeout,
        retryPolicy: activity.retryPolicy,
        handler: activity.handler,
        config: activity.config || {},
        generatedCode: activity.generatedCode,
        isActive: activity.isActive,
        readonly: false,
      }));

    const builtinResources = (builtinActivitiesQuery.data || []).map((activity) => ({
      id: activity.key,
      source: 'builtin' as const,
      ref: activity.ref,
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      retryPolicy: activity.retryPolicy || null,
      handler: activity.handler,
      config: activity.config || {},
      generatedCode: activity.generatedCode,
      isActive: true,
      readonly: true,
      version: activity.version,
      description: activity.description,
    }));

    return [...builtinResources, ...customResources];
  }, [activitiesQuery.data, builtinActivitiesQuery.data]);

  const resolveStepActivity = (step?: WorkflowDsl['steps'][number]): WorkflowSelectableActivity | undefined => {
    if (!step) {
      return undefined;
    }
    // 1. 先尝试从 activityResources 找基础定义 (内置或已发布的)
    const base = activityResources.find((activity) =>
      (step.activityRef && activity.ref === step.activityRef)
      || (step.activityName && activity.name === step.activityName)
      || (step.activityName && activity.fn === step.activityName),
    );

    // 2. 尝试从当前正在编辑的 activityDsl 中找 (包含草稿/未发布的)
    const overlay = (activityDsl.activities || []).find((activity) =>
      activity.name === step.activityName
      || activity.fn === step.activityName
      || (base && (activity.fn === base.fn || activity.name === base.name)),
    );

    if (!base && !overlay) {
      return undefined;
    }

    // 如果只有 overlay (例如新建的草稿 Activity)，则基于 overlay 构建基础资源对象
    if (!base && overlay) {
      return {
        id: String(overlay.name || overlay.fn || 'draft-activity'),
        source: 'custom' as const,
        ref: `custom:${overlay.fn || overlay.name}`,
        name: overlay.name || '未命名 Activity',
        fn: overlay.fn || '',
        timeout: overlay.timeout || '300s',
        retryPolicy: overlay.retryPolicy || null,
        handler: overlay.handler || 'browser',
        config: overlay.config || {},
        generatedCode: overlay.generatedCode || '',
        isActive: true,
        readonly: false,
      };
    }

    // 如果都没有更新，直接返回 base (此时 base 必然存在，因为前面已经判断了 !base && !overlay)
    if (!overlay) {
      return base!;
    }

    // 如果都有，则以 overlay 覆盖 base
    return {
      ...base!,
      name: overlay.name || base!.name,
      timeout: overlay.timeout || base!.timeout,
      retryPolicy: overlay.retryPolicy || base!.retryPolicy,
      handler: overlay.handler || base!.handler,
      config: overlay.config || base!.config,
      generatedCode: overlay.generatedCode || base!.generatedCode,
    };
  };

  // 当真实验证弹窗打开时，同步输入参数到本地状态
  useEffect(() => {
    if (realValidationState.visible && Object.keys(realValidationState.inputParams).length > 0) {
      setRealValidationInputParams(
        Object.fromEntries(
          Object.entries(realValidationState.inputParams).map(([key, value]) => [
            key,
            normalizeValidationInputValue(value),
          ]),
        ),
      );
    }
  }, [realValidationState.visible]);

  // 从Activity的config中提取inputParams (存储在config.steps[].inputParams中)
  const getActivityInputParams = (activity: WorkflowSelectableActivity): Record<string, string> => {
    const params: Record<string, string> = {};
    try {
      const config = activity.config as Record<string, any>;
      if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
        config.steps.forEach((step: Record<string, any>) => {
          normalizeActivityInputParams(step?.inputParams).forEach((param) => {
            if (param.key.trim() && !(param.key in params)) {
              params[param.key] = param.value || '';
            }
          });
        });
      }
    } catch (e) {
      // ignore
    }
    return params;
  };

  const getActivityInputParamDefinitions = (activity?: WorkflowSelectableActivity): Record<string, WorkflowInputParamDefinition> => {
    const definitions: Record<string, WorkflowInputParamDefinition> = {};
    if (!activity) {
      return definitions;
    }
    try {
      const config = activity.config as Record<string, any>;
      if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
        config.steps.forEach((step: Record<string, any>) => {
          normalizeActivityInputParams(step?.inputParams).forEach((param) => {
            if (param.key.trim() && !definitions[param.key]) {
              definitions[param.key] = {
                description: '',
                required: param.required,
                defaultValue: param.value || '',
                source: 'inferred_from_template',
              };
            }
          });
        });
      }
    } catch (e) {
      // ignore
    }
    return definitions;
  };

  const isHttpRequestActivity = (
    activity?: WorkflowSelectableActivity,
    step?: WorkflowDsl['steps'][number],
  ) => (
    activity?.fn === 'httpRequest'
    || step?.activityRef === 'builtin:httpRequest'
    || step?.activityName === 'httpRequest'
  );

  const isStructuredTransformActivity = (
    activity?: WorkflowSelectableActivity,
    step?: WorkflowDsl['steps'][number],
  ) => (
    activity?.fn === 'structuredTransform'
    || activity?.fn === 'aiStructuredTransform'
    || step?.activityRef === 'builtin:structuredTransform'
    || step?.activityRef === 'builtin:aiStructuredTransform'
    || step?.activityName === 'structuredTransform'
    || step?.activityName === 'aiStructuredTransform'
  );

  const getStepHttpRequestConfig = (
    step?: WorkflowDsl['steps'][number],
    activity?: WorkflowSelectableActivity,
  ): HttpRequestStepConfig => {
    const activityDefaults = asPlainRecord(activity?.config?.defaultStepConfig);
    const stepInput = asPlainRecord(step?.input);
    const rawConfig = asPlainRecord(stepInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
    return {
      ...DEFAULT_HTTP_REQUEST_STEP_CONFIG,
      ...activityDefaults,
      ...rawConfig,
      queryTemplate: {
        ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.queryTemplate),
        ...asPlainRecord(activityDefaults.queryTemplate),
        ...asPlainRecord(rawConfig.queryTemplate),
      },
      headersTemplate: {
        ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.headersTemplate),
        ...asPlainRecord(activityDefaults.headersTemplate),
        ...asPlainRecord(rawConfig.headersTemplate),
      },
      jsonTemplate: {
        ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.jsonTemplate),
        ...asPlainRecord(activityDefaults.jsonTemplate),
        ...asPlainRecord(rawConfig.jsonTemplate),
      },
      dataTemplate: {
        ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.dataTemplate),
        ...asPlainRecord(activityDefaults.dataTemplate),
        ...asPlainRecord(rawConfig.dataTemplate),
      },
      responseFieldMappings: {
        ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.responseFieldMappings),
        ...asPlainRecord(activityDefaults.responseFieldMappings),
        ...asPlainRecord(rawConfig.responseFieldMappings),
      },
    };
  };

  const updateStepHttpRequestConfig = (
    index: number,
    patch: Partial<HttpRequestStepConfig>,
  ) => {
    const step = workflowDsl.steps[index];
    const activity = resolveStepActivity(step);
    const nextConfig = {
      ...getStepHttpRequestConfig(step, activity),
      ...patch,
    };
    handleUpdateStep(index, 'input', {
      ...(step.input || {}),
      [HTTP_REQUEST_STEP_CONFIG_KEY]: nextConfig,
    });
  };

  const updateHttpRequestTemplateMap = (
    index: number,
    field: 'queryTemplate' | 'headersTemplate' | 'jsonTemplate' | 'dataTemplate' | 'responseFieldMappings',
    nextMap: Record<string, string>,
  ) => {
    updateStepHttpRequestConfig(index, { [field]: nextMap } as Partial<HttpRequestStepConfig>);
  };

  const getStepStructuredTransformConfig = (
    step?: WorkflowDsl['steps'][number],
    activity?: WorkflowSelectableActivity,
  ): StructuredTransformStepConfig => {
    const activityDefaults = asPlainRecord(activity?.config?.defaultStepConfig);
    const stepInput = asPlainRecord(step?.input);
    const rawConfig = asPlainRecord(stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
    return {
      ...DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG,
      ...activityDefaults,
      ...rawConfig,
      outputSchema: {
        ...asPlainRecord(DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG.outputSchema),
        ...asPlainRecord(activityDefaults.outputSchema),
        ...asPlainRecord(rawConfig.outputSchema),
      },
      fieldMappings: {
        ...asPlainRecord(DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG.fieldMappings),
        ...asPlainRecord(activityDefaults.fieldMappings),
        ...asPlainRecord(rawConfig.fieldMappings),
      },
    };
  };

  const updateStepStructuredTransformConfig = (
    index: number,
    patch: Partial<StructuredTransformStepConfig>,
  ) => {
    const step = workflowDsl.steps[index];
    const activity = resolveStepActivity(step);
    const nextConfig = {
      ...getStepStructuredTransformConfig(step, activity),
      ...patch,
    };
    handleUpdateStep(index, 'input', {
      ...(step.input || {}),
      [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: nextConfig,
    });
  };

  const syncWorkflowInputParamsFromSteps = () => {
    setWorkflowDsl((prev) => {
      if (!prev.steps.length) {
        return prev.inputParams && Object.keys(prev.inputParams).length > 0 ? { ...prev, inputParams: {} } : prev;
      }
      const currentDefinitions = prev.inputParams || {};
      // 分析所有步骤（不仅是第一个），提取自动生成的参数
      // 浏览器模版场景下，所有步骤都在 activityDsl.activities[0].config.steps 中
      const discoveredParams: Record<string, WorkflowInputParamDefinition> = {};

      prev.steps.forEach((step) => {
        const activity = resolveStepActivity(step);
        const activityDefinitions = getActivityInputParamDefinitions(activity);
        const stepInputEntries = getStepInputPublicEntries(step);

        Object.entries(activityDefinitions).forEach(([key, definition]) => {
          const def = definition as WorkflowInputParamDefinition;
          const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
          if (!discoveredParams[key]) {
            discoveredParams[key] = {
              description: currentDef?.description || def.description || '',
              required: currentDef?.required ?? def.required ?? false,
              defaultValue: currentDef?.defaultValue ?? def.defaultValue ?? '',
              source: currentDef?.source ?? def.source,
              type: currentDef?.type ?? def.type,
              exampleValue: currentDef?.exampleValue ?? def.exampleValue,
              displayName: currentDef?.displayName || def.displayName || '',
              groupLabel: currentDef?.groupLabel || def.groupLabel || '',
              paramKind: currentDef?.paramKind ?? def.paramKind,
              arrayPath: currentDef?.arrayPath || def.arrayPath || '',
              fieldName: currentDef?.fieldName || def.fieldName || '',
            };
          }
        });

        stepInputEntries.forEach(([key, value]) => {
          const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
          if (!discoveredParams[key]) {
            discoveredParams[key] = {
              description: currentDef?.description || '',
              required: currentDef?.required ?? false,
              defaultValue: typeof value === 'string'
                ? value
                : currentDef?.defaultValue ?? JSON.stringify(value),
              source: currentDef?.source,
              type: currentDef?.type,
              exampleValue: currentDef?.exampleValue,
              displayName: currentDef?.displayName,
              groupLabel: currentDef?.groupLabel,
              paramKind: currentDef?.paramKind ?? (key.includes('[].') ? 'array' : 'scalar'),
              arrayPath: currentDef?.arrayPath ?? (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
              fieldName: currentDef?.fieldName ?? (key.includes('[].') ? key.split('[].')[1] || key : key),
            };
          }
        });

        if (isHttpRequestActivity(activity, step)) {
          const httpVariables = Array.from(collectTemplateVariablesFromValue(getStepHttpRequestConfig(step, activity)));
          httpVariables.forEach((key) => {
            const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
            if (!discoveredParams[key]) {
              discoveredParams[key] = {
                description: currentDef?.description || '',
                required: currentDef?.required ?? true,
                defaultValue: currentDef?.defaultValue ?? '',
                source: currentDef?.source,
                type: currentDef?.type,
                exampleValue: currentDef?.exampleValue,
                displayName: currentDef?.displayName,
                groupLabel: currentDef?.groupLabel,
                paramKind: currentDef?.paramKind ?? (key.includes('[].') ? 'array' : 'scalar'),
                arrayPath: currentDef?.arrayPath ?? (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
                fieldName: currentDef?.fieldName ?? (key.includes('[].') ? key.split('[].')[1] || key : key),
              };
            }
          });
        }

        if (isStructuredTransformActivity(activity, step)) {
          const stVariables = Array.from(collectTemplateVariablesFromValue(getStepStructuredTransformConfig(step, activity)));
          stVariables.forEach((key) => {
            const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
            if (!discoveredParams[key]) {
              discoveredParams[key] = {
                description: currentDef?.description || '',
                required: currentDef?.required ?? true,
                defaultValue: currentDef?.defaultValue ?? '',
                source: currentDef?.source,
                type: currentDef?.type,
                exampleValue: currentDef?.exampleValue,
                displayName: currentDef?.displayName,
                groupLabel: currentDef?.groupLabel,
                paramKind: currentDef?.paramKind ?? (key.includes('[].') ? 'array' : 'scalar'),
                arrayPath: currentDef?.arrayPath ?? (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
                fieldName: currentDef?.fieldName ?? (key.includes('[].') ? key.split('[].')[1] || key : key),
              };
            }
          });
        }
      });

      // 关键：保留不在步骤中但用户手动追加或从模版带入的参数
      const mergedParams = { ...discoveredParams };
      Object.entries(currentDefinitions).forEach(([key, definition]) => {
        if (!mergedParams[key]) {
          mergedParams[key] = definition;
        }
      });

      if (JSON.stringify(currentDefinitions) === JSON.stringify(mergedParams)) {
        return prev;
      }

      return {
        ...prev,
        inputParams: mergedParams,
      };
    });
  };

  // 当选择步骤时，自动从Activity加载输入参数（如果步骤还没有参数）
  useEffect(() => {
    if (selectedStepIndexForConfig !== null && workflowDsl.steps[selectedStepIndexForConfig]) {
      const step = workflowDsl.steps[selectedStepIndexForConfig];
      if ((step.activityName || step.activityRef) && getStepInputPublicEntries(step).length === 0) {
        const activity = resolveStepActivity(step);
        const inputParams = activity ? getActivityInputParams(activity) : {};
        if (Object.keys(inputParams).length > 0) {
          handleUpdateStep(selectedStepIndexForConfig, 'input', {
            ...(step.input || {}),
            ...inputParams,
          });
        }
      }
    }
  }, [selectedStepIndexForConfig, workflowDsl.steps, activityResources]);

  useEffect(() => {
    if (workflowDsl.steps.length === 0) {
      if (selectedStepIndexForConfig !== null) {
        setSelectedStepIndexForConfig(null);
      }
      return;
    }
    if (selectedStepIndexForConfig === null || selectedStepIndexForConfig >= workflowDsl.steps.length) {
      setSelectedStepIndexForConfig(0);
    }
  }, [workflowDsl.steps.length, selectedStepIndexForConfig]);
  const currentDraftSignature = useMemo(
    () => buildWorkflowDraftSignature(workflowDsl, activityDsl, watchedWorkflowName || workflowDsl.name),
    [workflowDsl, activityDsl, watchedWorkflowName],
  );

  useEffect(() => {
    if (workflowDsl.steps.length > 0) {
      syncWorkflowInputParamsFromSteps();
    }
  }, [workflowDsl.steps, activityResources]);

  useEffect(() => {
    if (!generatedCode || !lastGeneratedSignature) {
      if (!generatedCode) {
        setIsGeneratedCodeStale(false);
      }
      return;
    }
    if (currentDraftSignature !== lastGeneratedSignature) {
      setGeneratedCode(null);
      setIsGeneratedCodeStale(true);
      return;
    }
    setIsGeneratedCodeStale(false);
  }, [currentDraftSignature, generatedCode, lastGeneratedSignature]);

  useEffect(() => {
    if (!visible || !generatedCode || lastGeneratedSignature || didInitializeCodeSignatureRef.current) {
      return;
    }
    didInitializeCodeSignatureRef.current = true;
    setLastGeneratedSignature(currentDraftSignature);
  }, [currentDraftSignature, visible, generatedCode, lastGeneratedSignature]);

  const appendRealValidationLog = (content: string) => dispatchRealValidation({ type: 'APPEND_LOG', payload: content });
  const appendCodeGenerationLog = (content: string) => dispatchCodeGeneration({ type: 'APPEND_LOG', payload: content });
  const validateMutation = useMutation(
    ({ workflowDsl: wfd, activityDsl: ad }: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl }) =>
      temporalWorkflowApi.validate(wfd, ad),
    {
      onSuccess: (result) => {
        setValidationResult(result);
        void message.success('验证完成');
      },
      onError: (error: unknown) => {
        void message.error(resolveApiErrorMessage(error, '验证失败'));
      },
    }
  );

  const optimizeHttpConfigMutation = useMutation(
    (variables: {
      stepIndex: number;
      stepId: string;
      stepConfig: Record<string, any>;
      inputParams: Record<string, any>;
      userRequest: string;
    }) =>
      temporalWorkflowApi.optimizeHttpRequestConfig(
        variables.stepConfig,
        variables.inputParams,
        variables.userRequest,
      ),
    {
      onSuccess: (result: HttpRequestOptimizeResult, variables) => {
        if (!result.success || !result.optimizedConfig) {
          setHttpAiErrors((prev) => ({
            ...prev,
            [variables.stepId]: result.error || 'AI 优化失败',
          }));
          return;
        }
        setHttpAiErrors((prev) => {
          const next = { ...prev };
          delete next[variables.stepId];
          return next;
        });
        setHttpAiSuggestedConfigs((prev) => ({
          ...prev,
          [variables.stepId]: result.optimizedConfig as Record<string, any>,
        }));
        setHttpAiSuggestedJsonDrafts((prev) => ({
          ...prev,
          [variables.stepId]: JSON.stringify(result.optimizedConfig, null, 2),
        }));
        if (result.previewResponse) {
          setHttpAiPreviewResponses((prev) => ({
            ...prev,
            [variables.stepId]: result.previewResponse as Record<string, any>,
          }));
        }
        setHttpAiExplanations((prev) => ({
          ...prev,
          [variables.stepId]: result.explanation || 'AI 已生成可应用的优化建议',
        }));
      },
      onError: (error: unknown, variables) => {
        setHttpAiErrors((prev) => ({
          ...prev,
          [variables.stepId]: `AI 优化失败: ${resolveApiErrorMessage(error, 'Unknown error')}`,
        }));
      },
    },
  );

  const previewHttpConfigMutation = useMutation(
    (variables: {
      stepId: string;
      stepConfig: Record<string, any>;
      inputParams: Record<string, any>;
    }) => temporalWorkflowApi.previewHttpRequestConfig(variables.stepConfig, variables.inputParams),
    {
      onSuccess: (result: HttpRequestPreviewResult, variables) => {
        if (!result.success || !result.previewResponse) {
          setHttpAiErrors((prev) => ({
            ...prev,
            [variables.stepId]: result.error || '获取当前配置响应失败',
          }));
          return;
        }
        setHttpAiErrors((prev) => {
          const next = { ...prev };
          delete next[variables.stepId];
          return next;
        });
        setHttpAiPreviewResponses((prev) => ({
          ...prev,
          [variables.stepId]: result.previewResponse as Record<string, any>,
        }));
        if (result.resolvedRequest) {
          setHttpAiResolvedRequests((prev) => ({
            ...prev,
            [variables.stepId]: result.resolvedRequest as Record<string, any>,
          }));
        }
      },
      onError: (error: unknown, variables) => {
        setHttpAiErrors((prev) => ({
          ...prev,
          [variables.stepId]: `获取当前配置响应失败: ${resolveApiErrorMessage(error, 'Unknown error')}`,
        }));
      },
    },
  );

  const syncAiDraftSessionState = (session: AiWorkflowDraftSession) => {
    setAiDraftSessionId(session.sessionId);
    setAiDraftMessages(session.messages || []);
    setCurrentAiDraft(session.currentDraft || null);
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

  const handleDeleteAiDraftSession = (sessionId: string) => {
    deleteAiDraftSessionMutation.mutate(sessionId);
  };

  const generateAiDraftMutation = useMutation(
    (payload: { description?: string; referenceUrl?: string }) => temporalWorkflowApi.createAiDraftSession(payload),
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
    },
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
    },
  );

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
    },
  );

  const applyDraftToEditor = async (
    draft: Pick<TemplateWorkflowDraft, 'name' | 'description' | 'taskQueue' | 'workflowDsl' | 'activityDsl'>,
    successMessage: string,
  ) => {
    let nextWorkflowDsl = withNormalizedWorkflowInputParams(draft.workflowDsl, draft.activityDsl);
    const sourceSkillId = String(nextWorkflowDsl.sourceContext?.sourceTemplate?.skillId || '').trim();
    if (sourceSkillId && !Object.values(nextWorkflowDsl.inputParams || {}).some((param) => String(param.groupLabel || '').trim())) {
      try {
        const sourceSkill = await carboneAPI.getSkill(sourceSkillId);
        nextWorkflowDsl = {
          ...nextWorkflowDsl,
          inputParams: enrichWorkflowInputParamsWithSkill(nextWorkflowDsl.inputParams, sourceSkill),
        };
      } catch (error) {
        // Keep editor usable even if skill enrichment fails.
      }
    }
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
      return;
    }
    if (!openTemplatePickerOnOpen) {
      return;
    }
    setTemplateModalMode(initialTemplatePickerMode);
    setTemplateModalVisible(true);
    if (initialTemplatePickerMode === 'browser') {
      void loadBrowserTemplates();
      return;
    }
    void loadDocumentTemplates();
  }, [visible, openTemplatePickerOnOpen, initialTemplatePickerMode]);

  const handleSelectTemplate = async (template: CarboneTemplate) => {
    try {
      setGeneratingTemplateId(template.id);
      const draft: TemplateWorkflowDraft = await temporalWorkflowApi.generateTemplateDraft(template.id);
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
      const executionPlan = detail?.config && typeof detail.config === 'object'
        ? (detail.config as { executionPlan?: { commands?: BrowserDraftCommandInput[] } }).executionPlan
        : undefined;
      const executionPlanCommands = Array.isArray(executionPlan?.commands)
        ? executionPlan.commands.filter((command): command is BrowserDraftCommandInput => Boolean(command && typeof command === 'object'))
        : [];
      if (templateSteps.length === 0 && executionPlanCommands.length === 0) {
        void message.warning('该浏览器模版缺少可执行步骤，请先在模版页补充步骤');
        return;
      }
      const draft = await temporalWorkflowApi.generateBrowserDraft({
        templateId: detail.id,
        name: detail.name,
        description: detail.description,
        templateSteps: templateSteps.length > 0 ? templateSteps : undefined,
        paramsSchema: detail.params_schema,
        commands: executionPlanCommands.length > 0 ? executionPlanCommands : undefined,
      });
      if (!draft.activityDsl.activities[0]?.config?.steps || (draft.activityDsl.activities[0]?.config?.steps as Array<unknown>).length === 0) {
        void message.warning('该浏览器模版缺少可执行步骤，请先在模版页补充步骤');
        return;
      }
      await applyDraftToEditor(
        draft,
        templateSteps.length > 0
          ? `已基于模版步骤生成浏览器工作流草稿（${draft.browserTemplate.commandCount} 个步骤）`
          : executionPlanCommands.length > 0
            ? `已基于 executionPlan.commands 生成浏览器工作流草稿（${draft.browserTemplate.commandCount} 个步骤）`
            : `已生成浏览器工作流草稿（${draft.browserTemplate.commandCount} 个步骤）`,
      );
      setTemplateModalVisible(false);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '使用浏览器模版生成工作流失败'));
    } finally {
      setGeneratingBrowserTemplateId(null);
    }
  };





  const resolveWorkflowSourceSkillId = (workflow?: TemporalWorkflowDTO | null): string => {
    const sourceTemplate = workflow?.sourceTemplate || workflow?.sourceContext?.sourceTemplate;
    return String(sourceTemplate?.skillId || '').trim();
  };

  const buildExecutionInputFromWorkflow = (workflow: TemporalWorkflowDTO): Record<string, unknown> => {
    const params = workflow.workflowDsl?.inputParams || {};
    const input: Record<string, unknown> = {};
    Object.entries(params).forEach(([key, config]) => {
      if (config?.defaultValue !== undefined && String(config.defaultValue).trim() !== '') {
        input[key] = config.defaultValue;
        return;
      }
      if (config?.exampleValue !== undefined && config.exampleValue !== null) {
        input[key] = config.exampleValue;
        return;
      }
      input[key] = '';
    });
    return input;
  };

  const handleCreateExecutionFromWorkflow = async () => {
    if (!selectedWorkflow) {
      return;
    }
    const skillId = resolveWorkflowSourceSkillId(selectedWorkflow);
    if (!skillId) {
      void message.warning('该工作流未绑定可执行 Skill，请先发布为 Skill 后再创建执行记录');
      return;
    }

    try {
      setCreatingExecutionWorkflowId(selectedWorkflow.id);
      const execution = await executionApi.create({
        skillId,
        runtimeType: 'browser',
        input: buildExecutionInputFromWorkflow(selectedWorkflow),
      });
      void message.success('已创建执行记录，正在跳转执行详情');
      setDetailModalVisible(false);
      void queryClient.invalidateQueries('executions');
      navigate(`/executions/${execution.id}`);
    } catch (error: unknown) {
      void message.error(resolveApiErrorMessage(error, '创建执行记录失败'));
    } finally {
      setCreatingExecutionWorkflowId(null);
    }
  };

  const handleValidate = () => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    setValidationResult(null);
    setValidateModalVisible(true);
    validateMutation.mutate({ workflowDsl: { ...workflowDsl, name: workflowName }, activityDsl });
  };

  const groupedWorkflowInputParams = useMemo(
    () => groupWorkflowInputParams(workflowDsl.inputParams),
    [workflowDsl.inputParams],
  );

  const updateSingleWorkflowInputParam = (key: string, nextValue: WorkflowInputParamDefinition) => {
    setWorkflowDsl((prev) => ({
      ...prev,
      inputParams: {
        ...prev.inputParams,
        [key]: nextValue,
      },
    }));
  };

  const updateArrayGroupRequiredState = (keys: string[], required: boolean) => {
    if (keys.length === 0) {
      return;
    }
    setWorkflowDsl((prev) => {
      const nextInputParams = { ...(prev.inputParams || {}) };
      keys.forEach((key) => {
        const current = nextInputParams[key];
        if (!current) {
          return;
        }
        nextInputParams[key] = {
          ...current,
          required,
        };
      });
      return {
        ...prev,
        inputParams: nextInputParams,
      };
    });
  };

  const renderInputParamEditor = (key: string, param: WorkflowInputParamDefinition, compactLabel?: boolean) => (
    <div
      key={key}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(160px, 220px)',
        gap: 10,
        alignItems: 'center',
        padding: '12px 14px',
        border: '1px solid var(--bg-secondary)',
        borderRadius: 14,
        background: 'var(--bg-card)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ minWidth: 0, minHeight: 32, display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
          <Tooltip title={key}>
            <Tag color={param.paramKind === 'array' ? 'purple' : 'blue'} style={{ marginInlineEnd: 0, whiteSpace: 'nowrap' }}>
              {compactLabel ? (param.fieldName || key) : key}
            </Tag>
          </Tooltip>
          {param.displayName && param.displayName !== key && param.displayName !== param.fieldName ? (
            <Text strong ellipsis style={{ minWidth: 0 }}>{param.displayName}</Text>
          ) : null}
          <Button
            size="small"
            danger
            type="text"
            onClick={() => {
              const newParams = { ...workflowDsl.inputParams };
              delete (newParams as any)[key];
              setWorkflowDsl({ ...workflowDsl, inputParams: newParams });
            }}
            style={{ paddingInline: 4, marginLeft: 'auto', flexShrink: 0 }}
          >
            ×
          </Button>
        </div>
      </div>
      <Checkbox
        checked={param.required === true}
        onChange={(event) => updateSingleWorkflowInputParam(key, { ...param, required: event.target.checked })}
        style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
      >
        必填
      </Checkbox>
      <Input
        value={param.defaultValue || ''}
        onChange={(event) => updateSingleWorkflowInputParam(key, { ...param, defaultValue: event.target.value })}
        placeholder="默认值"
        size="small"
        style={{ width: '100%' }}
      />
      <Tooltip title={param.description || '未填写说明'}>
        <Text
          type="secondary"
          style={{
            gridColumn: '1 / -1',
            display: 'block',
            fontSize: 12,
            lineHeight: 1.5,
            paddingTop: 2,
          }}
        >
          {truncateText(param.description || '未填写说明')}
        </Text>
      </Tooltip>
    </div>
  );

  const renderCollapsibleInputSection = (
    panelKey: string,
    title: React.ReactNode,
    children: React.ReactNode,
  ) => (
    <Collapse
      size="small"
      defaultActiveKey={[panelKey]}
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--bg-card)',
        border: '1px solid var(--bg-secondary)',
      }}
      items={[
        {
          key: panelKey,
          label: title,
          children,
          styles: {
            header: { padding: '12px 14px' },
            body: { padding: '0 14px 14px' },
          },
        },
      ]}
    />
  );

  const renderArrayGroupTitle = (arrayGroup: GroupedWorkflowInputParams['arrayGroups'][number]) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
      <Space size={8} wrap>
        <span>{`循环变量 · ${arrayGroup.arrayPath}`}</span>
        <Tag color="purple" style={{ margin: 0 }}>{arrayGroup.entries.length} 项</Tag>
      </Space>
      <Space size={8} wrap onClick={(event) => event.stopPropagation()}>
        <Button
          size="small"
          onClick={() => updateArrayGroupRequiredState(arrayGroup.entries.map(([entryKey]) => entryKey), true)}
        >
          全选
        </Button>
        <Button
          size="small"
          onClick={() => updateArrayGroupRequiredState(arrayGroup.entries.map(([entryKey]) => entryKey), false)}
        >
          清除
        </Button>
      </Space>
    </div>
  );

  const renderWorkflowInputGroup = (group: GroupedWorkflowInputParams) => (
    <Space key={group.key} direction="vertical" size={12} style={{ width: '100%' }}>
      {group.scalarEntries.length > 0 ? (
        renderCollapsibleInputSection(
          `${group.key}-scalar`,
          (
            <Space size={8} wrap>
              <span>普通变量</span>
              <Tag style={{ margin: 0 }}>{group.scalarEntries.length} 项</Tag>
            </Space>
          ),
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 8 }}>
            {group.scalarEntries.map(([key, param]) => renderInputParamEditor(key, param))}
          </div>,
        )
      ) : null}
      {group.arrayGroups.map((arrayGroup) => (
        <div key={`${group.key}-${arrayGroup.arrayPath}`}>
          {renderCollapsibleInputSection(
            `${group.key}-${arrayGroup.arrayPath}`,
            renderArrayGroupTitle(arrayGroup),
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 8 }}>
              {arrayGroup.entries.map(([key, param]) => renderInputParamEditor(key, param, true))}
            </div>,
          )}
        </div>
      ))}
    </Space>
  );

  const handleGenerateCode = async (errorContext?: string) => {
    const formValues = form.getFieldsValue();
    const workflowName = formValues.name || workflowDsl.name;
    if (!workflowName) { message.warning('请先填写工作流名称'); return; }
    if (workflowDsl.steps.length === 0) { message.warning('请先添加至少一个步骤'); return; }
    const nextWorkflowDsl = { ...workflowDsl, name: workflowName };
    dispatchCodeGeneration({ type: 'START' });
    try {
      await temporalWorkflowApi.generateWorkflowCodeStream(
        nextWorkflowDsl,
        activityDsl,
        errorContext,
        forceAiGeneration,
        (event: WorkflowCodeStreamEvent) => {
          if (event.type === 'log' && event.content) {
            appendCodeGenerationLog(event.content);
            return;
          }
          if (event.type === 'done') {
            const result: WorkflowCodeResult = {
              success: Boolean(event.success),
              code: event.code,
              error: event.error,
              attempts: event.attempts,
              autoRetried: event.autoRetried,
              generationMode: event.generationMode,
            };
            dispatchCodeGeneration({ type: 'SET_RESULT', payload: result });
            if (result.success && result.code) {
              setGeneratedCode(result.code);
              setLastGeneratedSignature(currentDraftSignature);
              setIsGeneratedCodeStale(false);
              setCodeModalVisible(true);
              if (result.autoRetried) {
                message.success(`代码生成成功，已基于编译反馈自动重试 ${Math.max((result.attempts || 1) - 1, 1)} 次`);
              } else if (forceAiGeneration && result.generationMode === 'ai') {
                message.success('代码生成成功（已强制使用 AI 生成）');
              } else if (result.generationMode === 'deterministic') {
                message.success('代码生成成功（固定模版模式）');
              } else {
                message.success('代码生成成功');
              }
            } else {
              message.error(result.error || '代码生成失败');
            }
            return;
          }
          if (event.type === 'error') {
            const failure = {
              success: false,
              error: event.content || 'Unknown error',
              score: 0,
              logs: [],
            } as unknown as WorkflowCodeResult;
            dispatchCodeGeneration({ type: 'SET_RESULT', payload: failure });
            message.error(`代码生成失败: ${event.content || 'Unknown error'}`);
          }
        },
      );
    } catch (error: any) {
      appendCodeGenerationLog(`错误: ${error.message || 'Unknown error'}`);
      dispatchCodeGeneration({
        type: 'SET_RESULT',
        payload: {
          success: false,
          error: error.message || 'Unknown error',
        },
      });
      message.error('代码生成失败: ' + (error.message || 'Unknown error'));
    }
  };

  // 收集工作流步骤的输入参数
  const collectWorkflowInputParams = (): Record<string, string> => {
    const params: Record<string, string> = {};
    Object.entries(workflowDsl.inputParams || {}).forEach(([key, config]) => {
      params[key] = normalizeValidationInputValue(
        config?.defaultValue !== undefined && config?.defaultValue !== ''
          ? config.defaultValue
          : config?.exampleValue
      );
    });
    workflowDsl.steps.forEach((step) => {
      getStepInputPublicEntries(step).forEach(([key, value]) => {
        if (!params[key]) {
          params[key] = normalizeValidationInputValue(value);
        }
      });
      const activity = resolveStepActivity(step);
      if (isHttpRequestActivity(activity, step)) {
        Array.from(collectTemplateVariablesFromValue(getStepHttpRequestConfig(step, activity))).forEach((key) => {
          if (!(key in params)) {
            params[key] = '';
          }
        });
      }
    });
    return params;
  };

  const handleAiOptimizeHttpConfig = () => {
    if (selectedStepIndexForConfig === null || !selectedStep || !selectedStep.id || !isHttpRequestActivity(selectedStepActivity, selectedStep)) {
      return;
    }
    const userRequest = selectedStepAiPrompt.trim();
    if (!userRequest) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: '请先输入希望 AI 优化的自然语言目标',
      }));
      return;
    }
    setHttpAiErrors((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    optimizeHttpConfigMutation.mutate({
      stepIndex: selectedStepIndexForConfig,
      stepId: selectedStep.id,
      stepConfig: selectedStepHttpConfig,
      inputParams: collectWorkflowInputParams(),
      userRequest,
    });
  };

  const handleOpenHttpAiPanel = () => {
    if (!selectedStep || !selectedStep.id || !isHttpRequestActivity(selectedStepActivity, selectedStep)) {
      return;
    }
    setActiveHttpAiStepId(selectedStep.id);
    setResourceSidebarCollapsed(true);
    setStepsSidebarCollapsed(true);
    setHttpAiSuggestedConfigs((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiSuggestedJsonDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiApplySummaries((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiExplanations((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    previewHttpConfigMutation.mutate({
      stepId: selectedStep.id,
      stepConfig: selectedStepHttpConfig,
      inputParams: collectWorkflowInputParams(),
    });
  };

  const handleApplyAiOptimizedHttpConfig = () => {
    if (selectedStepIndexForConfig === null || !selectedStep?.id) {
      return;
    }
    const suggestedDraft = httpAiSuggestedJsonDrafts[selectedStep.id];
    if (!suggestedDraft?.trim()) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: '请先生成 AI 优化建议',
      }));
      return;
    }
    let suggestedConfig: Record<string, unknown>;
    try {
      const parsedConfig: unknown = JSON.parse(suggestedDraft);
      if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
        throw new Error('AI 优化结果不是合法 JSON 对象');
      }
      suggestedConfig = parsedConfig as Record<string, unknown>;
    } catch (error: unknown) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: `AI 优化结果不是合法 JSON: ${resolveApiErrorMessage(error, '解析失败')}`,
      }));
      return;
    }
    const currentConfig = selectedStepHttpConfig as Record<string, unknown>;
    const changedKeys = Object.keys(suggestedConfig).filter((key) => (
      JSON.stringify(currentConfig[key]) !== JSON.stringify(suggestedConfig[key])
    ));
    updateStepHttpRequestConfig(selectedStepIndexForConfig, suggestedConfig as Partial<HttpRequestStepConfig>);
    setHttpAiSuggestedConfigs((prev) => ({
      ...prev,
      [selectedStep.id as string]: suggestedConfig as Record<string, any>,
    }));
    setStepConfigActiveKeys(['activity-input', 'result-processing']);
    setHttpAiErrors((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiApplySummaries((prev) => ({
      ...prev,
      [selectedStep.id as string]: changedKeys.length > 0
        ? changedKeys.map((key) => `${key}: ${JSON.stringify(suggestedConfig[key])}`)
        : ['AI 建议与当前配置一致，没有产生新的字段变化'],
    }));
  };

  const handleOpenRealValidation = () => {
    if (!generatedCode) { void message.warning('请先生成代码'); return; }
    const inputParams = collectWorkflowInputParams();
    dispatchRealValidation({ type: 'OPEN', payload: inputParams });
  };

  const handleRealValidation = async () => {
    if (!generatedCode) { void message.warning('请先生成代码'); return; }
    const fn = workflowDsl.workflowClassName?.trim() || (workflowDsl.name.replace(/\s+/g, '') + 'Workflow');
    dispatchRealValidation({ type: 'START' });

    // 构建输入参数
    const inputParams: Record<string, string> = {};
    Object.entries(realValidationInputParams).forEach(([key, value]) => {
      const normalizedValue = normalizeValidationInputValue(value).trim();
      if (normalizedValue) {
        inputParams[key] = normalizedValue;
      }
    });
    if (workflowDsl.steps.some((step) => isHttpRequestActivity(resolveStepActivity(step), step))) {
      inputParams.__httpResponsePreview = 'true';
    }

    try {
      await temporalWorkflowApi.validateWorkflowRealStream(
        generatedCode,
        fn,
        inputParams,
        workflowDsl.taskQueue,
        (event) => {
          if (event.type === 'log' && event.content) {
            appendRealValidationLog(event.content);
          } else if (event.type === 'done') {
            const normalized = normalizeExecutionResult(event, {
              defaultSuccessScore: 100,
              defaultFailureScore: 0,
            });
            const rawResult: unknown = event.result as unknown;
            dispatchRealValidation({
              type: 'SET_RESULT',
              payload: {
                success: normalized.success,
                logs: [],
                result: rawResult as WorkflowRealValidationResult['result'],
                error: normalized.error,
                score: normalized.score,
              },
            });
          } else if (event.type === 'error') {
            dispatchRealValidation({
              type: 'SET_RESULT',
              payload: {
                success: false,
                logs: [],
                error: event.content || 'Unknown error',
                score: 0,
              },
            });
          }
        }
      );
    } catch (error: unknown) {
      const errorMessage = resolveApiErrorMessage(error, '真实验证启动失败');
      appendRealValidationLog(`错误: ${errorMessage}`);
      void message.error(errorMessage);
      dispatchRealValidation({
        type: 'SET_RESULT',
        payload: {
          success: false,
          logs: [],
          error: errorMessage,
          score: 0,
        },
      });
    }
  };

  const handleSave = () => {
    void form.validateFields().then((values: { name?: string; description?: string; taskQueue?: string }) => {
      const workflowName = values.name || workflowDsl.name;
      const data: CreateTemporalWorkflowDTO = {
        name: workflowName,
        description: values.description,
        taskQueue: values.taskQueue,
        workflowDsl: {
          ...workflowDsl,
          name: workflowName,
          steps: workflowDsl.steps.map((step) => {
            if (step.type !== 'activity') {
              return step;
            }
            const resolved = resolveStepActivity(step);
            return {
              ...step,
              activityRef: step.activityRef || resolved?.ref,
              activityName: step.activityName || resolved?.name,
            };
          }),
        },
        activityDsl,
        generatedCode: generatedCode || undefined,
      };
      onSave(data);
    }).catch((error: unknown) => {
      void message.error(resolveApiErrorMessage(error, '表单校验失败'));
    });
  };
  const handleAddStep = () => {
    const nextIndex = workflowDsl.steps.length;
    setWorkflowDsl({ ...workflowDsl, steps: [...workflowDsl.steps, { id: `step_${Date.now()}`, name: `步骤 ${workflowDsl.steps.length + 1}`, type: 'activity' }] });
    if (nextIndex === 0) {
      setSelectedStepIndexForConfig(0);
    }
  };
  const handleRemoveStep = (index: number) => setWorkflowDsl({ ...workflowDsl, steps: workflowDsl.steps.filter((_, i) => i !== index) });
  const handleUpdateStep = (index: number, field: string, value: unknown) => { const updated = [...workflowDsl.steps]; updated[index] = { ...updated[index], [field]: value }; setWorkflowDsl({ ...workflowDsl, steps: updated }); };

  const handleOpenActivitySelector = (stepIndex: number) => { setSelectingStepIndex(stepIndex); setSelectActivityModalVisible(true); };

  const buildStepTimeoutsFromActivity = (activity?: WorkflowSelectableActivity) => ({
    startToCloseTimeout: activity?.timeout || STEP_DURATION_DEFAULTS.startToCloseTimeout,
    scheduleToCloseTimeout: undefined,
    heartbeatTimeout: undefined,
  });

  const buildActivityDslEntry = (activity: WorkflowSelectableActivity) => ({
    name: activity.name,
    fn: activity.fn,
    timeout: activity.timeout,
    retryPolicy: activity.retryPolicy || undefined,
    handler: activity.handler,
    config: activity.config || {},
    generatedCode: activity.generatedCode,
  });

  // Add activity from pool to workflow steps and activityDsl
  const handleAddActivityFromPool = (activity: WorkflowSelectableActivity) => {
    const stepId = `step_${Date.now()}`;
    const initialInput = isHttpRequestActivity(activity)
      ? { [HTTP_REQUEST_STEP_CONFIG_KEY]: getStepHttpRequestConfig(undefined, activity) }
      : isStructuredTransformActivity(activity)
        ? { [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: getStepStructuredTransformConfig(undefined, activity) }
        : undefined;
    const newStep = {
      id: stepId,
      name: activity.name,
      type: 'activity' as const,
      activityRef: activity.ref,
      activityName: activity.name,
      input: initialInput,
      ...buildStepTimeoutsFromActivity(activity),
    };
    // Add step to workflowDsl
    setWorkflowDsl({ ...workflowDsl, steps: [...workflowDsl.steps, newStep] });
    // Add activity to activityDsl if not exists
    const exists = activityDsl.activities.some(a => a.name === activity.name);
    if (!exists) {
      setActivityDsl({
        ...activityDsl,
        activities: [...activityDsl.activities, buildActivityDslEntry(activity)],
      });
    }
    // Select the newly added step for config
    setSelectedStepIndexForConfig(workflowDsl.steps.length);
  };

  const handleSelectActivity = (activity: WorkflowSelectableActivity) => {
    if (selectingStepIndex !== null) {
      const currentStep = workflowDsl.steps[selectingStepIndex];
      const nextInput = isHttpRequestActivity(activity)
        ? {
          ...(currentStep?.input || {}),
          [HTTP_REQUEST_STEP_CONFIG_KEY]: getStepHttpRequestConfig(currentStep, activity),
        }
        : isStructuredTransformActivity(activity)
          ? {
            ...(currentStep?.input || {}),
            [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: getStepStructuredTransformConfig(currentStep, activity),
          }
          : currentStep?.input;
      const nextStep = {
        ...currentStep,
        activityRef: activity.ref,
        activityName: activity.name,
        input: nextInput,
        startToCloseTimeout: currentStep?.startToCloseTimeout || activity.timeout || STEP_DURATION_DEFAULTS.startToCloseTimeout,
        scheduleToCloseTimeout: currentStep?.scheduleToCloseTimeout || undefined,
        heartbeatTimeout: currentStep?.heartbeatTimeout || undefined,
      };
      const updatedSteps = [...workflowDsl.steps];
      updatedSteps[selectingStepIndex] = nextStep;
      setWorkflowDsl({ ...workflowDsl, steps: updatedSteps });
      const exists = activityDsl.activities.some(a => a.name === activity.name);
      if (!exists) {
        setActivityDsl({ ...activityDsl, activities: [...activityDsl.activities, buildActivityDslEntry(activity)] });
      }
    }
    setSelectActivityModalVisible(false);
    setSelectingStepIndex(null);
  };

  const handleRegenerateCode = () => {
    dispatchRealValidation({ type: 'CLOSE' });
    setGeneratedCode(null);
    // Build error context from the last real validation result
    let errorContext: string | undefined;
    if (realValidationState.result) {
      const errors: string[] = [];
      if (realValidationState.result.error) errors.push(`验证错误: ${realValidationState.result.error}`);
      const validationExecutionError = getStringRecordField(realValidationState.result.result, 'error');
      const validationTraceback = getStringRecordField(realValidationState.result.result, 'traceback');
      if (validationExecutionError) errors.push(`执行错误: ${validationExecutionError}`);
      if (validationTraceback) errors.push(`堆栈: ${validationTraceback}`);
      if (realValidationState.logs.length > 0) errors.push(`日志:\n${realValidationState.logs.join('\n')}`);
      if (errors.length > 0) {
        errorContext = `上次真实验证失败，请修复以下问题:\n\n${errors.join('\n\n')}`;
      }
    }
    handleGenerateCode(errorContext);
  };

  const realValidationModalFooter = realValidationState.result && !realValidationState.result.success ? [
    <Button key="close" onClick={() => dispatchRealValidation({ type: 'CLOSE' })}>关闭</Button>,
    <Button key="regenerate" type="primary" onClick={handleRegenerateCode}>重新生成代码</Button>,
  ] : [<Button key="close" onClick={() => dispatchRealValidation({ type: 'CLOSE' })}>关闭</Button>];

  const codeGenerationModalFooter = [
    codeGenerationState.result?.success && generatedCode
      ? <Button key="view" type="primary" icon={<CodeOutlined />} onClick={() => setCodeModalVisible(true)}>查看代码</Button>
      : null,
    <Button key="close" onClick={() => dispatchCodeGeneration({ type: 'CLOSE' })} disabled={codeGenerationState.isStreaming}>关闭</Button>,
  ].filter(Boolean);

  const renderTipLabel = (label: string, tip: string) => (
    <Space size={4}>
      <span>{label}</span>
      <Tooltip title={tip}>
        <InfoCircleOutlined style={{ color: 'var(--text-light)' }} />
      </Tooltip>
    </Space>
  );

  const updateStepDurationField = (
    index: number,
    field: StepDurationField,
    value: number | null | undefined,
    unit: DurationUnit,
  ) => {
    handleUpdateStep(index, field, formatDurationValue(value, unit));
  };

  const getStepDurationDefaultValue = (
    field: StepDurationField,
    step?: WorkflowDsl['steps'][number],
  ): string => {
    if (field === 'startToCloseTimeout') {
      return step?.startToCloseTimeout || resolveStepActivity(step)?.timeout || STEP_DURATION_DEFAULTS.startToCloseTimeout;
    }
    return STEP_DURATION_DEFAULTS[field];
  };

  const toggleStepDurationField = (
    index: number,
    field: StepDurationField,
    enabled: boolean,
  ) => {
    if (!enabled) {
      handleUpdateStep(index, field, undefined);
      return;
    }
    const step = workflowDsl.steps[index];
    const defaultDuration = getStepDurationDefaultValue(field, step);
    const parsedDefault = parseDurationValue(defaultDuration);
    handleUpdateStep(index, field, formatDurationValue(parsedDefault.value ?? 0, parsedDefault.unit));
  };

  const renderStepDurationField = (
    field: StepDurationField,
    label: string,
    tip: string,
    options?: { canDisable?: boolean },
  ) => {
    if (selectedStepIndexForConfig === null || !workflowDsl.steps[selectedStepIndexForConfig]) {
      return null;
    }
    const step = workflowDsl.steps[selectedStepIndexForConfig];
    const parsed = parseDurationValue(step[field]);
    const canDisable = options?.canDisable ?? false;
    const enabled = canDisable ? Boolean(step[field]) : true;
    return (
      <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {canDisable && (
            <Switch
              size="small"
              checked={enabled}
              onChange={(checked) => toggleStepDurationField(selectedStepIndexForConfig, field, checked)}
            />
          )}
          <InputNumber
            size="small"
            min={0}
            value={parsed.value}
            disabled={!enabled}
            onChange={(value) => updateStepDurationField(selectedStepIndexForConfig, field, value, parsed.unit)}
            placeholder="时长"
            style={{ width: DURATION_INPUT_WIDTH }}
          />
          <Segmented
            size="small"
            options={DURATION_UNIT_OPTIONS}
            value={parsed.unit}
            disabled={!enabled}
            onChange={(value) => updateStepDurationField(selectedStepIndexForConfig, field, parsed.value, value as DurationUnit)}
            style={{ width: DURATION_SEGMENTED_WIDTH, padding: 0 }}
          />
        </div>
      </Form.Item>
    );
  };

  const updateWorkflowDurationField = (
    field: WorkflowDurationField,
    value: number | null | undefined,
    unit: DurationUnit,
  ) => {
    setWorkflowDsl({
      ...workflowDsl,
      [field]: formatDurationValue(value, unit),
    });
  };

  const renderWorkflowDurationField = (
    field: WorkflowDurationField,
    label: string,
    tip: string,
    enabled: boolean,
    defaultValue: string,
  ) => {
    const parsed = parseDurationValue(workflowDsl[field]);
    return (
      <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 0 }}>
        <Space size={6} align="center">
          <Switch
            checked={enabled}
            onChange={(checked) => setWorkflowDsl({
              ...workflowDsl,
              [field]: checked ? defaultValue : undefined,
            })}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <InputNumber
              size="small"
              min={0}
              disabled={!enabled}
              value={parsed.value}
              placeholder="时长"
              onChange={(value) => updateWorkflowDurationField(field, value, parsed.unit)}
              style={{ width: DURATION_INPUT_WIDTH }}
            />
            <Segmented
              size="small"
              options={DURATION_UNIT_OPTIONS}
              value={parsed.unit}
              disabled={!enabled}
              onChange={(value) => updateWorkflowDurationField(field, parsed.value, value as DurationUnit)}
              style={{ width: DURATION_SEGMENTED_WIDTH, padding: 0 }}
            />
          </div>
        </Space>
      </Form.Item>
    );
  };


  const shorten = (text?: string, max = 24) => {
    if (!text) {
      return '-';
    }
    return text.length > max ? `${text.slice(0, max)}...` : text;
  };
  const getActivitySourceMeta = (step?: WorkflowDsl['steps'][number]) => {
    const resolved = resolveStepActivity(step);
    const isBuiltin = step?.activityRef?.startsWith('builtin:') || resolved?.source === 'builtin';
    return {
      label: isBuiltin ? '内置' : '自定义',
      color: isBuiltin ? 'gold' : 'blue',
      ref: step?.activityRef || resolved?.ref || '-',
      name: resolved?.name || step?.activityName || '-',
    };
  };
  const selectedStep = selectedStepIndexForConfig !== null ? workflowDsl.steps[selectedStepIndexForConfig] : undefined;
  const selectedStepActivity = resolveStepActivity(selectedStep);
  const selectedStepHttpConfig = getStepHttpRequestConfig(selectedStep, selectedStepActivity);
  const selectedStepStructuredTransformConfig = getStepStructuredTransformConfig(selectedStep, selectedStepActivity);
  const selectedStepAiPrompt = selectedStep?.id ? (httpAiOptimizePrompts[selectedStep.id] || '') : '';
  const selectedStepAiPreview = selectedStep?.id ? httpAiPreviewResponses[selectedStep.id] : undefined;
  const selectedStepAiResolvedRequest = selectedStep?.id ? httpAiResolvedRequests[selectedStep.id] : undefined;
  const selectedStepAiSuggestedConfig = selectedStep?.id ? httpAiSuggestedConfigs[selectedStep.id] : undefined;
  const selectedStepAiSuggestedJsonDraft = selectedStep?.id ? (httpAiSuggestedJsonDrafts[selectedStep.id] || '') : '';
  const selectedStepAiExplanation = selectedStep?.id ? httpAiExplanations[selectedStep.id] : '';
  const selectedStepAiError = selectedStep?.id ? httpAiErrors[selectedStep.id] : '';
  const selectedStepAiApplySummary = selectedStep?.id ? (httpAiApplySummaries[selectedStep.id] || []) : [];
  const selectedStepAiSelectedLeafPaths = selectedStep?.id ? (httpAiSelectedLeafPaths[selectedStep.id] || []) : [];
  const selectedStepAiLeafAliases = selectedStep?.id ? (httpAiLeafAliases[selectedStep.id] || {}) : {};
  const selectedStructuredTransformIssues = useMemo(() => {
    if (!selectedStep || !isStructuredTransformActivity(selectedStepActivity, selectedStep)) {
      return [] as string[];
    }

    const issues: string[] = [];
    const isAiTransform = selectedStep.activityRef === 'builtin:aiStructuredTransform';
    const outputMode = String(selectedStepStructuredTransformConfig.outputMode || 'json').trim().toLowerCase();
    const outputSchema = asPlainRecord(selectedStepStructuredTransformConfig.outputSchema);
    const fieldMappings = asPlainRecord(selectedStepStructuredTransformConfig.fieldMappings);
    const blankMappingKeys = Object.entries(fieldMappings)
      .filter(([key, value]) => String(key || '').trim() && !String(value ?? '').trim())
      .map(([key]) => String(key));

    if (!isAiTransform && blankMappingKeys.length > 0) {
      issues.push(`fieldMappings 中存在空映射字段: ${blankMappingKeys.join('、')}。这会导致运行时把整块结果对象回填到该字段。`);
    }

    if (!isAiTransform && outputMode === 'json') {
      const unmappedSchemaKeys = Object.keys(outputSchema).filter((key) => !String(fieldMappings[key] ?? '').trim());
      if (unmappedSchemaKeys.length > 0) {
        issues.push(`outputSchema 中这些字段还没有对应映射: ${unmappedSchemaKeys.join('、')}。`);
      }
    }

    const previousStep = selectedStepIndexForConfig !== null && selectedStepIndexForConfig > 0
      ? workflowDsl.steps[selectedStepIndexForConfig - 1]
      : undefined;
    const previousActivity = resolveStepActivity(previousStep);
    if (previousStep && isHttpRequestActivity(previousActivity, previousStep)) {
      const previousHttpConfig = getStepHttpRequestConfig(previousStep, previousActivity);
      const responseMode = String(previousHttpConfig.responseMode || 'body').trim();
      const availableAliases = new Set(
        Object.keys(asPlainRecord(previousHttpConfig.responseFieldMappings))
          .map((key) => String(key || '').trim())
          .filter(Boolean),
      );

      if (responseMode === 'bodyMap' && availableAliases.size === 0) {
        issues.push('上一步 httpRequest 使用了 bodyMap，但 responseFieldMappings 为空。');
      }

      if (responseMode === 'bodyMap') {
        const invalidFieldMappings = Object.entries(fieldMappings)
          .filter(([, value]) => typeof value === 'string')
          .map(([key, value]) => ({ key: String(key || '').trim(), value: String(value || '').trim() }))
          .filter((item) => item.value && item.value.includes('.') && !item.value.startsWith('context.') && !availableAliases.has(item.value))
          .map((item) => `${item.key}<-${item.value}`);
        if (invalidFieldMappings.length > 0) {
          issues.push(`当前 fieldMappings 仍引用了上游原始路径，而不是 bodyMap 别名: ${invalidFieldMappings.join('、')}。`);
        }

        const rawPathPlaceholders = extractTemplatePlaceholders(String(selectedStepStructuredTransformConfig.textTemplate || ''))
          .filter((item) => item.includes('.') && !item.startsWith('context.') && !availableAliases.has(item));
        if (rawPathPlaceholders.length > 0) {
          issues.push(`textTemplate 仍引用了上游原始路径占位符: ${rawPathPlaceholders.join('、')}。`);
        }
      }
    }

    const contextKeys = collectContextReferenceKeys(fieldMappings);
    if (contextKeys.length > 0 && !hasUsableContextTemplate(selectedStepStructuredTransformConfig.contextTemplate)) {
      issues.push(`fieldMappings 使用了 context.* 字段，但 contextTemplate 仍为空: ${contextKeys.join('、')}。`);
    }

    return issues;
  }, [
    selectedStep,
    selectedStepActivity,
    selectedStepIndexForConfig,
    selectedStepStructuredTransformConfig,
    workflowDsl.steps,
  ]);
  const showDedicatedHttpAiZone = Boolean(
    selectedStep?.id
    && activeHttpAiStepId === selectedStep.id
    && isHttpRequestActivity(selectedStepActivity, selectedStep),
  );
  const realValidationRawResult = useMemo(
    () => unwrapValidationResultPayload(realValidationState.result?.result),
    [realValidationState.result?.result],
  );
  const realValidationLeafSource = useMemo(
    () => extractHttpPreviewBody(realValidationRawResult),
    [realValidationRawResult],
  );
  const realValidationLeafPaths = useMemo(
    () => collectLeafPaths(realValidationLeafSource),
    [realValidationLeafSource],
  );
  const aiOptimizeLeafSource = useMemo(
    () => extractHttpPreviewBody(selectedStepAiPreview),
    [selectedStepAiPreview],
  );
  const aiOptimizeLeafPaths = useMemo(
    () => collectLeafPaths(aiOptimizeLeafSource),
    [aiOptimizeLeafSource],
  );
  const renderHttpTemplateMapEditor = (
    field: 'queryTemplate' | 'headersTemplate' | 'jsonTemplate' | 'dataTemplate' | 'responseFieldMappings',
    label: string,
    tip: string,
  ) => {
    if (selectedStepIndexForConfig === null) {
      return null;
    }
    const mapValue = asPlainRecord(selectedStepHttpConfig[field]);
    const entries = Object.entries(mapValue);
    return (
      <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {entries.map(([key, value]) => (
            <div key={`${field}-${key}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                size="small"
                value={key}
                placeholder="键"
                onChange={(e) => {
                  const nextMap = { ...mapValue };
                  const nextKey = e.target.value;
                  delete nextMap[key];
                  if (nextKey.trim()) {
                    nextMap[nextKey] = String(value ?? '');
                  }
                  updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, nextMap);
                }}
                style={{ width: 110, flexShrink: 0 }}
              />
              <Input
                size="small"
                value={typeof value === 'string' ? value : JSON.stringify(value)}
                placeholder="值，可用 {city}"
                onChange={(e) => {
                  updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, {
                    ...mapValue,
                    [key]: e.target.value,
                  });
                }}
                style={{ flex: 1 }}
              />
              <Button
                size="small"
                danger
                type="text"
                onClick={() => {
                  const nextMap = { ...mapValue };
                  delete nextMap[key];
                  updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, nextMap);
                }}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            size="small"
            type="dashed"
            onClick={() => {
              updateHttpRequestTemplateMap(selectedStepIndexForConfig, field, {
                ...mapValue,
                [`key_${entries.length + 1}`]: '',
              });
            }}
          >
            + 添加
          </Button>
        </Space>
      </Form.Item>
    );
  };
  const renderStructuredTransformMapEditor = (
    label: string,
    tip: string,
  ) => {
    if (selectedStepIndexForConfig === null) {
      return null;
    }
    const mapValue = asPlainRecord(selectedStepStructuredTransformConfig.fieldMappings);
    const entries = Object.entries(mapValue);
    return (
      <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={6}>
          {entries.map(([key, value]) => (
            <div key={`structured-transform-field-${key}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                size="small"
                value={key}
                placeholder="输出字段"
                onChange={(e) => {
                  const nextMap = { ...mapValue };
                  const nextKey = e.target.value;
                  delete nextMap[key];
                  if (nextKey.trim()) {
                    nextMap[nextKey] = String(value ?? '');
                  }
                  updateStepStructuredTransformConfig(selectedStepIndexForConfig, { fieldMappings: nextMap });
                }}
                style={{ width: 140, flexShrink: 0 }}
              />
              <Input
                size="small"
                value={typeof value === 'string' ? value : JSON.stringify(value)}
                placeholder="来源路径或模版变量"
                onChange={(e) => {
                  updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                    fieldMappings: {
                      ...mapValue,
                      [key]: e.target.value,
                    },
                  });
                }}
                style={{ flex: 1 }}
              />
              <Button
                size="small"
                danger
                type="text"
                onClick={() => {
                  const nextMap = { ...mapValue };
                  delete nextMap[key];
                  updateStepStructuredTransformConfig(selectedStepIndexForConfig, { fieldMappings: nextMap });
                }}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            size="small"
            type="dashed"
            onClick={() => {
              updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                fieldMappings: {
                  ...mapValue,
                  [`field_${entries.length + 1}`]: '',
                },
              });
            }}
          >
            + 添加
          </Button>
        </Space>
      </Form.Item>
    );
  };
  const selectedStructuredTransformSchemaDraft = selectedStep?.id
    ? (structuredTransformSchemaDrafts[selectedStep.id] ?? JSON.stringify(selectedStepStructuredTransformConfig.outputSchema || {}, null, 2))
    : '{}';
  const selectedStructuredTransformSchemaError = selectedStep?.id
    ? (structuredTransformSchemaErrors[selectedStep.id] || '')
    : '';
  const updateStructuredTransformSchemaDraft = (stepId: string, rawValue: string) => {
    setStructuredTransformSchemaDrafts((prev) => ({
      ...prev,
      [stepId]: rawValue,
    }));
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setStructuredTransformSchemaErrors((prev) => ({
        ...prev,
        [stepId]: '',
      }));
      if (selectedStepIndexForConfig !== null) {
        updateStepStructuredTransformConfig(selectedStepIndexForConfig, { outputSchema: {} });
      }
      return;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('需要输入 JSON 对象');
      }
      setStructuredTransformSchemaErrors((prev) => ({
        ...prev,
        [stepId]: '',
      }));
      if (selectedStepIndexForConfig !== null) {
        updateStepStructuredTransformConfig(selectedStepIndexForConfig, { outputSchema: parsed as Record<string, any> });
      }
    } catch (error: unknown) {
      setStructuredTransformSchemaErrors((prev) => ({
        ...prev,
        [stepId]: resolveApiErrorMessage(error, 'JSON 解析失败'),
      }));
    }
  };
  const applySuggestedResponsePath = (path: string) => {
    if (selectedStepIndexForConfig === null) {
      return;
    }
    updateStepHttpRequestConfig(selectedStepIndexForConfig, {
      responseMode: 'bodyPath',
      responseBodyPath: path,
    });
  };
  const addSuggestedOutputParam = (path: string) => {
    const key = path.split('.').slice(-1)[0] || path.replace(/[^\w]+/g, '_');
    const sourceStep = selectedStep?.id;
    setWorkflowDsl({
      ...workflowDsl,
      outputParams: {
        ...(workflowDsl.outputParams || {}),
        [key]: {
          description: `从 ${path} 提取`,
          sourceStep,
        },
      },
    });
  };
  const buildOutputKeyFromPath = (path: string) => {
    const segments = path.split('.').filter(Boolean);
    const meaningfulSegments = segments.filter((segment) => !/^\d+$/.test(segment));
    const source = meaningfulSegments.length > 0 ? meaningfulSegments : segments;
    const normalized = source
      .slice(-2)
      .join('_')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || 'field';
  };
  const toggleAiLeafPathSelection = (path: string) => {
    if (!selectedStep?.id) {
      return;
    }
    const stepId = selectedStep.id;
    const exists = selectedStepAiSelectedLeafPaths.includes(path);
    const nextPaths = exists
      ? selectedStepAiSelectedLeafPaths.filter((item) => item !== path)
      : [...selectedStepAiSelectedLeafPaths, path];
    setHttpAiSelectedLeafPaths((prev) => ({
      ...prev,
      [stepId]: nextPaths,
    }));
    if (!exists) {
      setHttpAiLeafAliases((prev) => ({
        ...prev,
        [stepId]: {
          ...(prev[stepId] || {}),
          [path]: prev[stepId]?.[path] || buildOutputKeyFromPath(path),
        },
      }));
    }
  };
  const updateAiLeafAlias = (path: string, alias: string) => {
    if (!selectedStep?.id) {
      return;
    }
    const stepId = selectedStep.id;
    setHttpAiLeafAliases((prev) => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] || {}),
        [path]: alias,
      },
    }));
  };
  const handleGenerateMultiFieldOutputParams = () => {
    if (!selectedStep?.id || selectedStepIndexForConfig === null) {
      return;
    }
    if (selectedStepAiSelectedLeafPaths.length === 0) {
      setHttpAiErrors((prev) => ({
        ...prev,
        [selectedStep.id as string]: '请先从当前响应字段建议中选择至少一个字段',
      }));
      return;
    }
    const outputEntries = selectedStepAiSelectedLeafPaths.map((path) => {
      const alias = (selectedStepAiLeafAliases[path] || buildOutputKeyFromPath(path)).trim() || buildOutputKeyFromPath(path);
      return { alias, path };
    });
    const responseFieldMappings = outputEntries.reduce<Record<string, string>>((acc, item) => {
      acc[item.alias] = item.path;
      return acc;
    }, {});
    setWorkflowDsl((prev) => ({
      ...prev,
      outputParams: {
        ...(prev.outputParams || {}),
        ...outputEntries.reduce<Record<string, { description?: string; sourceStep?: string }>>((acc, item) => {
          acc[item.alias] = {
            description: `多字段提取草稿，来源 ${item.path}`,
            sourceStep: selectedStep.id,
          };
          return acc;
        }, {}),
      },
    }));
    updateStepHttpRequestConfig(selectedStepIndexForConfig, {
      responseMode: 'bodyMap',
      responseBodyPath: '',
      responseFieldMappings,
    });
    setHttpAiSuggestedJsonDrafts((prev) => ({
      ...prev,
      [selectedStep.id as string]: JSON.stringify({
        ...selectedStepHttpConfig,
        responseMode: 'bodyMap',
        responseBodyPath: '',
        responseFieldMappings,
      }, null, 2),
    }));
    setHttpAiErrors((prev) => {
      const next = { ...prev };
      delete next[selectedStep.id as string];
      return next;
    });
    setHttpAiApplySummaries((prev) => ({
      ...prev,
      [selectedStep.id as string]: [
        'responseMode: "bodyMap"',
        'responseBodyPath: ""',
        ...Object.entries(responseFieldMappings).map(([key, path]) => `responseFieldMappings.${key} <- ${path}`),
        ...outputEntries.map((item) => `outputParams.${item.alias} <- ${item.path}`),
      ],
    }));
  };
  const currentWorkflowDisplayName = (workflowDsl.workflowDefnName || form.getFieldValue('name') || workflowDsl.name || '未命名工作流') as string;
  const currentWorkflowClassName = (workflowDsl.workflowClassName || `${((form.getFieldValue('name') || workflowDsl.name || 'Custom') as string).replace(/\s+/g, '')}Workflow`) as string;
  const currentSourceTemplate = useMemo(
    () => editingWorkflow?.sourceTemplate || deriveWorkflowSourceTemplate(workflowDsl, activityDsl),
    [editingWorkflow?.id, editingWorkflow?.sourceTemplate, workflowDsl, activityDsl],
  );
  const currentSourceContext = useMemo(
    () => editingWorkflow?.sourceContext || deriveWorkflowSourceContext(workflowDsl, activityDsl),
    [editingWorkflow?.id, editingWorkflow?.sourceContext, workflowDsl, activityDsl],
  );
  const renderDraftInputParamSummary = (draft: AiWorkflowDraft) => {
    const groups = groupWorkflowInputParams(draft.workflowDsl.inputParams);
    if (groups.length === 0) {
      return <Text type="secondary">未声明输入参数</Text>;
    }
    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {groups.map((group) => (
          <Card key={`draft-group-${group.key}`} size="small" title={group.label}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {group.scalarEntries.map(([key, value]) => (
                <div
                  key={`draft-input-${group.key}-${key}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px 64px minmax(0, 1fr)',
                    gap: 8,
                    alignItems: 'start',
                    padding: '8px 10px',
                    border: '1px solid var(--bg-secondary)',
                    borderRadius: 8,
                    background: 'var(--bg-card)',
                  }}
                >
                  <Tag color="blue" style={{ margin: 0, width: 'fit-content' }}>{key}</Tag>
                  <Tag color={value.required ? 'red' : 'default'} style={{ margin: 0, width: 'fit-content' }}>
                    {value.required ? '必填' : '可选'}
                  </Tag>
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    {value.description ? <Text>{value.description}</Text> : <Text type="secondary">未填写说明</Text>}
                    {value.defaultValue ? <Text type="secondary">默认值: {value.defaultValue}</Text> : null}
                  </Space>
                </div>
              ))}
              {group.arrayGroups.map((arrayGroup) => (
                <Card key={`draft-array-${group.key}-${arrayGroup.arrayPath}`} size="small" title={`循环变量 · ${arrayGroup.arrayPath}`}>
                  <Space wrap size={[6, 6]}>
                    {arrayGroup.entries.map(([key, value]) => (
                      <Tooltip key={`draft-array-tag-${key}`} title={value.description || key}>
                        <Tag color="purple" style={{ margin: 0 }}>
                          {value.fieldName || key}
                        </Tag>
                      </Tooltip>
                    ))}
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        ))}
      </Space>
    );
  };

  const renderDraftOutputParamSummary = (draft: AiWorkflowDraft) => {
    const entries = Object.entries(draft.workflowDsl.outputParams || {});
    if (entries.length === 0) {
      return <Text type="secondary">未声明输出参数</Text>;
    }
    return (
      <Space direction="vertical" size={6} style={{ width: '100%' }}>
        {entries.map(([key, value]) => (
          <div
            key={`draft-output-${key}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '110px minmax(0, 1fr)',
              gap: 8,
              alignItems: 'start',
              padding: '8px 10px',
              border: '1px solid var(--bg-secondary)',
              borderRadius: 8,
              background: 'var(--bg-card)',
            }}
          >
            <Tag color="green" style={{ margin: 0, width: 'fit-content' }}>{key}</Tag>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {value.description ? <Text>{value.description}</Text> : <Text type="secondary">未填写说明</Text>}
              {value.sourceStep ? <Text type="secondary">来源步骤: {value.sourceStep}</Text> : null}
            </Space>
          </div>
        ))}
      </Space>
    );
  };

  const renderDraftContractCard = (draft: AiWorkflowDraft) => {
    const inputEntries = Object.entries(draft.workflowDsl.inputParams || {});
    const requiredInputs = inputEntries.filter(([, value]) => value.required);
    const optionalInputs = inputEntries.filter(([, value]) => !value.required);
    const outputEntries = Object.entries(draft.workflowDsl.outputParams || {});
    const stepEntries = draft.workflowDsl.steps || [];
    const sampleInputPayload = inputEntries.reduce<Record<string, string>>((acc, [key, value]) => {
      const description = String(value.description || '').trim();
      const fallback = value.required ? `<required:${key}>` : `<optional:${key}>`;
      acc[key] = value.defaultValue || (description ? `<${description}>` : fallback);
      return acc;
    }, {});
    const sampleOutputPayload = outputEntries.reduce<Record<string, string>>((acc, [key, value]) => {
      const description = String(value.description || '').trim();
      const sourceStep = String(value.sourceStep || '').trim();
      acc[key] = description || (sourceStep ? `<from:${sourceStep}>` : `<output:${key}>`);
      return acc;
    }, {});

    const renderKeyTags = (
      entries: Array<[string, { description?: string; required?: boolean; defaultValue?: string; sourceStep?: string }]>,
      color: string,
      emptyText: string,
    ) => {
      if (entries.length === 0) {
        return <Text type="secondary">{emptyText}</Text>;
      }
      return (
        <Space wrap size={[6, 6]}>
          {entries.map(([key, value]) => (
            <Tooltip
              key={`contract-${color}-${key}`}
              title={[
                value.description ? `说明: ${value.description}` : '',
                value.defaultValue ? `默认值: ${value.defaultValue}` : '',
                value.sourceStep ? `来源步骤: ${value.sourceStep}` : '',
              ].filter(Boolean).join('\n') || key}
            >
              <Tag color={color} style={{ margin: 0 }}>
                {key}
              </Tag>
            </Tooltip>
          ))}
        </Space>
      );
    };

    const stepCallItems = stepEntries.map((step, index) => {
      const rawInput = asPlainRecord(step.input);
      const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
      const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
      const inputVariables = Array.from(
        collectTemplateVariablesFromValue({
          ...rawInput,
          ...(Object.keys(httpConfig).length > 0 ? httpConfig : {}),
          ...(Object.keys(transformConfig).length > 0 ? transformConfig : {}),
        }),
      );
      return {
        key: `step-call-${step.id || index}`,
        stepLabel: step.name || `步骤 ${index + 1}`,
        activityLabel: step.activityName || step.activityRef || '未指定 Activity',
        timeout: step.startToCloseTimeout || '-',
        callType: Object.keys(httpConfig).length > 0
          ? `HTTP ${(httpConfig.method || 'GET').toString().toUpperCase()}`
          : Object.keys(transformConfig).length > 0
            ? `结构化转换 ${transformConfig.outputMode || 'json'}`
            : '通用 Activity',
        target: Object.keys(httpConfig).length > 0
          ? (httpConfig.urlTemplate || '-')
          : Object.keys(transformConfig).length > 0
            ? shorten(String(transformConfig.instructionTemplate || '结构化转换'), 60)
            : '-',
        params: inputVariables,
      };
    });

    const lineageItems = stepEntries.flatMap((step, index) => {
      const rawInput = asPlainRecord(step.input);
      const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
      const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
      const responseFieldMappings = asPlainRecord(httpConfig.responseFieldMappings);
      const outputSchema = asPlainRecord(transformConfig.outputSchema);
      const inputVariables = Array.from(
        collectTemplateVariablesFromValue({
          ...rawInput,
          ...(Object.keys(httpConfig).length > 0 ? httpConfig : {}),
          ...(Object.keys(transformConfig).length > 0 ? transformConfig : {}),
        }),
      );

      const baseInfo = {
        stepLabel: step.name || `步骤 ${index + 1}`,
        activityLabel: step.activityName || step.activityRef || '未指定 Activity',
      };
      const transformFieldMappings = asPlainRecord(transformConfig.fieldMappings);

      const inputLinks = inputVariables.map((variable) => ({
        key: `lineage-input-${step.id}-${variable}`,
        source: `输入.${variable}`,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: Object.keys(httpConfig).length > 0
          ? `请求配置.${String(httpConfig.method || 'GET').toUpperCase()}`
          : Object.keys(transformConfig).length > 0
            ? `转换配置.${transformConfig.outputMode || 'json'}`
            : '步骤输入',
        detail: Object.keys(httpConfig).length > 0
          ? (httpConfig.urlTemplate || '动态请求')
          : Object.keys(transformConfig).length > 0
            ? (transformConfig.textTemplate || transformConfig.instructionTemplate || (Object.keys(transformFieldMappings).length > 0 ? Object.entries(transformFieldMappings).map(([k, v]) => `${k}<-${v}`).join('；') : '结构化转换'))
            : '',
      }));

      const outputLinks = Object.entries(draft.workflowDsl.outputParams || {})
        .filter(([, value]) => (value.sourceStep || '') === step.id)
        .map(([key, value]) => ({
          key: `lineage-output-${step.id}-${key}`,
          source: baseInfo.stepLabel,
          step: baseInfo.stepLabel,
          activity: baseInfo.activityLabel,
          target: `输出.${key}`,
          detail: value.description || '',
        }));

      const responseMappingLinks = Object.entries(responseFieldMappings).map(([key, value]) => ({
        key: `lineage-http-map-${step.id}-${key}`,
        source: baseInfo.stepLabel,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: `字段.${key}`,
        detail: `提取路径 ${value}`,
      }));

      const schemaLinks = Object.keys(outputSchema).map((key) => ({
        key: `lineage-schema-${step.id}-${key}`,
        source: baseInfo.stepLabel,
        step: baseInfo.stepLabel,
        activity: baseInfo.activityLabel,
        target: `字段.${key}`,
        detail: typeof outputSchema[key] === 'string' ? String(outputSchema[key]) : '输出结构字段',
      }));

      return [...inputLinks, ...responseMappingLinks, ...schemaLinks, ...outputLinks];
    });

    const groupedLineageSections = [
      {
        title: '输入驱动',
        items: lineageItems.filter((item) => item.source.startsWith('输入.')),
      },
      {
        title: '步骤提取',
        items: lineageItems.filter((item) => item.target.startsWith('字段.')),
      },
      {
        title: '最终输出',
        items: lineageItems.filter((item) => item.target.startsWith('输出.')),
      },
    ].filter((section) => section.items.length > 0);

    const qualityHints = [
      ...(inputEntries.length === 0 ? ['当前草稿还没有显式声明输入参数，建议确认是否需要定义标准入口契约。'] : []),
      ...(requiredInputs.some(([, value]) => !String(value.description || '').trim())
        ? ['存在必填输入缺少参数说明，建议补充 description，方便调用方理解。']
        : []),
      ...(outputEntries.length === 0 ? ['当前草稿还没有显式声明输出字段，返回结构可能只能依赖最后一步结果。'] : []),
      ...(outputEntries.some(([, value]) => !String(value.description || '').trim())
        ? ['存在输出字段缺少说明，建议补充 outputParams.description。']
        : []),
      ...stepEntries.flatMap((step, index) => {
        const rawInput = asPlainRecord(step.input);
        const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
        const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
        const stepName = step.name || `步骤 ${index + 1}`;
        const messages: string[] = [];
        if (Object.keys(httpConfig).length > 0) {
          if (!String(httpConfig.urlTemplate || '').trim()) {
            messages.push(`${stepName} 使用了 HTTP 请求能力，但还没有明确的 URL 模版。`);
          }
          if ((httpConfig.responseMode || '') === 'bodyMap' && Object.keys(asPlainRecord(httpConfig.responseFieldMappings)).length === 0) {
            messages.push(`${stepName} 设置了多字段返回，但还没有配置字段映射。`);
          }
        }
        if (Object.keys(transformConfig).length > 0) {
          const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
          if (isAiTransform && !String(transformConfig.instructionTemplate || '').trim()) {
            messages.push(`${stepName} 使用了 AI 结构化转换，但还没有明确的处理规则。`);
          }
          if (!isAiTransform && (transformConfig.outputMode || 'json') === 'text'
            && !String(transformConfig.textTemplate || '').trim()
            && Object.keys(asPlainRecord(transformConfig.fieldMappings)).length === 0) {
            messages.push(`${stepName} 使用了固定规则文本转换，但还没有配置 textTemplate 或 fieldMappings。`);
          }
          if ((transformConfig.outputMode || 'json') === 'json' && Object.keys(asPlainRecord(transformConfig.outputSchema)).length === 0) {
            messages.push(`${stepName} 输出模式为 JSON，但还没有定义 outputSchema。`);
          }
        }
        if (!step.activityName && !step.activityRef) {
          messages.push(`${stepName} 还没有绑定 Activity。`);
        }
        return messages;
      }),
      ...(stepCallItems.some((item) => item.params.length === 0)
        ? ['部分步骤没有显式模版变量依赖，请确认这是否是预期行为。']
        : []),
    ];

    return (
      <div
        style={{
          border: '1px solid rgba(99, 102, 241, 0.24)',
          background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, var(--bg-card) 100%)',
          borderRadius: 12,
          padding: 12,
        }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Space wrap size={[6, 6]}>
              <Tag color="blue" style={{ margin: 0 }}>输入参数 {inputEntries.length}</Tag>
              <Tag color="red" style={{ margin: 0 }}>必填 {requiredInputs.length}</Tag>
              <Tag color="default" style={{ margin: 0 }}>可选 {optionalInputs.length}</Tag>
              <Tag color="green" style={{ margin: 0 }}>输出字段 {outputEntries.length}</Tag>
            </Space>
            <Space wrap size={[6, 6]}>
              {draft.workflowDsl.workflowClassName ? (
                <Tag color="geekblue" style={{ margin: 0 }}>
                  类名: {draft.workflowDsl.workflowClassName}
                </Tag>
              ) : null}
              <Tag color="purple" style={{ margin: 0 }}>
                步骤 {stepEntries.length}
              </Tag>
            </Space>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>必填输入</Text>
              {renderKeyTags(requiredInputs, 'red', '当前没有必填输入')}
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>可选输入</Text>
              {renderKeyTags(optionalInputs, 'default', '当前没有可选输入')}
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>输出字段</Text>
              {renderKeyTags(outputEntries, 'green', '当前没有声明输出字段')}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>草稿质量提示</Text>
            {qualityHints.length === 0 ? (
              <Alert
                type="success"
                showIcon
                message="当前草稿的输入、输出和步骤配置都比较完整。"
              />
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {qualityHints.map((item, index) => (
                  <Alert
                    key={`quality-hint-${index}`}
                    type="warning"
                    showIcon
                    message={item}
                  />
                ))}
              </Space>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>输入示例 JSON</Text>
              <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
                {JSON.stringify(sampleInputPayload, null, 2)}
              </pre>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>输出示例 JSON</Text>
              <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
                {JSON.stringify(sampleOutputPayload, null, 2)}
              </pre>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>入口摘要</Text>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text>工作流名称: {draft.workflowDsl.name || draft.name}</Text>
                <Text>Task Queue: {draft.taskQueue || draft.workflowDsl.taskQueue || 'SKILL_TASK_QUEUE'}</Text>
                <Text>入口参数: {inputEntries.length === 0 ? '无' : inputEntries.map(([key]) => key).join('，')}</Text>
                <Text>必填参数: {requiredInputs.length === 0 ? '无' : requiredInputs.map(([key]) => key).join('，')}</Text>
              </Space>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>返回摘要</Text>
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text>输出字段: {outputEntries.length === 0 ? '未声明' : outputEntries.map(([key]) => key).join('，')}</Text>
                <Text>来源步骤: {Array.from(new Set(outputEntries.map(([, value]) => value.sourceStep).filter(Boolean))).join('，') || '默认最后一步'}</Text>
                <Text type="secondary">返回结构优先基于 outputParams 定义，若未声明则以最后一步结果为准。</Text>
              </Space>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>步骤调用摘要</Text>
            {stepCallItems.length === 0 ? (
              <Text type="secondary">当前草稿还没有步骤调用信息</Text>
            ) : (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {stepCallItems.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 0.9fr)',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'var(--bg-secondary)',
                    }}
                  >
                    <div>
                      <Space wrap size={[6, 6]}>
                        <Tag color="purple" style={{ margin: 0 }}>{item.stepLabel}</Tag>
                        <Tag color="blue" style={{ margin: 0 }}>{item.activityLabel}</Tag>
                        <Tag style={{ margin: 0 }}>{item.callType}</Tag>
                      </Space>
                      <div style={{ marginTop: 6, fontSize: 12 }}>{item.target}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>超时: {item.timeout}</div>
                      <div style={{ fontSize: 12 }}>
                        输入依赖: {item.params.length > 0 ? item.params.join('，') : '无显式模版变量'}
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            )}
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>字段来源链路</Text>
            {groupedLineageSections.length === 0 ? (
              <Text type="secondary">当前草稿还无法推导明确的字段链路</Text>
            ) : (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                {groupedLineageSections.map((section) => (
                  <div key={section.title}>
                    <Text strong style={{ display: 'block', marginBottom: 6 }}>{section.title}</Text>
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      {section.items.slice(0, 12).map((item) => (
                        <div
                          key={item.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 0.9fr) 28px minmax(0, 1.1fr)',
                            gap: 8,
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--bg-secondary)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <Text strong>{item.source}</Text>
                            {item.detail ? (
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                {item.detail}
                              </div>
                            ) : null}
                          </div>
                          <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{'->'}</div>
                          <div style={{ minWidth: 0 }}>
                            <Text>{item.target}</Text>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                              {item.step} / {item.activity}
                            </div>
                          </div>
                        </div>
                      ))}
                    </Space>
                  </div>
                ))}
              </Space>
            )}
          </div>
        </Space>
      </div>
    );
  };

  const renderDraftStepSummary = (draft: AiWorkflowDraft) => {
    const steps = draft.workflowDsl.steps || [];
    if (steps.length === 0) {
      return <Text type="secondary">未生成步骤</Text>;
    }
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {steps.map((step, index) => {
          const rawInput = asPlainRecord(step.input);
          const httpConfig = asPlainRecord(rawInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
          const transformConfig = asPlainRecord(rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
          const responseFieldMappings = asPlainRecord(httpConfig.responseFieldMappings);
          const outputSchema = asPlainRecord(transformConfig.outputSchema);
          const transformFieldMappings = asPlainRecord(transformConfig.fieldMappings);
          const isAiTransform = step.activityRef === 'builtin:aiStructuredTransform';
          return (
            <div
              key={`draft-step-${step.id || index}`}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--bg-secondary)',
                borderRadius: 10,
                background: 'var(--bg-card)',
              }}
            >
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Space wrap size={[6, 6]}>
                  <Tag color="purple" style={{ margin: 0 }}>步骤 {index + 1}</Tag>
                  <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                  {step.activityName ? <Tag style={{ margin: 0 }}>{step.activityName}</Tag> : null}
                  {step.startToCloseTimeout ? <Tag color="gold" style={{ margin: 0 }}>{step.startToCloseTimeout}</Tag> : null}
                </Space>

                {Object.keys(httpConfig).length > 0 ? (
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text>HTTP 请求: {(httpConfig.method || 'GET').toString().toUpperCase()} {httpConfig.urlTemplate || '-'}</Text>
                    <Text type="secondary">返回模式: {httpConfig.responseMode || 'body'}</Text>
                    {httpConfig.responseBodyPath ? <Text type="secondary">提取路径: {httpConfig.responseBodyPath}</Text> : null}
                    {Object.keys(responseFieldMappings).length > 0 ? (
                      <Text type="secondary">字段映射: {Object.entries(responseFieldMappings).map(([k, v]) => `${k} <- ${v}`).join('；')}</Text>
                    ) : null}
                  </Space>
                ) : null}

                {Object.keys(transformConfig).length > 0 ? (
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Text>{isAiTransform ? 'AI 结构化转换' : '固定规则结构化转换'}: {transformConfig.contentType || 'text'} {'->'} {transformConfig.outputMode || 'json'}</Text>
                    {transformConfig.instructionTemplate ? (
                      <Text type="secondary">处理规则: {shorten(String(transformConfig.instructionTemplate), 80)}</Text>
                    ) : null}
                    {!isAiTransform && Object.keys(transformFieldMappings).length > 0 ? (
                      <Text type="secondary">字段映射: {Object.entries(transformFieldMappings).map(([k, v]) => `${k} <- ${v}`).join('；')}</Text>
                    ) : null}
                    {!isAiTransform && transformConfig.textTemplate ? (
                      <Text type="secondary">文本模版: {shorten(String(transformConfig.textTemplate), 80)}</Text>
                    ) : null}
                    {Object.keys(outputSchema).length > 0 ? (
                      <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 8 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>输出结构</Text>
                        <pre style={{ margin: 0, maxHeight: 140, overflow: 'auto', fontSize: 11 }}>
                          {JSON.stringify(outputSchema, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </Space>
                ) : null}
              </Space>
            </div>
          );
        })}
      </Space>
    );
  };

  const buildDraftDiffSummary = (current: AiWorkflowDraft, previous?: AiWorkflowDraft | null) => {
    if (!previous) {
      return {
        addedInputs: Object.keys(current.workflowDsl.inputParams || {}),
        changedInputs: [] as string[],
        addedOutputs: Object.keys(current.workflowDsl.outputParams || {}),
        changedOutputs: [] as string[],
        addedSteps: (current.workflowDsl.steps || []).map((step) => step.name || step.id),
        changedSteps: [] as string[],
      };
    }

    const currentInputs = Object.keys(current.workflowDsl.inputParams || {});
    const previousInputs = new Set(Object.keys(previous.workflowDsl.inputParams || {}));
    const previousInputMap = previous.workflowDsl.inputParams || {};
    const currentOutputs = Object.keys(current.workflowDsl.outputParams || {});
    const previousOutputs = new Set(Object.keys(previous.workflowDsl.outputParams || {}));
    const previousOutputMap = previous.workflowDsl.outputParams || {};
    const previousStepsById = new Map((previous.workflowDsl.steps || []).map((step) => [step.id, step]));

    const addedInputs = currentInputs.filter((key) => !previousInputs.has(key));
    const changedInputs = currentInputs
      .filter((key) => previousInputs.has(key))
      .filter((key) => {
        const currentInput = current.workflowDsl.inputParams?.[key];
        const previousInput = previousInputMap[key];
        return JSON.stringify({
          required: currentInput?.required,
          defaultValue: currentInput?.defaultValue,
          description: currentInput?.description,
        }) !== JSON.stringify({
          required: previousInput?.required,
          defaultValue: previousInput?.defaultValue,
          description: previousInput?.description,
        });
      })
      .map((key) => {
        const currentInput = current.workflowDsl.inputParams?.[key];
        const previousInput = previousInputMap[key];
        const changes: string[] = [];
        if ((currentInput?.required ?? false) !== (previousInput?.required ?? false)) {
          changes.push(`必填=${currentInput?.required ? '是' : '否'}`);
        }
        if ((currentInput?.defaultValue || '') !== (previousInput?.defaultValue || '')) {
          changes.push(`默认值=${currentInput?.defaultValue || '<空>'}`);
        }
        if ((currentInput?.description || '') !== (previousInput?.description || '')) {
          changes.push('说明已更新');
        }
        return `${key}（${changes.join('，')}）`;
      });
    const addedOutputs = currentOutputs.filter((key) => !previousOutputs.has(key));
    const changedOutputs = currentOutputs
      .filter((key) => previousOutputs.has(key))
      .filter((key) => {
        const currentOutput = current.workflowDsl.outputParams?.[key];
        const previousOutput = previousOutputMap[key];
        return JSON.stringify({
          description: currentOutput?.description,
          sourceStep: currentOutput?.sourceStep,
        }) !== JSON.stringify({
          description: previousOutput?.description,
          sourceStep: previousOutput?.sourceStep,
        });
      })
      .map((key) => {
        const currentOutput = current.workflowDsl.outputParams?.[key];
        const previousOutput = previousOutputMap[key];
        const changes: string[] = [];
        if ((currentOutput?.sourceStep || '') !== (previousOutput?.sourceStep || '')) {
          changes.push(`来源=${currentOutput?.sourceStep || '最后一步'}`);
        }
        if ((currentOutput?.description || '') !== (previousOutput?.description || '')) {
          changes.push('说明已更新');
        }
        return `${key}（${changes.join('，')}）`;
      });
    const addedSteps = (current.workflowDsl.steps || [])
      .filter((step) => !previousStepsById.has(step.id))
      .map((step) => step.name || step.id);
    const changedSteps = (current.workflowDsl.steps || [])
      .filter((step) => {
        const prev = previousStepsById.get(step.id);
        if (!prev) {
          return false;
        }
        return JSON.stringify({
          name: step.name,
          activityName: step.activityName,
          input: step.input,
          startToCloseTimeout: step.startToCloseTimeout,
        }) !== JSON.stringify({
          name: prev.name,
          activityName: prev.activityName,
          input: prev.input,
          startToCloseTimeout: prev.startToCloseTimeout,
        });
      })
      .map((step) => step.name || step.id);

    return {
      addedInputs,
      changedInputs,
      addedOutputs,
      changedOutputs,
      addedSteps,
      changedSteps,
    };
  };

  const renderDraftDiffSummary = (current: AiWorkflowDraft, previous?: AiWorkflowDraft | null) => {
    const diff = buildDraftDiffSummary(current, previous);
    const hasChanges = diff.addedInputs.length > 0
      || diff.changedInputs.length > 0
      || diff.addedOutputs.length > 0
      || diff.changedOutputs.length > 0
      || diff.addedSteps.length > 0
      || diff.changedSteps.length > 0;
    if (!hasChanges) {
      return (
        <Alert
          type="info"
          showIcon
          message={previous ? '本轮草稿与上一轮相比没有识别到明显结构变化。' : '这是首轮草稿，后续修改会在这里展示差异。'}
        />
      );
    }
    return (
      <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 10, border: '1px solid var(--bg-secondary)' }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>相对上一轮的变化</Text>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {diff.addedInputs.length > 0 ? <Alert type="success" showIcon message={`新增输入参数: ${diff.addedInputs.join('，')}`} /> : null}
          {diff.changedInputs.length > 0 ? <Alert type="warning" showIcon message={`输入参数已调整: ${diff.changedInputs.join('；')}`} /> : null}
          {diff.addedOutputs.length > 0 ? <Alert type="success" showIcon message={`新增输出字段: ${diff.addedOutputs.join('，')}`} /> : null}
          {diff.changedOutputs.length > 0 ? <Alert type="warning" showIcon message={`输出字段已调整: ${diff.changedOutputs.join('；')}`} /> : null}
          {diff.addedSteps.length > 0 ? <Alert type="success" showIcon message={`新增步骤: ${diff.addedSteps.join('，')}`} /> : null}
          {diff.changedSteps.length > 0 ? <Alert type="warning" showIcon message={`已调整步骤: ${diff.changedSteps.join('，')}`} /> : null}
        </Space>
      </div>
    );
  };

  const latestDraftMessageIndex = useMemo(
    () => {
      for (let index = aiDraftMessages.length - 1; index >= 0; index -= 1) {
        if (aiDraftMessages[index]?.draft) {
          return index;
        }
      }
      return -1;
    },
    [aiDraftMessages],
  );

  const previousDraftForCurrent = useMemo(() => {
    if (!currentAiDraft || latestDraftMessageIndex <= 0) {
      return undefined;
    }
    for (let index = latestDraftMessageIndex - 1; index >= 0; index -= 1) {
      if (aiDraftMessages[index]?.draft) {
        return aiDraftMessages[index].draft;
      }
    }
    return undefined;
  }, [aiDraftMessages, currentAiDraft, latestDraftMessageIndex]);

  const currentDraftApplyDiff = useMemo(
    () => (currentAiDraft ? buildDraftDiffSummary(currentAiDraft, previousDraftForCurrent) : null),
    [currentAiDraft, previousDraftForCurrent],
  );

  return (
    <>
      <Modal title="选择工作单元" open={selectActivityModalVisible} onCancel={() => { setSelectActivityModalVisible(false); setSelectingStepIndex(null); }} footer={null} width={600}>
              <Alert message="选择一个工作单元关联到工作流步骤" type="info" showIcon style={{ marginBottom: 16 }} />
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {activityResources.map(activity => (
                  <Card key={activity.ref} size="small" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => handleSelectActivity(activity)}>
                    <Space>
                      <Tag color={activity.handler === 'api' ? 'green' : activity.handler === 'script' ? 'orange' : 'blue'}>{activity.handler.toUpperCase()}</Tag>
                      {activity.source === 'builtin' ? <Tag color="gold">内置</Tag> : <Tag>自定义</Tag>}
                      <Text strong>{activity.name}</Text>
                      <Text type="secondary">({activity.fn})</Text>
                    </Space>
                  </Card>
                ))}
                {activityResources.length === 0 && <Alert message="暂无工作单元，请先创建" type="warning" showIcon />}
              </div>
      </Modal>
      <Modal
              title="模版工作流"
              open={templateModalVisible}
              onCancel={() => setTemplateModalVisible(false)}
              footer={null}
              width={900}
            >
              <div style={{ marginBottom: 12 }}>
                <Segmented
                  options={[
                    { label: '文档模版', value: 'document' },
                    { label: '浏览器模版', value: 'browser' },
                  ]}
                  value={templateModalMode}
                  onChange={(value) => {
                    void handleTemplateModeChange(value);
                  }}
                />
              </div>
              {templateModalMode === 'document' ? (
                <>
                  <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
                    <Input
                      placeholder="搜索模版..."
                      prefix={<SearchOutlined />}
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      style={{ width: 240 }}
                      allowClear
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => {
                      void loadDocumentTemplates();
                    }} loading={templatesLoading} disabled={Boolean(generatingTemplateId)}>刷新</Button>
                  </Space>
                  <div style={{ maxHeight: 520, overflow: 'auto', paddingRight: 4 }}>
                    {(templates || []).filter(t => {
                      const kw = templateSearch.trim().toLowerCase();
                      if (!kw) return true;
                      const name = (t.fileName || '').toLowerCase();
                      const id = (t.id || '').toLowerCase();
                      return name.includes(kw) || id.includes(kw);
                    }).map((t) => (
                      <Card key={t.id} size="small" style={{ marginBottom: 10 }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Tag color={t.format === 'docx' ? 'blue' : t.format === 'xlsx' ? 'green' : 'purple'}>{t.format?.toUpperCase() || 'DOC'}</Tag>
                            <Text strong>{t.fileName || t.id}</Text>
                            <Text type="secondary">ID: {t.id}</Text>
                            {t.skillId ? <Tag color="geekblue">Skill: {t.skillId}</Tag> : <Tag>无Skill</Tag>}
                          </Space>
                          <Space>
                            <Button
                              type="primary"
                              onClick={() => {
                                void handleSelectTemplate(t);
                              }}
                              loading={generatingTemplateId === t.id}
                              disabled={Boolean(generatingTemplateId)}
                            >
                              {generatingTemplateId === t.id ? '生成中...' : '用此模版生成'}
                            </Button>
                          </Space>
                        </Space>
                      </Card>
                    ))}
                    {(!templates || templates.length === 0) && (
                      <Alert message="暂无模版，或加载失败" type="warning" showIcon />
                    )}
                  </div>
                </>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Alert
                    type="info"
                    showIcon
                    message="请选择已生成的浏览器模版，系统将自动转换为 Browser Activity 工作流草稿"
                  />
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Input
                      placeholder="搜索已生成浏览器模版..."
                      prefix={<SearchOutlined />}
                      value={browserTemplateSearch}
                      onChange={(e) => setBrowserTemplateSearch(e.target.value)}
                      style={{ width: 280 }}
                      allowClear
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => {
                      void loadBrowserTemplates();
                    }} loading={browserTemplatesLoading} disabled={Boolean(generatingBrowserTemplateId)}>
                      刷新模版
                    </Button>
                  </Space>
                  <div style={{ maxHeight: 280, overflow: 'auto', paddingRight: 4 }}>
                    {(browserTemplates || []).filter((item) => {
                      const kw = browserTemplateSearch.trim().toLowerCase();
                      if (!kw) return true;
                      const name = String(item.name || '').toLowerCase();
                      const id = String(item.id || '').toLowerCase();
                      const desc = String(item.description || '').toLowerCase();
                      return name.includes(kw) || id.includes(kw) || desc.includes(kw);
                    }).map((item) => (
                      <Card key={item.id} size="small" style={{ marginBottom: 8 }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space>
                            <Tag color={item.status === 'PUBLISHED' ? 'green' : item.status === 'REVIEW' ? 'gold' : 'blue'}>{item.status}</Tag>
                            <Text strong>{item.name || item.id}</Text>
                            <Text type="secondary">ID: {item.id}</Text>
                            <Tag>步骤: {Array.isArray(item.steps) ? item.steps.length : 0}</Tag>
                          </Space>
                          <Button
                            type="primary"
                            onClick={() => {
                              void handleSelectBrowserTemplate(item);
                            }}
                            loading={generatingBrowserTemplateId === item.id}
                            disabled={Boolean(generatingBrowserTemplateId)}
                          >
                            {generatingBrowserTemplateId === item.id ? '生成中...' : '用此浏览器模版生成'}
                          </Button>
                        </Space>
                      </Card>
                    ))}
                    {(!browserTemplates || browserTemplates.length === 0) && (
                      <Alert message="暂无已生成浏览器模版，或加载失败" type="warning" showIcon />
                    )}
                  </div>
                </Space>
              )}
      </Modal>
      <Drawer
              title={<Space><RobotOutlined /><span>AI 辅助工作流编排</span></Space>}
              open={aiDraftDrawerVisible}
              onClose={() => setAiDraftDrawerVisible(false)}
              width={720}
              extra={
                <Space>
                  <Button onClick={() => setAiDraftDrawerVisible(false)}>取消</Button>
                  <Button type="primary" disabled={!currentAiDraft} onClick={handleApplyCurrentDraft}>应用草稿</Button>
                </Space>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: 1, overflow: 'auto', paddingBottom: 20 }}>
                  {aiDraftMessages.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center' }}>
                      <RobotOutlined style={{ fontSize: 48, color: 'var(--primary-color)', opacity: 0.2, marginBottom: 16 }} />
                      <Typography.Title level={4}>开始起草工作流</Typography.Title>
                      <Typography.Text type="secondary">
                        您可以输入业务需求说明，或者提供参考 URL（如 API 文档），AI 将为您生成初步的 Temporal 工作流 DSL。
                      </Typography.Text>

                      <Card style={{ marginTop: 24, textAlign: 'left' }} size="small">
                        <Form layout="vertical">
                          <Form.Item label="业务需求说明" required>
                            <Input.TextArea
                              rows={4}
                              value={aiDraftDescription}
                              onChange={e => setAiDraftDescription(e.target.value)}
                              placeholder="例如：创建一个查询天气并发送通知的流程。输入城市，调用天气接口，如果温度低于 10 度则发送预警。"
                            />
                          </Form.Item>
                          <Form.Item label="参考 URL (可选)">
                            <Input
                              value={aiDraftReferenceUrl}
                              onChange={e => setAiDraftReferenceUrl(e.target.value)}
                              placeholder="例如：https://wttr.in/beijing?format=j1"
                            />
                          </Form.Item>
                          <Button
                            type="primary"
                            block
                            icon={<ThunderboltOutlined />}
                            loading={generateAiDraftMutation.isLoading}
                            onClick={() => {
                              handleGenerateAiDraft();
                            }}
                          >
                            生成初始草稿
                          </Button>
                        </Form>
                      </Card>

                      <Card style={{ marginTop: 16, textAlign: 'left' }} size="small">
                        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
                          <Text strong>继续上次草稿会话</Text>
                          <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            loading={aiDraftSessionsQuery.isFetching}
                            onClick={() => {
                              void aiDraftSessionsQuery.refetch();
                            }}
                          >
                            刷新
                          </Button>
                        </Space>
                        {aiDraftSessionsQuery.isLoading ? (
                          <Alert type="info" showIcon message="正在加载最近草稿会话..." />
                        ) : (aiDraftSessionsQuery.data || []).length === 0 ? (
                          <Alert type="info" showIcon message="暂无历史草稿会话，可直接创建新的草稿。" />
                        ) : (
                          <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            {(aiDraftSessionsQuery.data || []).map((session: AiWorkflowDraftSessionListItem) => (
                              <Card
                                key={session.sessionId}
                                size="small"
                                style={{ borderRadius: 10, border: '1px solid var(--bg-secondary)', background: 'var(--bg-card)' }}
                              >
                                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                  <Space wrap size={[6, 6]} style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Space wrap size={[6, 6]}>
                                      <Tag color="geekblue" style={{ margin: 0 }}>{session.currentDraftName || session.title || '未命名会话'}</Tag>
                                      <Tag color={session.status === 'active' ? 'green' : 'default'} style={{ margin: 0 }}>{session.status}</Tag>
                                      <Tag style={{ margin: 0 }}>消息 {session.messageCount}</Tag>
                                    </Space>
                                    <Space size={6}>
                                      <Popconfirm
                                        title="删除草稿会话"
                                        description="删除后无法恢复，是否继续？"
                                        okText="删除"
                                        cancelText="取消"
                                        okButtonProps={{ danger: true, loading: deleteAiDraftSessionMutation.isLoading }}
                                        onConfirm={() => {
                                          handleDeleteAiDraftSession(session.sessionId);
                                        }}
                                      >
                                        <Button
                                          size="small"
                                          danger
                                          icon={<DeleteOutlined />}
                                          loading={deleteAiDraftSessionMutation.isLoading && deleteAiDraftSessionMutation.variables === session.sessionId}
                                        >
                                          删除
                                        </Button>
                                      </Popconfirm>
                                      <Button size="small" type="primary" onClick={() => {
                                        void handleResumeAiDraftSession(session.sessionId);
                                      }}>
                                        继续
                                      </Button>
                                    </Space>
                                  </Space>
                                  {session.currentDraftDescription ? (
                                    <Text type="secondary">{session.currentDraftDescription}</Text>
                                  ) : null}
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    最后更新: {new Date(session.updatedAt).toLocaleString()}
                                  </Text>
                                </Space>
                              </Card>
                            ))}
                          </Space>
                        )}
                      </Card>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {aiDraftMessages.map((msg, i) => {
                        const isLatestDraft = Boolean(msg.draft) && i === latestDraftMessageIndex;
                        const previousDraft = msg.draft
                          ? [...aiDraftMessages.slice(0, i)].reverse().find((item) => Boolean(item.draft))?.draft
                          : undefined;
                        return (
                        <div
                          key={i}
                          style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            background: msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-secondary)',
                            color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                            padding: '10px 14px',
                            borderRadius: 12,
                            borderBottomRightRadius: msg.role === 'user' ? 2 : 12,
                            borderBottomLeftRadius: msg.role === 'assistant' ? 2 : 12,
                          }}
                        >
                          <div className={msg.role === 'assistant' ? 'chat-message-markdown' : ''}>
                            {msg.role === 'assistant' ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {beautifyText(msg.content)}
                              </ReactMarkdown>
                            ) : (
                              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            )}
                          </div>
                          {msg.draft && (
                             <div
                               style={{
                                 marginTop: 10,
                                borderTop: '1px solid var(--border-color)',
                                 paddingTop: 10,
                               }}
                             >
                               <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                 <div>
                                   <Space wrap size={[6, 6]}>
                                    <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit', fontSize: 13 }}>
                                       草稿预览: {msg.draft.workflowDsl.name}
                                     </Text>
                                     <Tag color={isLatestDraft ? 'processing' : 'default'} style={{ margin: 0 }}>
                                       {isLatestDraft ? '当前版本' : '历史版本'}
                                     </Tag>
                                   </Space>
                                   {msg.draft.description ? (
                                     <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
                                       {msg.draft.description}
                                     </div>
                                   ) : null}
                                 </div>

                                 <Space wrap size={[6, 6]}>
                                   <Tag color="geekblue" style={{ margin: 0 }}>
                                     Task Queue: {msg.draft.taskQueue || 'SKILL_TASK_QUEUE'}
                                   </Tag>
                                   {msg.draft.sourceContext?.referenceUrl ? (
                                     <Tag color="blue" style={{ margin: 0 }}>
                                       参考 URL
                                     </Tag>
                                   ) : null}
                                   <Tag color="purple" style={{ margin: 0 }}>
                                     步骤数: {msg.draft.workflowDsl.steps.length}
                                   </Tag>
                                 </Space>

                                 {msg.draft.sourceContext?.referenceUrl ? (
                                   <div style={{ fontSize: 12, opacity: 0.85, wordBreak: 'break-all' }}>
                                     {msg.draft.sourceContext.referenceUrl}
                                   </div>
                                 ) : null}

                                 {renderDraftDiffSummary(msg.draft, previousDraft)}

                                 {isLatestDraft ? (
                                   <>
                                     {renderDraftContractCard(msg.draft)}

                                     <div>
                                      <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit' }}>关键输入参数</Text>
                                       <div style={{ marginTop: 6 }}>
                                         {renderDraftInputParamSummary(msg.draft)}
                                       </div>
                                     </div>

                                     <div>
                                      <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit' }}>输出结构</Text>
                                       <div style={{ marginTop: 6 }}>
                                         {renderDraftOutputParamSummary(msg.draft)}
                                       </div>
                                     </div>

                                     <div>
                                      <Text strong style={{ color: msg.role === 'user' ? 'white' : 'inherit' }}>步骤摘要</Text>
                                       <div style={{ marginTop: 6 }}>
                                         {renderDraftStepSummary(msg.draft)}
                                       </div>
                                     </div>
                                   </>
                                 ) : (
                                   <Collapse size="small" ghost>
                                     <Panel header="展开查看该历史版本的完整草稿" key={`draft-history-${i}`}>
                                       <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                         {renderDraftContractCard(msg.draft)}
                                         <div>
                                           <Text strong>关键输入参数</Text>
                                           <div style={{ marginTop: 6 }}>
                                             {renderDraftInputParamSummary(msg.draft)}
                                           </div>
                                         </div>
                                         <div>
                                           <Text strong>输出结构</Text>
                                           <div style={{ marginTop: 6 }}>
                                             {renderDraftOutputParamSummary(msg.draft)}
                                           </div>
                                         </div>
                                         <div>
                                           <Text strong>步骤摘要</Text>
                                           <div style={{ marginTop: 6 }}>
                                             {renderDraftStepSummary(msg.draft)}
                                           </div>
                                         </div>
                                       </Space>
                                     </Panel>
                                   </Collapse>
                                 )}

                                 {msg.draft.warnings?.length ? (
                                   <Alert
                                     type="warning"
                                     showIcon
                                     message="草稿提示"
                                     description={msg.draft.warnings.join('；')}
                                   />
                                 ) : null}
                               </Space>
                             </div>
                          )}
                        </div>
                      )})}
                      {(generateAiDraftMutation.isLoading || refineAiDraftMutation.isLoading) && (
                        <div style={{ alignSelf: 'flex-start', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 12 }}>
                          <Space><ReloadOutlined spin /><span>AI 正在思考并生成 DSL...</span></Space>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {aiDraftMessages.length > 0 && (
                  <div style={{ paddingTop: 16, borderTop: '1px solid var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Input.TextArea
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        value={aiDraftInput}
                        onChange={e => setAiDraftInput(e.target.value)}
                        onPressEnter={e => {
                          if (!e.shiftKey) {
                            e.preventDefault();
                            handleRefineAiDraft();
                          }
                        }}
                        placeholder="提出修改建议，例如：增加一个步骤、修改输出参数名..."
                        style={{ borderRadius: 8 }}
                      />
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={() => {
                          handleRefineAiDraft();
                        }}
                        loading={refineAiDraftMutation.isLoading}
                        style={{ height: 'auto' }}
                      />
                    </div>
                  </div>
                )}
              </div>
      </Drawer>
      <Modal
              title="应用草稿前确认"
              open={applyDraftConfirmVisible}
              onCancel={() => setApplyDraftConfirmVisible(false)}
              onOk={() => {
                void handleConfirmApplyCurrentDraft();
              }}
              okText="确认应用"
              cancelText="取消"
              width={720}
            >
              {currentAiDraft ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="这会把当前 AI 草稿回填到工作流编辑器"
                    description="应用后你仍然可以继续人工调整 DSL、生成代码、做真实验证并保存。"
                  />

                  <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Text strong>本次将应用的草稿</Text>
                      <Space wrap size={[6, 6]}>
                        <Tag color="blue" style={{ margin: 0 }}>名称: {currentAiDraft.workflowDsl.name || currentAiDraft.name}</Tag>
                        <Tag color="purple" style={{ margin: 0 }}>步骤: {currentAiDraft.workflowDsl.steps.length}</Tag>
                        <Tag color="red" style={{ margin: 0 }}>必填输入: {Object.entries(currentAiDraft.workflowDsl.inputParams || {}).filter(([, value]) => value.required).length}</Tag>
                        <Tag color="green" style={{ margin: 0 }}>输出字段: {Object.keys(currentAiDraft.workflowDsl.outputParams || {}).length}</Tag>
                      </Space>
                      <Text type="secondary">
                        Task Queue: {currentAiDraft.taskQueue || currentAiDraft.workflowDsl.taskQueue || 'SKILL_TASK_QUEUE'}
                      </Text>
                    </Space>
                  </Card>

                  <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Text strong>关键变化摘要</Text>
                      {currentDraftApplyDiff ? (
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          {currentDraftApplyDiff.addedInputs.length > 0 ? <Alert type="success" showIcon message={`新增输入参数: ${currentDraftApplyDiff.addedInputs.join('，')}`} /> : null}
                          {currentDraftApplyDiff.changedInputs.length > 0 ? <Alert type="warning" showIcon message={`输入参数已调整: ${currentDraftApplyDiff.changedInputs.join('；')}`} /> : null}
                          {currentDraftApplyDiff.addedOutputs.length > 0 ? <Alert type="success" showIcon message={`新增输出字段: ${currentDraftApplyDiff.addedOutputs.join('，')}`} /> : null}
                          {currentDraftApplyDiff.changedOutputs.length > 0 ? <Alert type="warning" showIcon message={`输出字段已调整: ${currentDraftApplyDiff.changedOutputs.join('；')}`} /> : null}
                          {currentDraftApplyDiff.addedSteps.length > 0 ? <Alert type="success" showIcon message={`新增步骤: ${currentDraftApplyDiff.addedSteps.join('，')}`} /> : null}
                          {currentDraftApplyDiff.changedSteps.length > 0 ? <Alert type="warning" showIcon message={`已调整步骤: ${currentDraftApplyDiff.changedSteps.join('，')}`} /> : null}
                          {currentDraftApplyDiff.addedInputs.length === 0
                            && currentDraftApplyDiff.changedInputs.length === 0
                            && currentDraftApplyDiff.addedOutputs.length === 0
                            && currentDraftApplyDiff.changedOutputs.length === 0
                            && currentDraftApplyDiff.addedSteps.length === 0
                            && currentDraftApplyDiff.changedSteps.length === 0 ? (
                              <Alert type="info" showIcon message="当前版本与上一轮相比没有识别到明显结构变化。" />
                            ) : null}
                        </Space>
                      ) : (
                        <Alert type="info" showIcon message="当前没有可比较的上一轮草稿。" />
                      )}
                    </Space>
                  </Card>

                  <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Text strong>应用后建议动作</Text>
                      <Text>1. 检查步骤配置和输入输出定义是否符合预期。</Text>
                      <Text>2. 重新生成工作流代码。</Text>
                      <Text>3. 做真实验证后再保存。</Text>
                    </Space>
                  </Card>
                </Space>
              ) : null}
      </Modal>
      <Modal
              title={<Space size={8}><ThunderboltOutlined style={{ color: 'var(--primary-color)' }} /><span>工作流详情</span></Space>}
              open={detailModalVisible}
              onCancel={() => setDetailModalVisible(false)}
              footer={null}
              width={920}
            >
              {selectedWorkflow && (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
                    <Row gutter={[12, 10]}>
                      <Col span={12}><Text><strong>显示名称:</strong> {selectedWorkflow.workflowDsl?.workflowDefnName || selectedWorkflow.workflowDsl?.name || selectedWorkflow.name}</Text></Col>
                      <Col span={12}><Text><strong>类名:</strong> <Tag color="geekblue">{selectedWorkflow.workflowDsl?.workflowClassName || `${(selectedWorkflow.workflowDsl?.name || selectedWorkflow.name || 'Custom').replace(/\s+/g, '')}Workflow`}</Tag></Text></Col>
                      <Col span={12}><Text><strong>Task Queue:</strong> <Tag color="blue">{selectedWorkflow.taskQueue}</Tag></Text></Col>
                      <Col span={12}><Text><strong>状态:</strong> <Tag color={selectedWorkflow.isActive ? 'green' : 'default'}>{selectedWorkflow.isActive ? '已启用' : '已禁用'}</Tag></Text></Col>
                      <Col span={24}><Text><strong>描述:</strong> {selectedWorkflow.description || '无'}</Text></Col>
                    </Row>
                  </Card>
                  <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
                      <Space direction="vertical" size={0}>
                        <Text strong>执行记录</Text>
                        <Text type="secondary">
                          {resolveWorkflowSourceSkillId(selectedWorkflow)
                            ? `已关联 Skill: ${resolveWorkflowSourceSkillId(selectedWorkflow)}`
                            : '当前工作流未关联 Skill，无法直接创建 executions 记录'}
                        </Text>
                      </Space>
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={() => {
                          void handleCreateExecutionFromWorkflow();
                        }}
                        loading={creatingExecutionWorkflowId === selectedWorkflow.id}
                        disabled={!resolveWorkflowSourceSkillId(selectedWorkflow)}
                      >
                        创建执行记录
                      </Button>
                    </Space>
                  </Card>
                  {selectedWorkflow.sourceContext && (
                    <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
                      <Row gutter={[12, 10]}>
                        <Col span={12}><Text><strong>来源类型:</strong> <Tag color={selectedWorkflow.sourceContext.sourceType === 'template' ? 'purple' : 'geekblue'}>{selectedWorkflow.sourceContext.sourceType || '未知'}</Tag></Text></Col>
                        <Col span={12}><Text><strong>生成时间:</strong> {selectedWorkflow.sourceContext.generatedAt || '无'}</Text></Col>
                        <Col span={24}><Text><strong>参考 URL:</strong> {selectedWorkflow.sourceContext.referenceUrl ? <a href={selectedWorkflow.sourceContext.referenceUrl} target="_blank" rel="noreferrer">{selectedWorkflow.sourceContext.referenceUrl}</a> : '无'}</Text></Col>
                        <Col span={24}><Text><strong>来源说明:</strong> {selectedWorkflow.sourceContext.userDescription || '无'}</Text></Col>
                        {selectedWorkflow.sourceContext.warnings?.length ? (
                          <Col span={24}>
                            <Alert
                              type="warning"
                              showIcon
                              message="AI 草稿警告"
                              description={<Space direction="vertical" size={4}>{selectedWorkflow.sourceContext.warnings.map((warning, index) => <Text key={`${warning}-${index}`}>{warning}</Text>)}</Space>}
                            />
                          </Col>
                        ) : null}
                      </Row>
                    </Card>
                  )}
                  {selectedWorkflow.sourceTemplate && (
                    <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 14 } }}>
                      <Row gutter={[12, 10]}>
                        <Col span={12}><Text><strong>模版 ID:</strong> <Tag color="purple">{selectedWorkflow.sourceTemplate.templateId || '无'}</Tag></Text></Col>
                        <Col span={12}><Text><strong>模版内置 Skill:</strong> {selectedWorkflow.sourceTemplate.skillId ? <Tag color="geekblue">{selectedWorkflow.sourceTemplate.skillId}</Tag> : '无'}</Text></Col>
                        <Col span={12}><Text><strong>模版文件:</strong> {selectedWorkflow.sourceTemplate.fileName || '无'}</Text></Col>
                        <Col span={12}><Text><strong>格式:</strong> <Tag>{selectedWorkflow.sourceTemplate.format || '未知'}</Tag></Text></Col>
                        <Col span={12}><Text><strong>变量数:</strong> {selectedWorkflow.sourceTemplate.variableCount ?? '-'}</Text></Col>
                        <Col span={24}>
                          <Alert
                            type="info"
                            showIcon
                            message="后续 Skill 关联说明"
                            description="当 Capability Release 以该 Temporal Workflow 作为 sourceType=temporal_workflow 发布时，Skill 会继承这里的工作流 DSL、参数定义与输出定义；模版 ID / 内置 Skill ID 则作为来源情报继续用于理解该工作流来自哪个 Carbone 模版。"
                          />
                        </Col>
                      </Row>
                    </Card>
                  )}
                  <Collapse defaultActiveKey={['workflow', 'activities']} ghost>
                    <Panel header={<Text><ThunderboltOutlined /> 步骤引用</Text>} key="steps">
                      <Space direction="vertical" style={{ width: '100%' }} size={10}>
                        {(selectedWorkflow.workflowDsl?.steps || []).map((step, index) => {
                          const sourceMeta = getActivitySourceMeta(step);
                          return (
                            <Card key={step.id || index} size="small" style={{ borderRadius: 10, border: '1px solid var(--bg-secondary)', background: 'var(--bg-card)' }}>
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Space wrap>
                                  <Tag color="green">步骤 {index + 1}</Tag>
                                  <Text strong>{step.name || `步骤 ${index + 1}`}</Text>
                                  {step.type === 'activity' ? <Tag color={sourceMeta.color}>{sourceMeta.label}</Tag> : <Tag>{step.type}</Tag>}
                                </Space>
                                {step.type === 'activity' && (
                                  <Space wrap size={[8, 8]}>
                                    <Text type="secondary">引用: {sourceMeta.ref}</Text>
                                    <Text type="secondary">名称: {sourceMeta.name}</Text>
                                  </Space>
                                )}
                              </Space>
                            </Card>
                          );
                        })}
                        {(selectedWorkflow.workflowDsl?.steps || []).length === 0 && (
                          <Alert type="info" showIcon message="当前工作流暂无步骤" />
                        )}
                      </Space>
                    </Panel>
                    <Panel header={<Text><CodeOutlined /> Workflow DSL</Text>} key="workflow">
                      <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: 16, borderRadius: 10, maxHeight: 320, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedWorkflow.workflowDsl, null, 2)}</pre>
                    </Panel>
                    <Panel header={<Text><ApiOutlined /> 工作单元 DSL</Text>} key="activities">
                      <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: 16, borderRadius: 10, maxHeight: 320, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(selectedWorkflow.activityDsl, null, 2)}</pre>
                    </Panel>
                  </Collapse>
                </Space>
              )}
      </Modal>
      <Modal title={<div style={{ textAlign: 'center', width: '100%' }}><Space direction="vertical" size={2}><Space size={8}><ThunderboltOutlined style={{ color: 'var(--primary-color)' }} /><Text strong style={{ fontSize: 18 }}>{editingWorkflow ? '编辑工作流' : '创建工作流'}</Text></Space><Text type="secondary" style={{ fontSize: 12 }}>配置工作流基础信息、执行参数、步骤编排与 AI 代码生成</Text></Space></div>} open={visible} onOk={handleSave} onCancel={() => onCancel(false)}
              footer={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Space size={6} style={{ marginRight: 'auto' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>强制 AI 生成</Text>
                    <Switch
                      size="small"
                      checked={forceAiGeneration}
                      onChange={setForceAiGeneration}
                      disabled={codeGenerationState.isStreaming}
                    />
                    <Tooltip title="开启后会跳过固定模版编译路径，即使当前 DSL 命中确定性模式，也会直接走 AI 代码生成。">
                      <InfoCircleOutlined style={{ color: 'var(--text-secondary)' }} />
                    </Tooltip>
                  </Space>
                  <Button size="small" key="validate" icon={<PlayCircleOutlined />} onClick={handleValidate}>验证DSL</Button>
                  <Button size="small" key="generate" icon={<RobotOutlined />} onClick={() => {
                    void handleGenerateCode();
                  }} loading={codeGenerationState.isStreaming}>AI生成代码</Button>
                  <Button size="small" key="realValidation" icon={<ExperimentOutlined />} onClick={handleOpenRealValidation} loading={realValidationState.isStreaming} disabled={!generatedCode}>真实验证</Button>
                  <Button size="small" key="viewCode" icon={<CodeOutlined />} onClick={() => setCodeModalVisible(true)} disabled={!generatedCode}>查看代码</Button>
                  <Button size="small" key="cancel" onClick={() => onCancel(false)}>取消</Button>
                  <Button size="small" key="save" type="primary" loading={loading} onClick={handleSave}>保存</Button>
                </div>
              }
              width={1200} style={{ top: 20 }}>
              <Form form={form} layout="vertical">
                <Card title="基础信息" size="small" style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }} styles={{ body: SECTION_CARD_BODY_STYLE }}>
                  {isGeneratedCodeStale && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="工作流配置已变更，旧代码已失效"
                      description="你刚刚修改了步骤、参数或配置，系统已清空旧的生成代码。请重新点击“AI生成代码”后再做真实验证。"
                    />
                  )}
                  {currentSourceContext && (
                    <Alert
                      type={currentSourceContext.sourceType === 'template' ? 'info' : 'success'}
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={currentSourceContext.sourceType === 'template' ? '当前工作流来自模版' : '当前工作流包含 AI 草稿来源信息'}
                      description={
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Space wrap size={[8, 8]}>
                            {currentSourceContext.sourceType ? <Tag color={currentSourceContext.sourceType === 'template' ? 'purple' : 'geekblue'}>来源: {currentSourceContext.sourceType}</Tag> : null}
                            {currentSourceContext.generatedAt ? <Tag>生成时间: {currentSourceContext.generatedAt}</Tag> : null}
                            {currentSourceContext.referenceUrl ? <Tag color="blue">参考 URL</Tag> : null}
                          </Space>
                          {currentSourceContext.referenceUrl ? <Text copyable>{currentSourceContext.referenceUrl}</Text> : null}
                          {currentSourceContext.userDescription ? <Text>{currentSourceContext.userDescription}</Text> : null}
                          {currentSourceContext.warnings?.length ? (
                            <Space direction="vertical" size={2}>
                              {currentSourceContext.warnings.map((warning, index) => (
                                <Text key={`${warning}-${index}`} type="warning">{warning}</Text>
                              ))}
                            </Space>
                          ) : null}
                        </Space>
                      }
                    />
                  )}
                  {currentSourceTemplate && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message="当前工作流来自模版"
                      description={
                        <Space wrap size={[8, 8]}>
                          <Tag color="purple">模版 ID: {currentSourceTemplate.templateId || '无'}</Tag>
                          {currentSourceTemplate.skillId ? <Tag color="geekblue">内置 Skill: {currentSourceTemplate.skillId}</Tag> : <Tag>内置 Skill: 无</Tag>}
                          {currentSourceTemplate.fileName ? <Tag>文件: {currentSourceTemplate.fileName}</Tag> : null}
                          {currentSourceTemplate.format ? <Tag>格式: {currentSourceTemplate.format}</Tag> : null}
                          {currentSourceTemplate.variableCount !== undefined ? <Tag>变量数: {currentSourceTemplate.variableCount}</Tag> : null}
                        </Space>
                      }
                    />
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>工作流名称</Text>
                      <Form.Item name="name" rules={[{ required: true, message: '请输入工作流名称' }]} style={{ marginBottom: 0, flex: 1 }}>
                        <Input size="small" placeholder="例如：天气查询流程" />
                      </Form.Item>
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>函数名</Text>
                      <Input
                        size="small"
                        value={workflowDsl.workflowClassName || ''}
                        placeholder="例如：WeatherQueryWorkflow"
                        onChange={(e) => {
                          const nextName = e.target.value;
                          setWorkflowDsl({
                            ...workflowDsl,
                            workflowClassName: nextName,
                            workflowDefnName: workflowDsl.workflowDefnName || nextName,
                          });
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text style={{ whiteSpace: 'nowrap', minWidth: 72 }}>队列名</Text>
                      <Form.Item
                        name="taskQueue"
                        rules={[{ required: true, message: '请输入Task Queue' }]}
                        style={{ marginBottom: 0, flex: 1 }}
                        tooltip="Temporal Worker 监听的队列名称，用于路由当前工作流任务。"
                      >
                        <Input size="small" placeholder="例如：SKILL_TASK_QUEUE" />
                      </Form.Item>
                    </div>
                  </div>
                  <Form.Item name="description" label="描述" style={{ marginBottom: 0 }}>
                    <Input.TextArea rows={2} placeholder="工作流描述" />
                  </Form.Item>
                </Card>

                <Card title="执行配置" size="small" style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }} styles={{ body: SECTION_CARD_BODY_STYLE }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderWorkflowDurationField(
                        'workflowExecutionTimeout',
                        '执行超时',
                        'Execution Timeout 是整个工作流从开始到彻底结束的总上限，包含重试和 Continue-As-New。默认单位为秒，可切换为分或小时。',
                        !!workflowDsl.workflowExecutionTimeout,
                        '10m',
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderWorkflowDurationField(
                        'workflowRunTimeout',
                        '运行超时',
                        'Run Timeout 只限制当前这一轮运行实例，不覆盖整个 Workflow Execution。默认单位为秒，可切换为分或小时。',
                        !!workflowDsl.workflowRunTimeout,
                        '5m',
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renderWorkflowDurationField(
                        'workflowTaskTimeout',
                        '任务超时',
                        'Task Timeout 是 Worker 每次处理一小段工作流决策代码的时间上限，主要用于探测 Worker 卡住或异常。默认单位为秒，可切换为分或小时。',
                        !!workflowDsl.workflowTaskTimeout,
                        '10s',
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Form.Item label={renderTipLabel('默认工作单元重试次数', '未单独覆盖时，工作流内工作单元的默认最大重试次数。')} style={{ marginBottom: 0 }}>
                        <Space size={8}>
                          <Switch checked={workflowDsl.defaultActivityRetryPolicy?.maxRetries !== undefined && workflowDsl.defaultActivityRetryPolicy?.maxRetries !== null} onChange={checked => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, maxRetries: checked ? 3 : undefined } })} />
                          <InputNumber
                            size="small"
                            min={0}
                            disabled={workflowDsl.defaultActivityRetryPolicy?.maxRetries === undefined || workflowDsl.defaultActivityRetryPolicy?.maxRetries === null}
                            value={workflowDsl.defaultActivityRetryPolicy?.maxRetries ?? 3}
                            onChange={value => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, maxRetries: value ?? 3 } })}
                            style={{ width: 88 }}
                          />
                        </Space>
                      </Form.Item>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Form.Item label={renderTipLabel('退避系数', '指数退避系数，默认 2.0。')} style={{ marginBottom: 0 }}>
                        <Space size={8}>
                          <Switch checked={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient !== undefined} onChange={checked => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, backoffCoefficient: checked ? 2.0 : undefined } })} />
                          <InputNumber
                            size="small"
                            min={0}
                            step={0.1}
                            disabled={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient === undefined}
                            value={workflowDsl.defaultActivityRetryPolicy?.backoffCoefficient ?? 2.0}
                            onChange={value => setWorkflowDsl({ ...workflowDsl, defaultActivityRetryPolicy: { ...workflowDsl.defaultActivityRetryPolicy, backoffCoefficient: value ?? 2.0 } })}
                            style={{ width: 88 }}
                          />
                        </Space>
                      </Form.Item>
                    </div>
                  </div>
                </Card>

                <Card
                  title={(
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, width: '100%' }}>
                      <Space size={6} style={{ minWidth: 0 }}>
                        <span>输入参数</span>
                        <Text type="secondary">（Workflow 入口参数；有分组信息时按 sheet/分组展示）</Text>
                        <Tooltip title="模版工作流会优先按 Skill 参数生成入口参数；若携带 sheet/分组信息，会自动分组展示并区分普通变量与循环变量。">
                          <InfoCircleOutlined style={{ color: 'var(--text-light)' }} />
                        </Tooltip>
                      </Space>
                      <Button
                        size="small"
                        type="dashed"
                        onClick={() => {
                          const key = prompt('请输入参数名:');
                          if (key && key.trim()) {
                            setWorkflowDsl({
                              ...workflowDsl,
                              inputParams: { ...workflowDsl.inputParams, [key.trim()]: { description: '', required: false, defaultValue: '' } }
                            });
                          }
                        }}
                        style={{ minWidth: 112, marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}
                      >
                        + 添加输入参数
                      </Button>
                    </div>
                  )}
                  size="small"
                  style={{ ...SECTION_CARD_STYLE, marginBottom: 16 }}
                  styles={{ body: SECTION_CARD_BODY_STYLE }}
                >
                  <div style={SOFT_PANEL_STYLE}>
                    {groupedWorkflowInputParams.length <= 1 ? (
                      groupedWorkflowInputParams.length === 0 ? (
                        <Text type="secondary">当前没有输入参数，可手动添加。</Text>
                      ) : (
                        renderWorkflowInputGroup(groupedWorkflowInputParams[0])
                      )
                    ) : (
                      <Tabs
                        type="card"
                        items={groupedWorkflowInputParams.map((group) => ({
                          key: group.key,
                          label: (
                            <Space size={6}>
                              <span>{group.label}</span>
                              {group.scalarEntries.length > 0 ? <Tag style={{ margin: 0 }}>普通 {group.scalarEntries.length}</Tag> : null}
                              {group.arrayGroups.length > 0 ? <Tag color="purple" style={{ margin: 0 }}>循环 {group.arrayGroups.length}</Tag> : null}
                            </Space>
                          ),
                          children: renderWorkflowInputGroup(group),
                        }))}
                      />
                    )}
                  </div>
                </Card>
              </Form>

              <Divider style={{ margin: '20px 0 16px' }}><Text strong>工作流配置</Text></Divider>

              <Row gutter={12} align="top" wrap={false}>
                <Col
                  flex={`${resourceSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : RESOURCE_SIDEBAR_WIDTH}px`}
                  style={{ transition: 'all 0.24s ease', minWidth: 0 }}
                >
                  <Card size="small" style={{ ...SECTION_CARD_STYLE, height: '100%', overflow: 'hidden', transition: 'all 0.24s ease' }} styles={{ body: { padding: resourceSidebarCollapsed ? 6 : 12 } }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={resourceSidebarCollapsed ? 8 : 10}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        {!resourceSidebarCollapsed && <Text strong>工作单元资源池</Text>}
                        <Tooltip title={resourceSidebarCollapsed ? '展开工作单元资源池' : '收起工作单元资源池'}>
                          <Button
                            size="small"
                            type="text"
                            icon={<ApiOutlined />}
                            onClick={() => setResourceSidebarCollapsed((prev) => !prev)}
                          />
                        </Tooltip>
                      </Space>
                      {resourceSidebarCollapsed ? (
                        <div style={{ minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Tooltip title="工作单元资源池，点击图标展开">
                            <Button
                              type="text"
                              icon={<ApiOutlined style={{ fontSize: 18 }} />}
                              onClick={() => setResourceSidebarCollapsed(false)}
                            />
                          </Tooltip>
                        </div>
                      ) : (
                        <>
                          <Input placeholder="搜索工作单元..." prefix={<SearchOutlined />} style={{ marginBottom: 8 }} allowClear />
                          <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'hidden', paddingRight: 2 }}>
                            {activityResources.map(activity => {
                              const isAdded = workflowDsl.steps.some(s =>
                                (s.activityRef && s.activityRef === activity.ref)
                                || s.activityName === activity.name,
                              );
                              return (
                                <Card
                                  key={activity.ref}
                                  hoverable
                                  size="small"
                                  style={{
                                    marginBottom: 6,
                                    cursor: 'pointer',
                                    background: isAdded ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                                    border: isAdded ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--bg-secondary)',
                                  }}
                                  onClick={() => !isAdded && handleAddActivityFromPool(activity)}
                                >
                                  <Space wrap size={[6, 6]}>
                                    <Tag color={activity.handler === 'api' ? 'green' : activity.handler === 'script' ? 'orange' : 'blue'}>{activity.handler.toUpperCase()}</Tag>
                                    {activity.source === 'builtin' ? <Tag color="gold">内置</Tag> : null}
                                    <Text
                                      strong={!isAdded}
                                      type={isAdded ? 'secondary' : undefined}
                                      style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}
                                    >
                                      {activity.name}
                                    </Text>
                                    {isAdded && <Tag color="green">已添加</Tag>}
                                  </Space>
                                </Card>
                              );
                            })}
                            {activityResources.length === 0 && (
                              <Alert message="暂无已验证的工作单元" type="warning" showIcon />
                            )}
                          </div>
                        </>
                      )}
                    </Space>
                  </Card>
                </Col>

                <Col
                  flex={`${stepsSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : STEPS_SIDEBAR_WIDTH}px`}
                  style={{ transition: 'all 0.24s ease', minWidth: 0 }}
                >
                  <Card size="small" style={{ ...SECTION_CARD_STYLE, height: '100%', overflow: 'hidden', transition: 'all 0.24s ease' }} styles={{ body: { padding: stepsSidebarCollapsed ? 6 : 12 } }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={stepsSidebarCollapsed ? 8 : 10}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        {!stepsSidebarCollapsed && <Text strong>流程步骤</Text>}
                        <Space size={4}>
                          {!stepsSidebarCollapsed && (
                            <Button icon={<PlusOutlined />} size="small" style={{ minWidth: 92 }} onClick={handleAddStep}>添加步骤</Button>
                          )}
                          <Tooltip title={stepsSidebarCollapsed ? '展开流程步骤' : '收起流程步骤'}>
                            <Button
                              size="small"
                              type="text"
                              icon={<ThunderboltOutlined />}
                              onClick={() => setStepsSidebarCollapsed((prev) => !prev)}
                            />
                          </Tooltip>
                        </Space>
                      </Space>
                      {stepsSidebarCollapsed ? (
                        <div style={{ minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Tooltip title={`流程步骤（${workflowDsl.steps.length}），点击图标展开`}>
                            <Button
                              type="text"
                              icon={<ThunderboltOutlined style={{ fontSize: 18 }} />}
                              onClick={() => setStepsSidebarCollapsed(false)}
                            />
                          </Tooltip>
                        </div>
                      ) : workflowDsl.steps.length === 0 ? (
                        <Alert message="从左侧勾选工作单元或点击添加步骤" type="info" showIcon />
                      ) : (
                        <Timeline>{workflowDsl.steps.map((step, index) => (
                          <Timeline.Item
                            key={step.id}
                            color={selectedStepIndexForConfig === index ? 'green' : 'blue'}
                            dot={selectedStepIndexForConfig === index ? <CheckCircleOutlined /> : undefined}
                          >
                            <Card
                              hoverable
                              size="small"
                              style={{
                                marginBottom: 6,
                                cursor: 'pointer',
                                background: selectedStepIndexForConfig === index ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                                border: selectedStepIndexForConfig === index ? '2px solid rgba(16, 185, 129, 0.6)' : '1px solid var(--bg-secondary)',
                              }}
                              onClick={() => {
                                setSelectedStepIndexForConfig(index);
                                syncWorkflowInputParamsFromSteps();
                              }}
                            >
                              <Space direction="vertical" style={{ width: '100%' }}>
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                  <Input
                                    value={step.name}
                                    onChange={e => handleUpdateStep(index, 'name', e.target.value)}
                                    placeholder="步骤名称"
                                    style={{ width: 120 }}
                                    size="small"
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <Space size="small">
                                    <Button
                                      icon={<DeleteOutlined />}
                                      danger
                                      size="small"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveStep(index); }}
                                    />
                                    {index > 0 && (
                                      <Button icon={<SearchOutlined />} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index - 1); else if (selectedStepIndexForConfig === index - 1) setSelectedStepIndexForConfig(index); }} />
                                    )}
                                    {index < workflowDsl.steps.length - 1 && (
                                      <Button icon={<SearchOutlined />} size="small" onClick={(e) => { e.stopPropagation(); const newSteps = [...workflowDsl.steps]; [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]]; setWorkflowDsl({ ...workflowDsl, steps: newSteps }); if (selectedStepIndexForConfig === index) setSelectedStepIndexForConfig(index + 1); else if (selectedStepIndexForConfig === index + 1) setSelectedStepIndexForConfig(index); }} />
                                    )}
                                  </Space>
                                </Space>
                                {step.type === 'activity' && (
                                  <Space>
                                    <Tag color="green">{resolveStepActivity(step)?.name || step.activityName || '未选择'}</Tag>
                                    {step.activityRef?.startsWith('builtin:') ? <Tag color="gold">内置</Tag> : null}
                                    {isStructuredTransformActivity(resolveStepActivity(step), step) ? <Tag color="purple">结构化转换</Tag> : null}
                                    <Button size="small" onClick={(e) => { e.stopPropagation(); handleOpenActivitySelector(index); }}>更换</Button>
                                  </Space>
                                )}
                              </Space>
                            </Card>
                          </Timeline.Item>
                        ))}</Timeline>
                      )}
                    </Space>
                  </Card>
                </Col>

                <Col flex="auto" style={{ minWidth: 0, transition: 'all 0.24s ease' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: showDedicatedHttpAiZone ? 'minmax(0, 1.2fr) minmax(360px, 0.8fr)' : 'minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
                    <Card size="small" style={SECTION_CARD_STYLE} styles={{ body: { padding: 12 } }}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>步骤配置</Text>
                      {selectedStepIndexForConfig !== null && selectedStep ? (
                        <Card size="small" style={{ ...SECTION_CARD_STYLE, background: 'var(--bg-card)' }} styles={{ body: { padding: 14 } }}>
                          <Form layout="vertical" size="small">
                            {selectedStep.type === 'activity' && (
                              <Collapse
                                size="small"
                                activeKey={stepConfigActiveKeys}
                                onChange={(keys) => setStepConfigActiveKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
                              >
                            <Panel header={renderTipLabel('步骤执行控制', '默认只开启单次执行超时。按 Temporal 常见实践，单次执行超时默认开启；整体完成超时用于约束排队+重试总时长，心跳超时仅适合 Activity 内显式上报 heartbeat 的长任务，默认关闭。')} key="execution-control">
                              <div style={TWO_COLUMN_GRID_STYLE}>
                                <div>{renderStepDurationField('startToCloseTimeout', '单次执行超时', '限制当前步骤里这次工作单元执行时长。默认单位为秒，可切换为分或小时。')}</div>
                                <div>{renderStepDurationField('scheduleToCloseTimeout', '整体完成超时', '限制该步骤从调度到最终完成的总时长，包含排队、执行和重试。默认单位为秒，可切换为分或小时。', { canDisable: true })}</div>
                                <div>{renderStepDurationField('heartbeatTimeout', '心跳超时', '长耗时工作单元可通过心跳汇报存活；超时表示长时间未汇报。默认单位为秒，可切换为分或小时。', { canDisable: true })}</div>
                              </div>
                            </Panel>

                            {isHttpRequestActivity(selectedStepActivity, selectedStep) && selectedStepIndexForConfig !== null && (
                              <Panel header="Activity 调用参数" key="activity-input">
                                <div style={{ ...TWO_COLUMN_GRID_STYLE, gridTemplateColumns: '92px minmax(0, 1fr)' }}>
                                  <Form.Item label={renderTipLabel('请求方法', '内置 httpRequest 最终执行的 HTTP Method。')} style={{ marginBottom: 10 }}>
                                    <Select
                                      size="middle"
                                      value={selectedStepHttpConfig.method || 'GET'}
                                      onChange={(value) => updateStepHttpRequestConfig(selectedStepIndexForConfig, { method: value })}
                                      options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((value) => ({ label: value, value }))}
                                      style={{ width: '100%', height: 32 }}
                                    />
                                  </Form.Item>
                                  <Form.Item label={renderTipLabel('URL 模版', '可填写固定 URL，或使用 {city} 这类占位符进行动态拼装。')} style={{ marginBottom: 10 }}>
                                    <Input
                                      size="middle"
                                      value={selectedStepHttpConfig.urlTemplate || ''}
                                      onChange={(e) => updateStepHttpRequestConfig(selectedStepIndexForConfig, { urlTemplate: e.target.value })}
                                      placeholder="例如：https://api.weather.example.com/current"
                                      style={{ height: 32 }}
                              />
                            </Form.Item>
                          </div>

                          <div style={{ ...CONFIG_SECTION_STYLE, marginBottom: 10 }}>
                            <Text strong style={{ display: 'block', marginBottom: 10 }}>请求参数</Text>
                            <div style={TWO_COLUMN_GRID_STYLE}>
                              {renderHttpTemplateMapEditor('queryTemplate', 'Query 参数', '例如 city -> {city}，最终会组装为 params。')}
                              {renderHttpTemplateMapEditor('headersTemplate', '请求头', '例如 Authorization -> Bearer {token}。')}
                            </div>
                          </div>

                          <div style={{ ...CONFIG_SECTION_STYLE, marginBottom: 0 }}>
                            <Text strong style={{ display: 'block', marginBottom: 10 }}>请求体 Body</Text>
                            <div style={TWO_COLUMN_GRID_STYLE}>
                              {renderHttpTemplateMapEditor('jsonTemplate', 'JSON Body', '适合 POST/PUT 场景，值支持占位符。')}
                              {renderHttpTemplateMapEditor('dataTemplate', 'Form/Data Body', '如需 form 或普通 body，可在这里配置键值。')}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'end', justifyContent: 'space-between' }}>
                            <Form.Item label={renderTipLabel('请求超时（秒）', '这是 HTTP 请求本身的 timeout，不是 Temporal 步骤执行超时。')} style={{ marginBottom: 0 }}>
                              <InputNumber
                                size="small"
                                min={1}
                                value={selectedStepHttpConfig.timeout ?? 30}
                                onChange={(value) => updateStepHttpRequestConfig(selectedStepIndexForConfig, { timeout: Number(value || 30) })}
                                style={{ width: 180 }}
                              />
                            </Form.Item>
                            <Button
                              type="default"
                              icon={<RobotOutlined />}
                              loading={previewHttpConfigMutation.isLoading}
                              onClick={handleOpenHttpAiPanel}
                            >
                              AI 优化
                            </Button>
                          </div>
                        </Panel>
                      )}

                      {isHttpRequestActivity(selectedStepActivity, selectedStep) && selectedStepIndexForConfig !== null && (
                        <Panel header="步骤内部结果处理" key="result-processing">
                          <Form.Item label={renderTipLabel('返回值模式', '控制 Workflow 最终返回完整响应、body，或 body 某个路径。')} style={{ marginBottom: 10 }}>
                            <Select
                              size="small"
                              value={selectedStepHttpConfig.responseMode || 'body'}
                              onChange={(value) => updateStepHttpRequestConfig(selectedStepIndexForConfig, { responseMode: value as HttpResponseMode })}
                              options={[
                                { label: '仅返回 Body', value: 'body' },
                                { label: '返回完整响应', value: 'full' },
                                { label: '返回 Body 路径', value: 'bodyPath' },
                                { label: '返回多字段对象', value: 'bodyMap' },
                              ]}
                            />
                          </Form.Item>
                          {(selectedStepHttpConfig.responseMode || 'body') === 'bodyPath' && (
                            <Form.Item label={renderTipLabel('Body 路径', '用点路径提取 body 中的字段，例如 data.current.temp。')} style={{ marginBottom: 10 }}>
                              <Input
                                size="small"
                                value={selectedStepHttpConfig.responseBodyPath || ''}
                                onChange={(e) => updateStepHttpRequestConfig(selectedStepIndexForConfig, { responseBodyPath: e.target.value })}
                                placeholder="例如：data.current.temp"
                              />
                            </Form.Item>
                          )}
                          {(selectedStepHttpConfig.responseMode || 'body') === 'bodyMap' && (
                            <div style={{ ...CONFIG_SECTION_STYLE, marginBottom: 10 }}>
                              <Text strong style={{ display: 'block', marginBottom: 8 }}>多字段返回映射</Text>
                              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                                运行时会按这里的字段名和路径，从 body 中提取多个字段并返回结构化对象。
                              </Text>
                              {renderHttpTemplateMapEditor('responseFieldMappings', '字段映射', '左侧为返回字段名，右侧为 body 相对路径，例如 weatherText -> current_condition.0.lang_zh.0.value。')}
                            </div>
                          )}
                          {realValidationLeafPaths.length > 0 && (
                            <Form.Item label={renderTipLabel('结果路径建议', '基于最近一次真实验证结果自动展开的可选字段，可直接点击填入 Body 路径。')} style={{ marginBottom: 0 }}>
                              <div style={{ border: '1px dashed var(--bg-secondary)', padding: 8, borderRadius: 8, background: 'var(--bg-card)', maxHeight: 180, overflow: 'auto' }}>
                                <Space wrap size={[6, 6]}>
                                  {realValidationLeafPaths.slice(0, 40).map((item) => (
                                    <Button
                                      key={item.path}
                                      size="small"
                                      onClick={() => applySuggestedResponsePath(item.path)}
                                    >
                                      {item.path}
                                    </Button>
                                  ))}
                                </Space>
                              </div>
                            </Form.Item>
                          )}
                        </Panel>
                      )}

                      {isStructuredTransformActivity(selectedStepActivity, selectedStep) && selectedStepIndexForConfig !== null && (
                        <Panel header="结构化转换配置" key="structured-transform">
                          {(() => {
                            const isAiStructuredTransform = selectedStepActivity?.fn === 'aiStructuredTransform'
                              || selectedStep?.activityRef === 'builtin:aiStructuredTransform'
                              || selectedStep?.activityName === 'aiStructuredTransform';
                            return (
                              <>
                          <div style={{ ...TWO_COLUMN_GRID_STYLE, gridTemplateColumns: '140px minmax(0, 1fr)' }}>
                            <Form.Item label={renderTipLabel('输入内容类型', '指定输入内容主要是什么类型，帮助结构化转换器理解内容。')} style={{ marginBottom: 10 }}>
                              <Select
                                size="middle"
                                value={selectedStepStructuredTransformConfig.contentType || 'text'}
                                onChange={(value) => updateStepStructuredTransformConfig(selectedStepIndexForConfig, { contentType: value as StructuredTransformContentType })}
                                options={[
                                  { label: '纯文本', value: 'text' },
                                  { label: 'HTML', value: 'html' },
                                  { label: 'JSON', value: 'json' },
                                ]}
                              />
                            </Form.Item>
                            <Form.Item label={renderTipLabel('输出模式', '控制结构化转换结果最终返回 JSON 还是纯文本。')} style={{ marginBottom: 10 }}>
                              <Select
                                size="middle"
                                value={selectedStepStructuredTransformConfig.outputMode || 'json'}
                                onChange={(value) => updateStepStructuredTransformConfig(selectedStepIndexForConfig, { outputMode: value as StructuredTransformOutputMode })}
                                options={[
                                  { label: 'JSON', value: 'json' },
                                  { label: '文本', value: 'text' },
                                ]}
                              />
                            </Form.Item>
                          </div>

                          <Alert
                            type={isAiStructuredTransform ? 'warning' : 'info'}
                            showIcon
                            style={{ marginBottom: 10 }}
                            message={isAiStructuredTransform ? '当前为 AI 结构化转换：适合归纳、摘要、模糊理解。' : '当前为固定规则结构化转换：默认优先使用字段映射和文本模版，不调用 AI。'}
                          />

                          <Form.Item label={renderTipLabel('内容模版', '输入待处理内容，可填固定文本或 {html}/{payload} 这类占位符。')} style={{ marginBottom: 10 }}>
                            <Input.TextArea
                              rows={5}
                              value={selectedStepStructuredTransformConfig.contentTemplate || ''}
                              onChange={(e) => updateStepStructuredTransformConfig(selectedStepIndexForConfig, { contentTemplate: e.target.value })}
                              placeholder="例如：{html}"
                            />
                          </Form.Item>

                          <Form.Item label={renderTipLabel('处理规则', isAiStructuredTransform ? 'AI 转换时必须提供清晰规则，说明如何提取、清洗、映射字段，以及如何组织返回结果。' : '固定规则模式下该字段可作为备注说明，真正执行优先依赖字段映射和文本模版。')} style={{ marginBottom: 10 }}>
                            <Input.TextArea
                              rows={4}
                              value={selectedStepStructuredTransformConfig.instructionTemplate || ''}
                              onChange={(e) => updateStepStructuredTransformConfig(selectedStepIndexForConfig, { instructionTemplate: e.target.value })}
                              placeholder={isAiStructuredTransform ? '例如：提取页面中的标题、摘要、发布时间，返回标准 JSON。' : '例如：固定规则说明，可描述字段含义或格式化目标。'}
                            />
                          </Form.Item>

                          <Space size={8} style={{ margin: '4px 0 12px' }}>
                            <Button
                              size="small"
                              type="primary"
                              icon={<RobotOutlined />}
                              onClick={() => {
                                void (async () => {
                                  if (selectedStepIndexForConfig === null) return;
                                  const prevIndex = selectedStepIndexForConfig - 1;
                                  if (prevIndex < 0 || !workflowDsl.steps[prevIndex]) {
                                    void message.warning('请将结构化转换步骤放在一个 HTTP 步骤之后');
                                    return;
                                  }
                                  const prevStep = workflowDsl.steps[prevIndex];
                                  const prevActivity = resolveStepActivity(prevStep);
                                  if (!isHttpRequestActivity(prevActivity, prevStep)) {
                                    void message.warning('上一步不是 HTTP 请求，无法自动生成结构化配置');
                                    return;
                                  }
                                  try {
                                    const httpConfig = getStepHttpRequestConfig(prevStep, prevActivity);
                                    const sampleParams = collectWorkflowInputParams();
                                    const preview = await temporalWorkflowApi.previewHttpRequestConfig(httpConfig, sampleParams);
                                    if (!preview.success || !preview.previewResponse) {
                                      void message.error(preview.error || '获取上一步返回样本失败');
                                      return;
                                    }
                                    const userGoal = selectedStepAiPrompt || '请将今天的天气信息提炼为结构化 JSON，包含天气描述与摄氏温度';
                                    const gen = await temporalWorkflowApi.generateStructuredTransformConfig(
                                      preview.previewResponse.body ?? preview.previewResponse,
                                      userGoal,
                                      selectedStepStructuredTransformConfig,
                                    );
                                    if (!gen.success || !gen.config) {
                                      void message.error(gen.error || 'AI 生成结构化配置失败');
                                      return;
                                    }
                                    const generatedConfig = gen.config;
                                    updateStepStructuredTransformConfig(selectedStepIndexForConfig, {
                                      contentType: generatedConfig.contentType || selectedStepStructuredTransformConfig.contentType || 'json',
                                      contentTemplate: generatedConfig.contentTemplate || selectedStepStructuredTransformConfig.contentTemplate || '{content}',
                                      instructionTemplate: generatedConfig.instructionTemplate || selectedStepStructuredTransformConfig.instructionTemplate || '',
                                      outputMode: generatedConfig.outputMode || selectedStepStructuredTransformConfig.outputMode || 'json',
                                      outputSchema: generatedConfig.outputSchema || selectedStepStructuredTransformConfig.outputSchema || {},
                                      contextTemplate: generatedConfig.contextTemplate || selectedStepStructuredTransformConfig.contextTemplate || '',
                                      fieldMappings: generatedConfig.fieldMappings || selectedStepStructuredTransformConfig.fieldMappings || {},
                                      textTemplate: generatedConfig.textTemplate || selectedStepStructuredTransformConfig.textTemplate || '',
                                    });
                                    if (selectedStep?.id) {
                                      setStructuredTransformSchemaDrafts((prev) => ({
                                        ...prev,
                                        [selectedStep.id]: JSON.stringify(generatedConfig.outputSchema || {}, null, 2),
                                      }));
                                    }
                                    void message.success('已生成结构化转换配置');
                                  } catch (error: unknown) {
                                    void message.error(resolveApiErrorMessage(error, 'AI 生成结构化配置失败'));
                                  }
                                })();
                              }}
                            >
                              AI 生成配置
                            </Button>
                          </Space>

                          {!isAiStructuredTransform && renderStructuredTransformMapEditor(
                            '字段映射',
                            '固定规则模式下，左侧是输出字段名，右侧是来源路径或变量名，例如 weatherText -> current.weather.text。',
                          )}

                          {!isAiStructuredTransform && selectedStructuredTransformIssues.length > 0 && (
                            <Alert
                              style={{ marginBottom: 10 }}
                              type="warning"
                              showIcon
                              message="固定规则转换配置未对齐"
                              description={(
                                <div>
                                  {selectedStructuredTransformIssues.map((item, index) => (
                                    <div key={`structured-transform-issue-${index}`}>{item}</div>
                                  ))}
                                </div>
                              )}
                            />
                          )}

                          {!isAiStructuredTransform && (selectedStepStructuredTransformConfig.outputMode || 'json') === 'text' && (
                            <Form.Item label={renderTipLabel('文本模版', '固定规则文本输出时，优先使用模版拼接最终文本，可引用 fieldMappings 或输入字段。')} style={{ marginBottom: 10 }}>
                              <Input.TextArea
                                rows={4}
                                value={selectedStepStructuredTransformConfig.textTemplate || ''}
                                onChange={(e) => updateStepStructuredTransformConfig(selectedStepIndexForConfig, { textTemplate: e.target.value })}
                                placeholder={'例如：Weather: {weatherText}\nTemp: {temperatureC} C'}
                              />
                            </Form.Item>
                          )}

                          <Form.Item label={renderTipLabel('输出规则', '建议填写 JSON 对象结构，描述希望返回哪些字段及其含义。')} style={{ marginBottom: 10 }}>
                            <Input.TextArea
                              rows={6}
                              value={selectedStructuredTransformSchemaDraft}
                              onChange={(e) => {
                                if (selectedStep?.id) {
                                  updateStructuredTransformSchemaDraft(selectedStep.id, e.target.value);
                                }
                              }}
                              placeholder={'例如：{\n  "title": "页面标题",\n  "summary": "摘要"\n}'}
                              status={selectedStructuredTransformSchemaError ? 'error' : undefined}
                            />
                            {selectedStructuredTransformSchemaError ? (
                              <Text type="danger">{selectedStructuredTransformSchemaError}</Text>
                            ) : (
                              <Text type="secondary">输出规则会作为结构化转换器的目标结构提示。</Text>
                            )}
                          </Form.Item>

                          <Form.Item label={renderTipLabel('补充上下文', '可选，补充业务背景、字段含义、枚举说明等上下文。')} style={{ marginBottom: 0 }}>
                            <Input.TextArea
                              rows={3}
                              value={selectedStepStructuredTransformConfig.contextTemplate || ''}
                              onChange={(e) => updateStepStructuredTransformConfig(selectedStepIndexForConfig, { contextTemplate: e.target.value })}
                              placeholder="例如：status 字段必须映射为 draft/published/archived 三种值。"
                            />
                          </Form.Item>
                              </>
                            );
                          })()}
                        </Panel>
                      )}

                    </Collapse>
                  )}
                </Form>
              </Card>
            ) : (
              <Alert message="点击中间步骤选择配置" type="info" showIcon />
            )}

            {/* Work Unit DSL Summary */}
            <Divider style={{ margin: '16px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>工作单元 DSL 摘要</Text></Divider>
            {activityDsl.activities.length === 0 ? (
              <Alert message="从左侧添加工作单元" type="info" showIcon />
            ) : (
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {activityDsl.activities.map((activity, index) => {
                  const matchedStep = workflowDsl.steps.find((step) =>
                    step.type === 'activity'
                    && (
                      step.activityName === activity.name
                      || step.activityName === activity.fn
                      || resolveStepActivity(step)?.fn === activity.fn
                    ),
                  );
                  const sourceMeta = getActivitySourceMeta(matchedStep);
                  return (
                    <Space key={`${activity.name}-${index}`} size={4} wrap style={{ margin: 2 }}>
                      <Tag color="blue" style={{ margin: 0 }}>{activity.name}</Tag>
                      <Tag color={sourceMeta.color} style={{ margin: 0 }}>{sourceMeta.label}</Tag>
                      {matchedStep && isStructuredTransformActivity(resolveStepActivity(matchedStep), matchedStep) ? (
                        <Tag color="purple" style={{ margin: 0 }}>
                          {shorten(getStepStructuredTransformConfig(matchedStep, resolveStepActivity(matchedStep)).instructionTemplate || '结构化转换', 18)}
                        </Tag>
                      ) : null}
                    </Space>
                  );
                })}
              </div>
            )}
            </Card>

            {showDedicatedHttpAiZone && (
              <Card
                size="small"
                title="AI 优化区"
                style={SECTION_CARD_STYLE}
                styles={{ body: { padding: 12 } }}
                extra={(
                  <Space size={6}>
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={previewHttpConfigMutation.isLoading}
                      onClick={handleOpenHttpAiPanel}
                    >
                      刷新响应
                    </Button>
                    <Button size="small" onClick={() => setActiveHttpAiStepId(null)}>关闭</Button>
                  </Space>
                )}
              >
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  <div style={CONFIG_SECTION_STYLE}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>基于当前 URL 配置返回的结果</Text>
                    {selectedStepAiResolvedRequest || selectedStepAiPreview ? (
                      <Collapse size="small" ghost>
                        {selectedStepAiResolvedRequest ? (
                          <Panel header="实际请求样本" key="ai-request-sample">
                            <pre style={{ margin: 0, maxHeight: 120, overflow: 'auto', fontSize: 11 }}>
                              {JSON.stringify(selectedStepAiResolvedRequest, null, 2)}
                            </pre>
                          </Panel>
                        ) : null}
                        {selectedStepAiPreview ? (
                          <Panel header="返回结果" key="ai-preview-response">
                            <pre style={{ margin: 0, maxHeight: 220, overflow: 'auto', fontSize: 11 }}>
                              {JSON.stringify(selectedStepAiPreview, null, 2)}
                            </pre>
                          </Panel>
                        ) : null}
                      </Collapse>
                    ) : (
                      <Alert type="info" showIcon message="点击“刷新响应”后，将展示当前配置对应的真实返回结果。" />
                    )}
                    {aiOptimizeLeafPaths.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>当前响应字段建议</Text>
                        <Space wrap size={[6, 6]}>
                          {aiOptimizeLeafPaths.slice(0, 24).map((item) => (
                            <Button
                              key={`ai-path-${item.path}`}
                              size="small"
                              onClick={() => applySuggestedResponsePath(item.path)}
                            >
                              {item.path}
                            </Button>
                          ))}
                        </Space>
                      </div>
                    )}
                  </div>

                  {aiOptimizeLeafPaths.length > 0 && (
                    <div style={CONFIG_SECTION_STYLE}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>多字段提取编辑器</Text>
                      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        适合天气、气温、体感温度、风速这类分散在不同路径的多字段场景。先多选字段，再为每个字段定义输出名。
                      </Text>
                      <Space wrap size={[6, 6]} style={{ marginBottom: 10 }}>
                        {aiOptimizeLeafPaths.slice(0, 32).map((item) => {
                          const selected = selectedStepAiSelectedLeafPaths.includes(item.path);
                          return (
                            <Button
                              key={`pick-${item.path}`}
                              size="small"
                              type={selected ? 'primary' : 'default'}
                              onClick={() => toggleAiLeafPathSelection(item.path)}
                            >
                              {selected ? `已选: ${item.path}` : item.path}
                            </Button>
                          );
                        })}
                      </Space>
                      {selectedStepAiSelectedLeafPaths.length > 0 ? (
                        <Space direction="vertical" style={{ width: '100%' }} size={8}>
                          {selectedStepAiSelectedLeafPaths.map((path) => (
                            <div
                              key={`alias-${path}`}
                              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 8, alignItems: 'center' }}
                            >
                              <Text code>{path}</Text>
                              <Input
                                size="small"
                                value={selectedStepAiLeafAliases[path] || buildOutputKeyFromPath(path)}
                                onChange={(e) => updateAiLeafAlias(path, e.target.value)}
                                placeholder="输出字段名"
                              />
                            </div>
                          ))}
                          <Space wrap>
                            <Button onClick={handleGenerateMultiFieldOutputParams}>
                              生成多字段输出草稿
                            </Button>
                            <Text type="secondary">
                              会自动把返回模式切换为 `body`，并把所选字段生成到输出参数草稿。
                            </Text>
                          </Space>
                        </Space>
                      ) : (
                        <Alert type="info" showIcon message="请先在上面选择需要的多个字段" />
                      )}
                    </div>
                  )}

                  <Form.Item label="自然语义输入" style={{ marginBottom: 0 }}>
                    <Input.TextArea
                      rows={3}
                      value={selectedStepAiPrompt}
                      onChange={(e) => {
                        if (!selectedStep?.id) {
                          return;
                        }
                        const nextPrompt = e.target.value;
                        setHttpAiOptimizePrompts((prev) => ({
                          ...prev,
                          [selectedStep.id as string]: nextPrompt,
                        }));
                      }}
                      placeholder="例如：只保留当前温度、天气描述和体感温度，并自动选择最合适的 Body 路径"
                    />
                  </Form.Item>

                  {selectedStepAiError ? (
                    <Alert type="warning" showIcon message={selectedStepAiError} />
                  ) : null}

                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<RobotOutlined />}
                      loading={optimizeHttpConfigMutation.isLoading}
                      onClick={handleAiOptimizeHttpConfig}
                    >
                      生成优化建议
                    </Button>
                    <Button
                      onClick={handleApplyAiOptimizedHttpConfig}
                      disabled={!selectedStepAiSuggestedConfig}
                    >
                      应用到左侧配置
                    </Button>
                  </Space>

                  {(selectedStepAiExplanation || selectedStepAiSuggestedConfig) && (
                    <div style={CONFIG_SECTION_STYLE}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>AI 优化结果</Text>
                      {selectedStepAiExplanation ? (
                        <Alert type="success" showIcon style={{ marginBottom: 10 }} message={selectedStepAiExplanation} />
                      ) : null}
                      <Input.TextArea
                        value={selectedStepAiSuggestedJsonDraft}
                        rows={12}
                        onChange={(e) => {
                          if (!selectedStep?.id) {
                            return;
                          }
                          const nextValue = e.target.value;
                          setHttpAiSuggestedJsonDrafts((prev) => ({
                            ...prev,
                            [selectedStep.id as string]: nextValue,
                          }));
                        }}
                        placeholder="AI 生成的配置 JSON 会显示在这里，可手动微调后再应用"
                        style={{ fontFamily: 'Monaco, Menlo, monospace', fontSize: 12 }}
                      />
                    </div>
                  )}

                  {selectedStepAiApplySummary.length > 0 && (
                    <div style={CONFIG_SECTION_STYLE}>
                      <Text strong style={{ display: 'block', marginBottom: 8 }}>已应用到左侧配置</Text>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {selectedStepAiApplySummary.map((item) => (
                          <li key={item}>
                            <Text>{item}</Text>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Space>
              </Card>
            )}
            </div>
          </Col>
        </Row>

        <Card
          title={<Space size={6}><span>输出参数</span><Text type="secondary">（Workflow 返回值）</Text><Tooltip title="默认使用最后一个步骤的输出，也可以指定来源步骤。"><InfoCircleOutlined style={{ color: 'var(--text-light)' }} /></Tooltip></Space>}
          size="small"
          style={{ ...SECTION_CARD_STYLE, marginTop: 16, marginBottom: 16 }}
          styles={{ body: SECTION_CARD_BODY_STYLE }}
        >
        <div style={SOFT_PANEL_STYLE}>
          {realValidationLeafPaths.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                最近一次真实验证结果路径建议（基于完整 HTTP 响应预览）
              </Text>
              <Space wrap size={[6, 6]}>
                {realValidationLeafPaths.slice(0, 20).map((item) => (
                  <Button
                    key={`output-${item.path}`}
                    size="small"
                    onClick={() => addSuggestedOutputParam(item.path)}
                  >
                    + {item.path}
                  </Button>
                ))}
              </Space>
            </div>
          )}
          {Object.entries(workflowDsl.outputParams || {}).map(([key, param]) => (
            <Row key={key} gutter={8} style={{ marginBottom: 8, alignItems: 'center' }}>
              <Col span={4}>
                <Input value={key} disabled size="small" suffix={<Button size="small" danger type="text" onClick={() => { const newParams = { ...workflowDsl.outputParams }; delete newParams[key]; setWorkflowDsl({ ...workflowDsl, outputParams: newParams }); }}>×</Button>} />
              </Col>
              <Col span={6}>
                <Select value={param.sourceStep || '_last'} onChange={v => setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key]: { ...param, sourceStep: v === '_last' ? undefined : v } } })} size="small" style={{ width: '100%' }}>
                  <Option value="_last">最后一个步骤</Option>
                  {workflowDsl.steps.map((step, idx) => (<Option key={step.id} value={step.id}>{step.name || `步骤 ${idx + 1}`}</Option>))}
                </Select>
              </Col>
              <Col span={8}>
                <Input value={param.description || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key]: { ...param, description: e.target.value } } })} placeholder="参数描述" size="small" />
              </Col>
            </Row>
          ))}
          <Button size="small" type="dashed" onClick={() => { const key = prompt('请输入输出参数名:'); if (key && key.trim()) { setWorkflowDsl({ ...workflowDsl, outputParams: { ...workflowDsl.outputParams, [key.trim()]: { description: '', sourceStep: undefined } } }); } }} style={{ width: '100%' }}>+ 添加输出参数</Button>
        </div>
        </Card>

        <Card title="补足情报（指导 AI 代码生成）" size="small" style={SECTION_CARD_STYLE} styles={{ body: SECTION_CARD_BODY_STYLE }}>
          <Form.Item label={renderTipLabel('额外提示词', '补充上下文给 AI，帮助生成更准确的工作流代码。')} style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} placeholder="例如：&#10;- 该工作流需要处理中文内容，请使用 utf-8 编码&#10;- 返回结果需要包含完整的错误处理逻辑&#10;- 第三方 API 调用需要添加重试机制" value={workflowDsl.extraPrompt || ''} onChange={e => setWorkflowDsl({ ...workflowDsl, extraPrompt: e.target.value || undefined })} />
          </Form.Item>
        </Card>
      </Modal>
      <Modal title="验证工作流 DSL" open={validateModalVisible} onCancel={() => setValidateModalVisible(false)} footer={[<Button onClick={() => setValidateModalVisible(false)}>关闭</Button>]} width={700}>
        {validationResult ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type={validationResult.isValid ? 'success' : 'error'} message={validationResult.isValid ? '验证通过' : '验证失败'} showIcon />
            <Card><Text><strong>评分:</strong> {validationResult.score}/100</Text></Card>
            {validationResult.errors.length > 0 && <Alert type="error" message="错误" description={<ul>{validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>} />}
            {validationResult.warnings.length > 0 && <Alert type="warning" message="警告" description={<ul>{validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>} />}
          </Space>
        ) : <Alert type="info" message="点击验证按钮开始验证" />}
      </Modal>
      <Modal
        title="AI 生成代码状态"
        open={codeGenerationState.visible}
        onCancel={() => {
          if (!codeGenerationState.isStreaming) {
            dispatchCodeGeneration({ type: 'CLOSE' });
          }
        }}
        footer={codeGenerationModalFooter}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {codeGenerationState.isStreaming && <Alert type="info" message="AI 正在生成 Workflow 代码..." showIcon />}
          {!codeGenerationState.isStreaming && codeGenerationState.result && (
            <Alert
              type={codeGenerationState.result.success ? 'success' : 'error'}
              message={codeGenerationState.result.success ? '代码生成完成' : '代码生成失败'}
              description={codeGenerationState.result.error || (
                codeGenerationState.result.generationMode === 'deterministic'
                  ? '本次命中固定模版编译路径。'
                  : `共尝试 ${codeGenerationState.result.attempts || 1} 次生成。`
              )}
              showIcon
            />
          )}
          <Card title="生成日志" size="small">
            <div style={{ maxHeight: 320, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {codeGenerationState.logs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
              {codeGenerationState.logs.length === 0 && !codeGenerationState.isStreaming && <Text type="secondary">暂无日志</Text>}
              {codeGenerationState.isStreaming && <Text type="secondary">等待更多状态...</Text>}
            </div>
          </Card>
        </Space>
      </Modal>
      <Modal title={<Space direction="vertical" size={0}><Text strong>AI 生成的 Workflow 代码</Text><Text type="secondary" style={{ fontSize: 12 }}>显示名称：{currentWorkflowDisplayName} ｜ 类名：{currentWorkflowClassName}</Text></Space>} open={codeModalVisible} onCancel={() => setCodeModalVisible(false)}
        footer={[
          <Button key="copy" icon={<CodeOutlined />} onClick={() => {
            void navigator.clipboard.writeText(generatedCode || '');
            void message.success('已复制到剪贴板');
          }}>复制代码</Button>,
          <Button key="close" onClick={() => setCodeModalVisible(false)}>关闭</Button>
        ]} width={900}>
        {generatedCode && (
          <pre style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: 16, borderRadius: 8, maxHeight: 500, overflow: 'auto', fontSize: 12, fontFamily: 'Monaco, Menlo, monospace' }}>
            {generatedCode}
          </pre>
        )}
      </Modal>
      <Modal title="真实验证结果" open={realValidationState.visible} onCancel={() => dispatchRealValidation({ type: 'CLOSE' })} footer={realValidationModalFooter} width={800}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {realValidationState.isStreaming && <Alert type="info" message="真实验证进行中..." showIcon />}

          {/* 输入参数区域 - 仅在未运行时显示 */}
          {!realValidationState.isStreaming && (
            <Card size="small" style={{ marginBottom: 12 }}>
              {Object.keys(realValidationInputParams).length > 0 ? (
                <>
                  <Text strong>输入参数（请填写参数值）：</Text>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(realValidationInputParams).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Tag color="blue">{key}</Tag>
                        <Input
                          placeholder={`请输入 ${key}`}
                          value={value}
                          onChange={(e) => setRealValidationInputParams(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ width: 160 }}
                          size="small"
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Text type="secondary">当前工作流没有可填写的输入参数，可直接开始真实验证。</Text>
              )}
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                onClick={() => {
                  void handleRealValidation();
                }}
                style={{ marginTop: 12 }}
              >
                开始真实验证
              </Button>
            </Card>
          )}

          {realValidationState.result && (
            <>
              <Alert type={realValidationState.result.success ? 'success' : 'error'} message={realValidationState.result.success ? '真实验证通过' : '真实验证失败'} showIcon />
              <Card><Text><strong>评分:</strong> {realValidationState.result.score}/100</Text></Card>
              {realValidationState.result.error && <Alert type="error" message="错误" description={realValidationState.result.error} showIcon />}
              {realValidationState.result.result?.error && <Alert type="error" message="执行错误" description={String(realValidationState.result.result.error).substring(0, 500)} showIcon />}
              {realValidationRawResult !== undefined && realValidationRawResult !== null && (
                <Card title="执行结果" size="small">
                  <pre style={{ maxHeight: 300, overflow: 'auto', fontSize: 11, margin: 0 }}>
                    {JSON.stringify(realValidationRawResult, null, 2)}
                  </pre>
                </Card>
              )}
              {realValidationLeafPaths.length > 0 && (
                <Card title="叶子节点建议" size="small">
                  <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    HTTP 预览结果已自动按 body 相对路径展开，可直接回填到 `Body 路径`
                  </Text>
                  <Space wrap size={[6, 6]}>
                    {realValidationLeafPaths.slice(0, 40).map((item) => (
                      <Button
                        key={`modal-path-${item.path}`}
                        size="small"
                        onClick={() => applySuggestedResponsePath(item.path)}
                      >
                        {item.path}
                      </Button>
                    ))}
                  </Space>
                </Card>
              )}
            </>
          )}
          <Card title="执行日志" size="small">
            <div style={{ maxHeight: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
              {realValidationState.logs.map((log, i) => <div key={i} style={{ marginBottom: 4 }}>{log}</div>)}
              {realValidationState.logs.length === 0 && !realValidationState.isStreaming && <Text type="secondary">暂无日志</Text>}
              {realValidationState.isStreaming && <Text type="secondary">等待更多日志...</Text>}
            </div>
          </Card>
        </Space>
      </Modal>
    </>
  );
};



export interface WorkflowEditModalProps {
  visible: boolean;
  onCancel: (saved?: boolean) => void;
  onSave: (data: any) => void;
  initialWorkflow?: any | null;
  initialDraftDsl?: any | null;
  loading?: boolean;
  openTemplatePickerOnOpen?: boolean;
  initialTemplatePickerMode?: TemplateModalMode;
}
