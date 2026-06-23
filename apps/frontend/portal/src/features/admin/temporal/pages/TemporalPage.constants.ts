import React from 'react';
import type {
  DurationUnit,
  StepDurationField,
  HttpRequestStepConfig,
  StructuredTransformStepConfig,
} from './TemporalPage.types';

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

export const PARAMETER_DESCRIPTION_PREVIEW_LIMIT = 120;

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

export const DURATION_INPUT_WIDTH = 64;
export const DURATION_SEGMENTED_WIDTH = 78;
export const COLLAPSED_SIDEBAR_WIDTH = 44;
export const RESOURCE_SIDEBAR_WIDTH = 260;
export const STEPS_SIDEBAR_WIDTH = 320;

export const DEFAULT_HTTP_REQUEST_STEP_CONFIG: HttpRequestStepConfig = {
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

export const DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG: StructuredTransformStepConfig = {
  contentType: 'text',
  contentTemplate: '',
  instructionTemplate: '',
  outputMode: 'json',
  outputSchema: {},
  contextTemplate: '',
  fieldMappings: {},
  textTemplate: '',
};

export const MAX_LOG_LINES = 1000;
