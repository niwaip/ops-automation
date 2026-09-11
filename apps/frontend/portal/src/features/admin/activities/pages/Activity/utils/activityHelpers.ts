import React from 'react';
import { ApiOutlined, FileTextOutlined, ChromeOutlined, CodeOutlined } from '@ant-design/icons';

export const MAX_LOG_LINES = 1000;
export const VALIDATION_PHASES = ['准备环境', '代码就绪', '执行中', '完成'];
export const DEFAULT_TASK_QUEUE = 'SKILL_TASK_QUEUE';
export const DEFAULT_ACTIVITY_TIMEOUT = '60s';

export interface ActivityInputParam {
  key: string;
  value: string;
  required: boolean;
}

export interface ActivityStep {
  id: string;
  name: string;
  type: 'api' | 'carbone' | 'browser' | 'script';
  timeout: string;
  config: Record<string, any>;
  inputParams?: ActivityInputParam[];
  formatPrompt?: string;
  extraPrompt?: string;
}

export interface ActivityFormData {
  name: string;
  fn: string;
  description: string;
  isActive: boolean;
  startToCloseTimeout: string;
  steps: ActivityStep[];
}

export interface ValidationStrategy {
  retryPolicy?: { maxRetries: number; backoffMs?: number };
}

export const DEFAULT_VALIDATION_STRATEGY: ValidationStrategy = {
  retryPolicy: { maxRetries: 3, backoffMs: 1000 },
};

export interface RealValidateState {
  visible: boolean;
  isRunning: boolean;
  logs: string[];
  error: string | null;
  result: any | null;
  inputParams: Record<string, string>;
  currentPhase: number;
  progress: number;
}

export type RealValidateAction =
  | { type: 'OPEN'; payload?: Record<string, string> }
  | { type: 'START' }
  | { type: 'SET_PHASE'; payload: { phase: number; progress?: number } }
  | { type: 'APPEND_LOG'; payload: string }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_RESULT'; payload: any }
  | { type: 'SET_INPUT_PARAMS'; payload: Record<string, string> }
  | { type: 'STOP' }
  | { type: 'CLOSE' };

export const initialRealValidateState: RealValidateState = {
  visible: false,
  isRunning: false,
  logs: [],
  error: null,
  result: null,
  inputParams: {},
  currentPhase: 0,
  progress: 0,
};

export const realValidateReducer = (
  state: RealValidateState,
  action: RealValidateAction
): RealValidateState => {
  switch (action.type) {
    case 'OPEN':
      return {
        ...state,
        visible: true,
        inputParams: action.payload || {},
        currentPhase: 0,
        progress: 0,
      };
    case 'START':
      return {
        ...state,
        visible: true,
        isRunning: true,
        logs: [],
        error: null,
        result: null,
        currentPhase: 0,
        progress: 10,
      };
    case 'SET_PHASE':
      return {
        ...state,
        currentPhase: action.payload.phase,
        progress: action.payload.progress ?? state.progress,
      };
    case 'APPEND_LOG':
      return {
        ...state,
        logs: [...state.logs.slice(-(MAX_LOG_LINES - 1)), action.payload],
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isRunning: false,
      };
    case 'SET_RESULT':
      return {
        ...state,
        result: action.payload,
        isRunning: false,
      };
    case 'SET_INPUT_PARAMS':
      return {
        ...state,
        inputParams: action.payload,
      };
    case 'STOP':
      return {
        ...state,
        isRunning: false,
      };
    case 'CLOSE':
      return {
        ...initialRealValidateState,
      };
    default:
      return state;
  }
};

export const normalizeInputParams = (
  inputParams: Record<string, string> | ActivityInputParam[] | undefined
): ActivityInputParam[] => {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams.map((item) => ({
      key: item.key || '',
      value: item.value || '',
      required: Boolean(item.required),
    }));
  }
  return Object.entries(inputParams).map(([key, value]) => ({
    key,
    value: value || '',
    required: !value,
  }));
};

export const HANDLER_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  api: { label: 'API', color: 'green', icon: React.createElement(ApiOutlined) },
  carbone: { label: 'Carbone', color: 'blue', icon: React.createElement(FileTextOutlined) },
  browser: { label: '浏览器', color: 'purple', icon: React.createElement(ChromeOutlined) },
  script: { label: '脚本', color: 'orange', icon: React.createElement(CodeOutlined) },
};

export const SECTION_CARD_STYLE: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

export const nameToPythonFn = (name: string): string => {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const candidate = clean ? `${clean}_activity` : 'custom_activity';
  return candidate.replace(/_+/g, '_');
};

export const skillToActivityDraft = (skill: {
  id: string;
  name: string;
  description?: string;
  tools?: string[];
  templateId?: string;
  carboneTemplateId?: string;
  carboneSkillId?: string;
  apiEndpoints?: Record<string, any>;
  paramsSchema?: { properties?: Record<string, any> };
}): {
  name: string;
  fn: string;
  handler: 'api' | 'carbone' | 'browser' | 'script';
  timeout: string;
  config: Record<string, any>;
  isActive: boolean;
} => {
  let handler: 'api' | 'carbone' | 'browser' | 'script' = 'script';
  if (skill.carboneTemplateId || skill.carboneSkillId) {
    handler = 'carbone';
  } else if (
    skill.templateId ||
    skill.tools?.some((t) => t.toLowerCase().includes('browser') || t.toLowerCase().includes('playwright'))
  ) {
    handler = 'browser';
  } else if (skill.apiEndpoints?.render || skill.apiEndpoints?.getSkill) {
    handler = 'api';
  }

  const fnName = nameToPythonFn(skill.name);
  const rawParams = skill.paramsSchema?.properties || {};
  const inputKeys = Object.keys(rawParams);

  const config: Record<string, any> = {
    description: skill.description || '',
    sourceSkillId: skill.id,
    sourceSkillName: skill.name,
    inputKeys,
  };

  if (handler === 'api' && skill.apiEndpoints?.render) {
    config.urlTemplate = skill.apiEndpoints.render.url || '';
    config.method = skill.apiEndpoints.render.method || 'POST';
  }

  return {
    name: `${skill.name} Activity`,
    fn: fnName,
    handler,
    timeout: '60s',
    config,
    isActive: true,
  };
};

export const activityToCloneDraft = (activity: {
  name: string;
  fn: string;
  handler?: 'api' | 'carbone' | 'browser' | 'script';
  timeout?: string;
  config?: Record<string, any>;
  retryPolicy?: { maxRetries?: number; backoffMs?: number } | null;
}) => ({
  name: `${activity.name} (副本)`,
  fn: `${activity.fn}_copy`,
  handler: activity.handler || 'script',
  timeout: activity.timeout || '60s',
  retryPolicy: activity.retryPolicy
    ? {
        maxRetries: activity.retryPolicy.maxRetries ?? 3,
        backoffMs: activity.retryPolicy.backoffMs,
      }
    : null,
  config: { ...(activity.config || {}) },
  isActive: true,
});

export const generatePythonCode = (form: ActivityFormData): string => {
  const lines: string[] = [];
  lines.push('# Generated by Temporal Activity Generator');
  lines.push('# See: docs/skills/temporal-developer/SKILL.md');
  lines.push('');
  lines.push('from datetime import timedelta');
  lines.push('from temporalio import activity');
  lines.push('from temporalio.exceptions import ApplicationError');
  lines.push('from typing import Optional, Dict, Any');
  lines.push('');
  lines.push(`@activity.defn(name="${form.name}")`);
  lines.push(`async def ${form.fn}(params: Dict[str, Any]) -> Dict[str, Any]:`);
  lines.push(`    """${form.description || 'Custom Activity'}"""`);
  lines.push('    activity.logger.info(f"Executing {form.name} with params: {params}")');
  lines.push('    try:');
  lines.push('        # Execution logic goes here');
  lines.push('        result = {"status": "success", "input": params}');
  lines.push('        return result');
  lines.push('    except Exception as e:');
  lines.push('        activity.logger.error(f"Activity failed: {e}")');
  lines.push('        raise ApplicationError(str(e))');
  return lines.join('\n');
};
