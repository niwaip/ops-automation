export type DurationUnit = 's' | 'm' | 'h';
export type StepDurationField = 'startToCloseTimeout' | 'scheduleToCloseTimeout' | 'heartbeatTimeout';
export type WorkflowDurationField = 'workflowExecutionTimeout' | 'workflowRunTimeout' | 'workflowTaskTimeout';
export type ActivityResourceSource = 'builtin' | 'custom';
export type HttpResponseMode = 'body' | 'full' | 'bodyPath' | 'bodyMap';
export type TemplateModalMode = 'document' | 'browser';
export type StructuredTransformContentType = 'text' | 'html' | 'json';
export type StructuredTransformOutputMode = 'json' | 'text';

export interface HttpRequestStepConfig {
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

export interface StructuredTransformStepConfig {
  contentType?: StructuredTransformContentType;
  contentTemplate?: string;
  instructionTemplate?: string;
  outputMode?: StructuredTransformOutputMode;
  outputSchema?: Record<string, any>;
  contextTemplate?: string;
  fieldMappings?: Record<string, string>;
  textTemplate?: string;
}

export interface WorkflowSelectableActivity {
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
