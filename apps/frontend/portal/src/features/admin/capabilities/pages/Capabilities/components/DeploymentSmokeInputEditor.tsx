import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Checkbox, Collapse, Input, InputNumber, Select, Space, Typography } from 'antd';

const { Text, Paragraph } = Typography;
const SENSITIVE_FIELD =
  /(?:api[_-]?key|device[_-]?key|access[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|authorization|credential|password|secret|token)$/i;

export interface DeploymentSmokeInputEditorProps {
  sourcePayload?: Record<string, unknown> | null;
  environment?: string;
  draft: string;
  onChange: (draft: string) => void;
}

export interface SmokeField {
  name: string;
  label: string;
  description?: string;
  type: string;
  required: boolean;
  sensitive: boolean;
  options?: unknown[];
  defaultValue?: unknown;
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

export function parseDraft(draft: string): Record<string, unknown> {
  return parseMaybeJson(draft || '{}') || {};
}

function resolveFixedTestInput(
  sourcePayload: Record<string, unknown> | null | undefined,
  environment?: string
): Record<string, unknown> | undefined {
  if (!sourcePayload) return undefined;
  const deploymentProfiles = asRecord(sourcePayload.deploymentProfiles) || {};
  const env = environment || 'staging';
  const environmentProfile = asRecord(deploymentProfiles[env]) || {};
  const candidateInputs = [
    environmentProfile.smokeTestInput,
    environmentProfile.testInput,
    environmentProfile.validationInput,
    sourcePayload.smokeTestInput,
    sourcePayload.testInput,
    sourcePayload.validationInput,
  ];

  for (const candidate of candidateInputs) {
    const record = asRecord(candidate);
    if (record && Object.keys(record).length > 0) {
      return record;
    }
  }
  return undefined;
}

function normalizeSmokeValue(key: string, value: unknown, typeHint?: string): unknown {
  const type = String(typeHint || '').toLowerCase();
  if (type === 'number' || type === 'integer') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return type === 'integer' ? Math.round(value) : value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return type === 'integer' ? Math.round(parsed) : parsed;
      }
    }
    return 1;
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (/^true$/i.test(value.trim())) return true;
      if (/^false$/i.test(value.trim())) return false;
    }
    return true;
  }

  if (type === 'date') {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return new Date().toISOString().slice(0, 10);
  }

  if (type === 'array') {
    return Array.isArray(value) ? value : [];
  }

  if (type === 'object') {
    return asRecord(value) || {};
  }

  if (value !== undefined && value !== null && value !== '') {
    return typeof value === 'string' ? value.trim() : String(value);
  }

  const isUrlLike =
    /(^|[_-])(url|uri|link|endpoint|site|website)$/i.test(key) ||
    /(?:url|uri|link|endpoint|site|website)$/i.test(key);
  if (isUrlLike) {
    return 'https://www.bing.com';
  }

  if (key.toLowerCase() === 'platform') {
    return 'weibo';
  }

  if (/(?:device[_-]?key|bark)$/i.test(key)) {
    return 'test_device_key';
  }

  if (SENSITIVE_FIELD.test(key)) {
    return 'test_secret';
  }

  return `test_${key}`;
}

export function resolveFields(
  sourcePayload?: Record<string, unknown> | null,
  environment?: string
): SmokeField[] {
  if (!sourcePayload) return [];
  const paramsSchema = parseMaybeJson(sourcePayload.paramsSchema);
  const workflowDsl = parseMaybeJson(sourcePayload.workflowDsl);
  const inputParams = parseMaybeJson(workflowDsl?.inputParams) || {};
  const inputPolicy = parseMaybeJson(workflowDsl?.inputPolicy);
  const inputPolicies = asRecord(inputPolicy?.params) || {};
  const schemaProps =
    asRecord(paramsSchema?.properties) ||
    (Object.keys(paramsSchema || {}).length > 0 ? paramsSchema! : {});

  const fixedInput = resolveFixedTestInput(sourcePayload, environment);

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

  const allKeys = Array.from(
    new Set([
      ...Object.keys(schemaProps),
      ...Object.keys(inputParams),
      ...Object.keys(inputPolicies),
    ])
  );

  return allKeys.map((name) => {
    const rawSchemaDef = asRecord(schemaProps[name]) || {};
    const rawInputDef = asRecord(inputParams[name]) || {};
    const rawPolicyDef = asRecord(inputPolicies[name]) || {};
    const definition = { ...rawInputDef, ...rawPolicyDef, ...rawSchemaDef };

    const label = [
      definition.displayName,
      definition.title,
      rawInputDef.displayName,
      rawSchemaDef.title,
    ]
      .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      ?.trim();

    const description =
      typeof definition.description === 'string'
        ? definition.description.trim()
        : typeof rawInputDef.description === 'string'
          ? rawInputDef.description.trim()
          : undefined;

    const rawType =
      typeof definition.type === 'string'
        ? definition.type
        : typeof rawInputDef.type === 'string'
          ? rawInputDef.type
          : typeof rawSchemaDef.type === 'string'
            ? rawSchemaDef.type
            : 'string';
    const type = rawType.toLowerCase();

    const options = Array.isArray(definition.enum)
      ? definition.enum
      : Array.isArray(rawInputDef.enum)
        ? rawInputDef.enum
        : Array.isArray(rawSchemaDef.enum)
          ? rawSchemaDef.enum
          : undefined;

    if (definition.required === true || rawInputDef.required === true) {
      required.add(name);
    }
    if (rawPolicyDef.requiredMode === 'always') {
      required.add(name);
    } else if (rawPolicyDef.requiredMode === 'never') {
      required.delete(name);
    }

    let candidateValue: unknown = undefined;
    if (
      fixedInput &&
      fixedInput[name] !== undefined &&
      fixedInput[name] !== null &&
      fixedInput[name] !== ''
    ) {
      candidateValue = fixedInput[name];
    } else if (
      rawPolicyDef.defaultValue !== undefined &&
      rawPolicyDef.defaultValue !== null &&
      rawPolicyDef.defaultValue !== ''
    ) {
      candidateValue = rawPolicyDef.defaultValue;
    } else if (
      rawInputDef.defaultValue !== undefined &&
      rawInputDef.defaultValue !== null &&
      rawInputDef.defaultValue !== ''
    ) {
      candidateValue = rawInputDef.defaultValue;
    } else if (
      rawSchemaDef.default !== undefined &&
      rawSchemaDef.default !== null &&
      rawSchemaDef.default !== ''
    ) {
      candidateValue = rawSchemaDef.default;
    } else if (
      rawSchemaDef.defaultValue !== undefined &&
      rawSchemaDef.defaultValue !== null &&
      rawSchemaDef.defaultValue !== ''
    ) {
      candidateValue = rawSchemaDef.defaultValue;
    } else if (
      definition.default !== undefined &&
      definition.default !== null &&
      definition.default !== ''
    ) {
      candidateValue = definition.default;
    } else if (
      definition.defaultValue !== undefined &&
      definition.defaultValue !== null &&
      definition.defaultValue !== ''
    ) {
      candidateValue = definition.defaultValue;
    } else if (
      definition.exampleValue !== undefined &&
      definition.exampleValue !== null &&
      definition.exampleValue !== ''
    ) {
      candidateValue = definition.exampleValue;
    } else if (
      definition.example !== undefined &&
      definition.example !== null &&
      definition.example !== ''
    ) {
      candidateValue = definition.example;
    } else if (
      definition.sampleValue !== undefined &&
      definition.sampleValue !== null &&
      definition.sampleValue !== ''
    ) {
      candidateValue = definition.sampleValue;
    } else {
      const locDef =
        asRecord(definition.localizedDefaultValue) || asRecord(rawInputDef.localizedDefaultValue);
      if (locDef) {
        const firstVal = Object.values(locDef).find(
          (v) => v !== undefined && v !== null && v !== ''
        );
        if (firstVal !== undefined) candidateValue = firstVal;
      }
    }

    if (candidateValue === undefined && options && options.length > 0) {
      candidateValue = options[0];
    }

    const normalizedDefault = normalizeSmokeValue(name, candidateValue, type);

    return {
      name,
      label: label || name,
      description,
      type,
      required: required.has(name),
      sensitive: SENSITIVE_FIELD.test(name),
      options,
      defaultValue: normalizedDefault,
    };
  });
}

export function buildDefaultSmokeTestInput(
  sourcePayload?: Record<string, unknown> | null,
  environment?: string
): Record<string, unknown> {
  const fields = resolveFields(sourcePayload, environment);
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      result[field.name] = field.defaultValue;
    }
  }
  return result;
}

export function findMissingRequiredSmokeFields(
  sourcePayload: Record<string, unknown> | null | undefined,
  values: Record<string, unknown> | undefined,
  environment?: string
) {
  return resolveFields(sourcePayload, environment)
    .filter((field) => {
      if (!field.required) return false;
      const value = values?.[field.name];
      return value === undefined || value === null || value === '';
    })
    .map((field) => field.label);
}

export const DeploymentSmokeInputEditor: React.FC<DeploymentSmokeInputEditorProps> = ({
  sourcePayload,
  environment = 'staging',
  draft,
  onChange,
}) => {
  const fields = useMemo(
    () => resolveFields(sourcePayload, environment),
    [sourcePayload, environment]
  );
  const defaultValues = useMemo(
    () => buildDefaultSmokeTestInput(sourcePayload, environment),
    [sourcePayload, environment]
  );
  const parsedValues = useMemo(() => parseDraft(draft), [draft]);
  const isValidJson = useMemo(() => Boolean(parseMaybeJson(draft || '{}')), [draft]);

  // When draft is empty or '{}', automatically initialize with defaultValues
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!sourcePayload || fields.length === 0) return;
    const isDraftEmpty = !draft || draft.trim() === '' || draft.trim() === '{}';
    if (isDraftEmpty && Object.keys(defaultValues).length > 0) {
      onChange(JSON.stringify(defaultValues, null, 2));
      initializedRef.current = true;
    }
  }, [sourcePayload, fields.length, draft, defaultValues, onChange]);

  const values = useMemo(() => {
    return { ...defaultValues, ...parsedValues };
  }, [defaultValues, parsedValues]);

  const updateField = (name: string, value: unknown) => {
    const next = { ...values };
    if (value !== undefined && value !== null) next[name] = value;
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
        message="部署验证参数（已自动预填默认值）"
        description="系统已自动提取源定义中的默认值与测试数据，无需人为手动输入即可直接部署验证；如需自定义也可在下方修改或编辑完整 JSON。"
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
