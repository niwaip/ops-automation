import React, { useMemo } from 'react';
import { Alert, Checkbox, Collapse, Input, InputNumber, Select, Space, Typography } from 'antd';

const { Text, Paragraph } = Typography;
const SENSITIVE_FIELD =
  /(?:api[_-]?key|device[_-]?key|access[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential|password|secret|token)$/i;

interface DeploymentSmokeInputEditorProps {
  sourcePayload?: Record<string, unknown> | null;
  draft: string;
  onChange: (draft: string) => void;
}

interface SmokeField {
  name: string;
  label: string;
  description?: string;
  type: string;
  required: boolean;
  sensitive: boolean;
  options?: unknown[];
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function parseMaybeJson(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function parseDraft(draft: string): Record<string, unknown> {
  return parseMaybeJson(draft || '{}') || {};
}

function resolveFields(sourcePayload?: Record<string, unknown> | null): SmokeField[] {
  if (!sourcePayload) return [];
  const paramsSchema = parseMaybeJson(sourcePayload.paramsSchema);
  const workflowDsl = parseMaybeJson(sourcePayload.workflowDsl);
  const inputParams = parseMaybeJson(workflowDsl?.inputParams) || {};
  const properties = asRecord(paramsSchema?.properties) ||
    (Object.keys(paramsSchema || {}).length > 0 ? paramsSchema! : inputParams);
  const required = new Set(
    Array.isArray(paramsSchema?.required)
      ? paramsSchema.required.filter((value): value is string => typeof value === 'string')
      : []
  );

  const validation = parseMaybeJson(workflowDsl?.validation);
  const firstScenario = Array.isArray(validation?.scenarios)
    ? asRecord(validation.scenarios[0])
    : undefined;
  if (Array.isArray(firstScenario?.requiredParameters)) {
    firstScenario.requiredParameters.forEach((value) => {
      if (typeof value === 'string') required.add(value);
    });
  }

  return Object.entries(properties).map(([name, rawDefinition]) => {
    const definition = asRecord(rawDefinition) || asRecord(inputParams[name]) || {};
    const label = [definition.displayName, definition.title]
      .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      ?.trim();
    return {
      name,
      label: label || name,
      description:
        typeof definition.description === 'string' ? definition.description.trim() : undefined,
      type: typeof definition.type === 'string' ? definition.type.toLowerCase() : 'string',
      required: required.has(name) || definition.required === true,
      sensitive: SENSITIVE_FIELD.test(name),
      options: Array.isArray(definition.enum) ? definition.enum : undefined,
    };
  });
}

export function findMissingRequiredSmokeFields(
  sourcePayload: Record<string, unknown> | null | undefined,
  values: Record<string, unknown> | undefined
) {
  return resolveFields(sourcePayload)
    .filter((field) => {
      if (!field.required) return false;
      const value = values?.[field.name];
      return value === undefined || value === null || value === '';
    })
    .map((field) => field.label);
}

export const DeploymentSmokeInputEditor: React.FC<DeploymentSmokeInputEditorProps> = ({
  sourcePayload,
  draft,
  onChange,
}) => {
  const fields = useMemo(() => resolveFields(sourcePayload), [sourcePayload]);
  const values = useMemo(() => parseDraft(draft), [draft]);
  const isValidJson = useMemo(() => Boolean(parseMaybeJson(draft || '{}')), [draft]);

  const updateField = (name: string, value: unknown) => {
    const next = { ...values };
    if (value !== '' && value !== undefined && value !== null) next[name] = value;
    else delete next[name];
    onChange(JSON.stringify(next, null, 2));
  };

  const renderControl = (field: SmokeField) => {
    const value = values[field.name];
    if (field.options) {
      return (
        <Select
          value={value}
          onChange={(next) => updateField(field.name, next)}
          options={field.options.map((option) => ({ label: String(option), value: option }))}
          placeholder={`请选择${field.label}`}
        />
      );
    }
    if (field.type === 'boolean') {
      return (
        <Checkbox
          checked={Boolean(value)}
          onChange={(event) => updateField(field.name, event.target.checked)}
        >
          启用
        </Checkbox>
      );
    }
    if (field.type === 'number' || field.type === 'integer') {
      return (
        <InputNumber
          value={typeof value === 'number' ? value : undefined}
          precision={field.type === 'integer' ? 0 : undefined}
          onChange={(next) => updateField(field.name, next)}
          style={{ width: '100%' }}
        />
      );
    }
    if (field.type === 'object' || field.type === 'array') {
      return (
        <Input.TextArea
          value={value === undefined ? '' : JSON.stringify(value, null, 2)}
          onChange={(event) => {
            try {
              updateField(field.name, JSON.parse(event.target.value));
            } catch {
              // Keep complex-value editing available in the full JSON editor below.
            }
          }}
          placeholder={`${field.label} JSON`}
          autoSize={{ minRows: 2, maxRows: 6 }}
          style={{ fontFamily: 'monospace' }}
        />
      );
    }
    const inputProps = {
      value: typeof value === 'string' ? value : '',
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        updateField(field.name, event.target.value),
      placeholder: `请输入${field.label}`,
    };
    if (field.sensitive) {
      return <Input.Password {...inputProps} autoComplete="new-password" />;
    }
    return field.name === 'content' || /content|message|body|prompt/i.test(field.name) ? (
      <Input.TextArea {...inputProps} autoSize={{ minRows: 2, maxRows: 5 }} />
    ) : (
      <Input {...inputProps} />
    );
  };

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="仅用于本次部署验证"
        description="下面的字段来自当前 Skill 的参数 Schema。凭证不会写入发布配置；部署后，用户仍需绑定自己的凭证。"
      />

      {fields.map((field) => (
        <div key={field.name}>
          <Text strong={field.required}>
            {field.label}{field.required ? '（必填）' : '（可选）'}
          </Text>
          <div style={{ marginTop: 6 }}>{renderControl(field)}</div>
          {field.name === 'deviceKey' && /bark/i.test(`${field.label} ${field.description || ''}`) ? (
            <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              如果 Bark 地址是 https://api.day.app/AbCd1234，只填写最后的 <Text code>AbCd1234</Text>。
            </Paragraph>
          ) : field.description ? (
            <Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
              {field.description}
            </Paragraph>
          ) : null}
        </div>
      ))}

      {fields.length === 0 && (
        <Alert type="warning" showIcon message="未读取到参数 Schema，请在高级模式中填写 JSON。" />
      )}

      <Collapse
        ghost
        items={[
          {
            key: 'json',
            label: '高级：编辑完整 JSON',
            children: (
              <Input.TextArea
                value={draft}
                onChange={(event) => onChange(event.target.value)}
                placeholder='例如 {"content":"部署验证"}'
                autoSize={{ minRows: 4, maxRows: 8 }}
                spellCheck={false}
                style={{ fontFamily: 'monospace' }}
              />
            ),
          },
        ]}
      />
      {!isValidJson && (
        <Alert type="error" showIcon message="高级 JSON 格式不正确，请修正后再部署。" />
      )}
    </Space>
  );
};
