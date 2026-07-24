import React from 'react';
import { Form, Space, Switch, InputNumber, Segmented } from 'antd';
import type { WorkflowDsl } from '@/api/temporal';
import {
  parseDurationValue,
  formatDurationValue,
  DURATION_INPUT_WIDTH,
  DURATION_SEGMENTED_WIDTH,
} from '../utils/workflowEditHelpers';
import type { WorkflowSelectableActivity } from '../hooks/useWorkflowEditState';

type DurationUnit = 's' | 'm' | 'h';
type StepDurationField = 'startToCloseTimeout' | 'scheduleToCloseTimeout' | 'heartbeatTimeout';
type WorkflowDurationField =
  | 'workflowExecutionTimeout'
  | 'workflowRunTimeout'
  | 'workflowTaskTimeout';

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

export interface WorkflowStepDurationFieldEditorProps {
  field: StepDurationField;
  label: string;
  tip: string;
  options?: { canDisable?: boolean };
  selectedStepIndexForConfig: number | null;
  workflowDsl: WorkflowDsl;
  handleUpdateStep: (index: number, field: string, value: unknown) => void;
  resolveStepActivity: (step?: any) => WorkflowSelectableActivity | undefined;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
}

export const WorkflowStepDurationFieldEditor: React.FC<
  WorkflowStepDurationFieldEditorProps
> = ({
  field,
  label,
  tip,
  options,
  selectedStepIndexForConfig,
  workflowDsl,
  handleUpdateStep,
  resolveStepActivity,
  renderTipLabel,
}) => {
  if (selectedStepIndexForConfig === null || !workflowDsl.steps[selectedStepIndexForConfig]) {
    return null;
  }
  const step = workflowDsl.steps[selectedStepIndexForConfig];
  const parsed = parseDurationValue(step[field]);
  const canDisable = options?.canDisable ?? false;
  const enabled = canDisable ? Boolean(step[field]) : true;

  const updateStepDurationField = (
    index: number,
    fld: StepDurationField,
    val: number | null | undefined,
    unit: DurationUnit
  ) => {
    handleUpdateStep(index, fld, formatDurationValue(val, unit));
  };

  const getStepDurationDefaultValue = (
    fld: StepDurationField,
    stp?: WorkflowDsl['steps'][number]
  ): string => {
    if (fld === 'startToCloseTimeout') {
      return (
        stp?.startToCloseTimeout ||
        resolveStepActivity(stp)?.timeout ||
        STEP_DURATION_DEFAULTS.startToCloseTimeout
      );
    }
    return STEP_DURATION_DEFAULTS[fld];
  };

  const toggleStepDurationField = (index: number, fld: StepDurationField, en: boolean) => {
    if (!en) {
      handleUpdateStep(index, fld, undefined);
      return;
    }
    const defaultDuration = getStepDurationDefaultValue(fld, step);
    const parsedDefault = parseDurationValue(defaultDuration);
    handleUpdateStep(
      index,
      fld,
      formatDurationValue(parsedDefault.value ?? 0, parsedDefault.unit)
    );
  };

  return (
    <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {canDisable && (
          <Switch
            size="small"
            checked={enabled}
            onChange={(checked) =>
              toggleStepDurationField(selectedStepIndexForConfig, field, checked)
            }
          />
        )}
        <InputNumber
          size="small"
          min={0}
          value={parsed.value}
          disabled={!enabled}
          onChange={(value) =>
            updateStepDurationField(selectedStepIndexForConfig, field, value, parsed.unit)
          }
          placeholder="时长"
          style={{ width: DURATION_INPUT_WIDTH }}
        />
        <Segmented
          size="small"
          options={DURATION_UNIT_OPTIONS}
          value={parsed.unit}
          disabled={!enabled}
          onChange={(value) =>
            updateStepDurationField(
              selectedStepIndexForConfig,
              field,
              parsed.value,
              value as DurationUnit
            )
          }
          style={{ width: DURATION_SEGMENTED_WIDTH, padding: 0 }}
        />
      </div>
    </Form.Item>
  );
};

export interface WorkflowDurationFieldEditorProps {
  field: WorkflowDurationField;
  label: string;
  tip: string;
  enabled: boolean;
  defaultValue: string;
  workflowDsl: WorkflowDsl;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
}

export const WorkflowDurationFieldEditor: React.FC<WorkflowDurationFieldEditorProps> = ({
  field,
  label,
  tip,
  enabled,
  defaultValue,
  workflowDsl,
  setWorkflowDsl,
  renderTipLabel,
}) => {
  const parsed = parseDurationValue(workflowDsl[field]);

  const updateWorkflowDurationField = (
    fld: WorkflowDurationField,
    val: number | null | undefined,
    unit: DurationUnit
  ) => {
    setWorkflowDsl({
      ...workflowDsl,
      [fld]: formatDurationValue(val, unit),
    });
  };

  return (
    <Form.Item label={renderTipLabel(label, tip)} style={{ marginBottom: 0 }}>
      <Space size={6} align="center">
        <Switch
          checked={enabled}
          onChange={(checked) =>
            setWorkflowDsl({
              ...workflowDsl,
              [field]: checked ? defaultValue : undefined,
            })
          }
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
            onChange={(value) =>
              updateWorkflowDurationField(field, parsed.value, value as DurationUnit)
            }
            style={{ width: DURATION_SEGMENTED_WIDTH, padding: 0 }}
          />
        </div>
      </Space>
    </Form.Item>
  );
};
