import React from 'react';
import {
  TemporalWorkflowDTO,
} from '@/api/temporal';

export type DurationUnit = 's' | 'm' | 'h';

export type StepDurationField =
  | 'startToCloseTimeout'
  | 'scheduleToCloseTimeout'
  | 'heartbeatTimeout';

export type WorkflowDurationField =
  | 'workflowExecutionTimeout'
  | 'workflowRunTimeout'
  | 'workflowTaskTimeout';

export type ActivityResourceSource = 'builtin' | 'custom';
export type HttpResponseMode = 'body' | 'full' | 'bodyPath' | 'bodyMap';
export type TemplateModalMode = 'document' | 'browser';

export const DEFAULT_DURATION_UNIT: DurationUnit = 's';
export const HTTP_REQUEST_STEP_CONFIG_KEY = '__httpRequest';
export const STRUCTURED_TRANSFORM_STEP_CONFIG_KEY = '__structuredTransform';

export const DURATION_UNIT_OPTIONS = [
  { label: 'S', value: 's' },
  { label: 'M', value: 'm' },
  { label: 'H', value: 'h' },
];

export const STEP_DURATION_DEFAULTS: Record<StepDurationField, string> = {
  startToCloseTimeout: '60s',
  scheduleToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
};

export const SECTION_CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

export const SECTION_CARD_BODY_STYLE: React.CSSProperties = {
  padding: 14,
};

export const SOFT_PANEL_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  padding: 12,
  borderRadius: 10,
  background: 'var(--bg-card)',
};

export const CONFIG_SECTION_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  padding: 12,
  marginBottom: 12,
};

export const TWO_COLUMN_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

export interface WorkflowEditModalProps {
  visible: boolean;
  onCancel: () => void;
  workflow?: TemporalWorkflowDTO | null;
  onSuccess?: () => void;
  onViewExecutionDetail?: (executionId: string) => void;
}
