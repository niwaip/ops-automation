import React from 'react';
import { Button, Card, Form, Space, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { ThunderboltOutlined } from '@ant-design/icons';
import {
  renderRequiredInputField,
  type RequiredInputField,
} from '@/features/executions/lib/inputFields';
import {
  resolveWaitingInputDisplayLabel,
  type WaitingInputDisplayGroup,
} from '@/shared/lib/waitingInputDisplay';

const { Text } = Typography;

interface WaitingInputActionPanelProps {
  title: string;
  summaryText?: string;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  form: FormInstance;
  submitLoading?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onReset: () => void;
  submitLabel: string;
  resetLabel: string;
  provideFieldPrefix: string;
  sourceLabel: string;
  enterJsonString: string;
  enterFieldPrefix: string;
  confirmTagLabel: string;
  extraActions?: React.ReactNode;
  cardSize?: 'default' | 'small';
}

const buildInitialValues = (requiredInputs: RequiredInputField[]) =>
  requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
    acc[field.name] = field.value;
    return acc;
  }, {});

const renderInputItem = (
  field: RequiredInputField,
  props: Pick<
    WaitingInputActionPanelProps,
    | 'provideFieldPrefix'
    | 'sourceLabel'
    | 'enterJsonString'
    | 'enterFieldPrefix'
    | 'confirmTagLabel'
  >
) => (
  <React.Fragment key={field.name}>
    <Form.Item
      name={field.name}
      label={`${resolveWaitingInputDisplayLabel(field)} (${field.type})`}
      extra={field.description || `${props.sourceLabel}: ${field.source}`}
      rules={[
        {
          required: field.required,
          message: `${props.provideFieldPrefix} ${resolveWaitingInputDisplayLabel(field)}`,
        },
      ]}
      valuePropName={field.type.toLowerCase() === 'boolean' ? 'checked' : 'value'}
    >
      {renderRequiredInputField(field, {
        jsonPlaceholder: props.enterJsonString,
        textPlaceholderPrefix: props.enterFieldPrefix,
        treatArrayAsJson: true,
      })}
    </Form.Item>
    {field.needs_confirmation ? (
      <Tag color="gold" style={{ marginBottom: 12 }}>
        {props.confirmTagLabel}
      </Tag>
    ) : null}
  </React.Fragment>
);

const WaitingInputActionPanel: React.FC<WaitingInputActionPanelProps> = ({
  title,
  summaryText,
  requiredInputs,
  requiredInputGroups,
  form,
  submitLoading,
  onSubmit,
  onReset,
  submitLabel,
  resetLabel,
  provideFieldPrefix,
  sourceLabel,
  enterJsonString,
  enterFieldPrefix,
  confirmTagLabel,
  extraActions,
  cardSize = 'default',
}) => {
  const fieldRenderProps = {
    provideFieldPrefix,
    sourceLabel,
    enterJsonString,
    enterFieldPrefix,
    confirmTagLabel,
  } as const;

  return (
    <Card title={title} size={cardSize} style={{ marginBottom: 16 }} styles={{ body: { padding: 16 } }}>
      {summaryText ? (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--bg-secondary)',
          }}
        >
          <Text type="secondary">{summaryText}</Text>
        </div>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        initialValues={buildInitialValues(requiredInputs)}
        onFinish={(values) => onSubmit(values as Record<string, unknown>)}
      >
        {requiredInputGroups.length > 0 ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {requiredInputGroups.map((group) => (
              <Card
                key={group.label}
                size="small"
                title={group.label}
                style={{ borderRadius: 12, background: 'var(--bg-card)' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 12,
                  }}
                >
                  {group.items.map((field: RequiredInputField) => (
                    <Card
                      key={field.name}
                      size="small"
                      styles={{ body: { padding: 12 } }}
                      style={{ borderRadius: 10, background: 'var(--bg-secondary)' }}
                    >
                      {renderInputItem(field, fieldRenderProps)}
                    </Card>
                  ))}
                </div>
              </Card>
            ))}
          </Space>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {requiredInputs.map((field) => (
              <Card
                key={field.name}
                size="small"
                styles={{ body: { padding: 12 } }}
                style={{ borderRadius: 10, background: 'var(--bg-secondary)' }}
              >
                {renderInputItem(field, fieldRenderProps)}
              </Card>
            ))}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: 8,
            paddingTop: 12,
            marginTop: 4,
            borderTop: '1px solid var(--bg-secondary)',
          }}
        >
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            htmlType="submit"
            loading={submitLoading}
          >
            {submitLabel}
          </Button>
          {extraActions}
          <Button onClick={onReset}>{resetLabel}</Button>
        </div>
      </Form>
    </Card>
  );
};

export default WaitingInputActionPanel;
