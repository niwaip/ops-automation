import React from 'react';
import { DatePicker, Input, InputNumber, Select, Space, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  WorkflowInputParamDefinition,
  WorkflowValidationScenario,
} from '@/api/temporal';

const { Text } = Typography;
export const VALIDATION_SCENARIO_FIELD = '__validationScenario';

const resolveInputFormat = (
  key: string,
  definition: WorkflowInputParamDefinition
): WorkflowInputParamDefinition['format'] => {
  if (definition.format) return definition.format;
  const hint = `${key} ${definition.description || ''}`.toLowerCase();
  if (/毫秒|milliseconds?|epoch\s*ms|unix\s*ms/.test(hint)) return 'unix-milliseconds';
  if (/秒级时间戳|unix\s*seconds?|epoch\s*seconds?/.test(hint)) return 'unix-seconds';
  if (definition.type === 'date') return /时间|time|datetime/.test(hint) ? 'date-time' : 'date';
  return undefined;
};

export interface WorkflowValidationInputFieldsProps {
  definitions?: Record<string, WorkflowInputParamDefinition>;
  scenarios?: WorkflowValidationScenario[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

const resolveDateValue = (value: string, format?: string): Dayjs | null => {
  if (!value) return null;
  if (format === 'unix-milliseconds' || format === 'unix-seconds') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return dayjs(format === 'unix-seconds' ? numeric * 1000 : numeric);
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
};

const formatExample = (
  exampleValue: WorkflowInputParamDefinition['exampleValue'],
  format?: WorkflowInputParamDefinition['format']
): string | undefined => {
  if (exampleValue === undefined) return undefined;
  if (format === 'unix-milliseconds' || format === 'unix-seconds') {
    const numeric = Number(exampleValue);
    if (Number.isFinite(numeric)) {
      return dayjs(format === 'unix-seconds' ? numeric * 1000 : numeric).format(
        'YYYY-MM-DD HH:mm:ss'
      );
    }
  }
  return String(exampleValue);
};

const resolveDateInput = (
  value: Dayjs | null,
  format?: WorkflowInputParamDefinition['format']
): string => {
  if (!value) return '';
  if (format === 'unix-milliseconds') return String(value.valueOf());
  if (format === 'unix-seconds') return String(Math.floor(value.valueOf() / 1000));
  if (format === 'date') return value.format('YYYY-MM-DD');
  return value.toISOString();
};

export const buildInitialWorkflowValidationValues = (
  definitions?: Record<string, WorkflowInputParamDefinition>,
  scenarios?: WorkflowValidationScenario[]
): Record<string, string> => {
  const initialScenario = scenarios?.[0];
  const initialAllowedKeys = initialScenario ? new Set(initialScenario.parameters) : undefined;
  const values = Object.entries(definitions || {}).reduce<Record<string, string>>(
    (acc, [key, definition]) => {
      if (
        (!initialAllowedKeys || definition.required || initialAllowedKeys.has(key)) &&
        definition.defaultValue !== undefined &&
        definition.defaultValue !== ''
      ) {
        acc[key] = String(definition.defaultValue);
      } else {
        acc[key] = '';
      }
      return acc;
    },
    {}
  );
  if (initialScenario) {
    values[VALIDATION_SCENARIO_FIELD] = initialScenario.id;
  }
  return values;
};

export const WorkflowValidationInputFields: React.FC<WorkflowValidationInputFieldsProps> = ({
  definitions = {},
  scenarios = [],
  values,
  onChange,
}) => {
  const selectedScenarioId = values[VALIDATION_SCENARIO_FIELD] || scenarios[0]?.id;
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId);
  const allowedKeys = selectedScenario ? new Set(selectedScenario.parameters) : undefined;
  const entries = Object.entries(definitions).filter(
    ([key, definition]) => definition.required || !allowedKeys || allowedKeys.has(key)
  );

  const updateValue = (key: string, value: string) => onChange({ ...values, [key]: value });

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {scenarios.length > 0 ? (
        <div>
          <Text strong>验证场景</Text>
          <Select
            value={selectedScenarioId}
            options={scenarios.map((scenario) => ({
              value: scenario.id,
              label: scenario.label,
              title: scenario.description,
            }))}
            onChange={(scenarioId) => {
              const scenario = scenarios.find((item) => item.id === scenarioId);
              const next: Record<string, string> = {
                ...values,
                [VALIDATION_SCENARIO_FIELD]: scenarioId,
              };
              const nextAllowed = new Set(scenario?.parameters || []);
              Object.keys(definitions).forEach((key) => {
                const definition = definitions[key];
                if (!definition.required && !nextAllowed.has(key)) {
                  next[key] = '';
                } else if (
                  !next[key] &&
                  definition.defaultValue !== undefined &&
                  definition.defaultValue !== ''
                ) {
                  next[key] = String(definition.defaultValue);
                }
              });
              onChange(next);
            }}
            style={{ width: 240, marginLeft: 8 }}
          />
          {selectedScenario?.description ? (
            <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              {selectedScenario.description}
            </Text>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {entries.map(([key, definition]) => {
          const value = values[key] || '';
          const label = definition.displayName || key;
          const format = resolveInputFormat(key, definition);
          const example = formatExample(definition.exampleValue, format);
          const commonLabel = (
            <Tag color={definition.required ? 'red' : 'blue'}>
              {label}{definition.required ? ' *' : ''}
            </Tag>
          );
          const isDateInput =
            definition.type === 'date' ||
            format === 'date' ||
            format === 'date-time' ||
            format === 'unix-milliseconds' ||
            format === 'unix-seconds';

          return (
            <div key={key} style={{ minWidth: 220 }} title={definition.description}>
              <div style={{ marginBottom: 4 }}>{commonLabel}</div>
              {definition.enum?.length ? (
                <Select
                  allowClear={!definition.required}
                  value={value || undefined}
                  placeholder={example ? `示例：${example}` : `请选择 ${label}`}
                  options={definition.enum.map((item) => ({ value: String(item), label: String(item) }))}
                  onChange={(next) => updateValue(key, next || '')}
                  style={{ width: 210 }}
                  size="small"
                />
              ) : isDateInput ? (
                <DatePicker
                  showTime={format !== 'date'}
                  value={resolveDateValue(value, format)}
                  placeholder={example ? `示例：${example}` : `请选择 ${label}`}
                  onChange={(next) => updateValue(key, resolveDateInput(next, format))}
                  style={{ width: 210 }}
                  size="small"
                />
              ) : definition.type === 'integer' || definition.type === 'number' ? (
                <InputNumber
                  stringMode={definition.type === 'integer'}
                  precision={definition.type === 'integer' ? 0 : undefined}
                  value={value || null}
                  placeholder={example ? `示例：${example}` : `请输入 ${label}`}
                  onChange={(next) => updateValue(key, next === null ? '' : String(next))}
                  style={{ width: 210 }}
                  size="small"
                />
              ) : definition.type === 'boolean' ? (
                <Select
                  allowClear={!definition.required}
                  value={value || undefined}
                  options={[
                    { value: 'true', label: '是' },
                    { value: 'false', label: '否' },
                  ]}
                  onChange={(next) => updateValue(key, next || '')}
                  style={{ width: 210 }}
                  size="small"
                />
              ) : (
                <Input
                  value={value}
                  placeholder={example ? `示例：${example}` : `请输入 ${label}`}
                  onChange={(event) => updateValue(key, event.target.value)}
                  style={{ width: 210 }}
                  size="small"
                />
              )}
              {format === 'unix-milliseconds' ? (
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
                  提交为毫秒时间戳
                </Text>
              ) : null}
            </div>
          );
        })}
      </div>
    </Space>
  );
};
