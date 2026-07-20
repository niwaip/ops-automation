import React, { useEffect } from 'react';
import { Button, Form, Space, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { ThunderboltOutlined } from '@ant-design/icons';
import ExecutionDetailActionBar from '@/features/executions/detail/components/ExecutionDetailActionBar';
import ExecutionDetailInfoBlock from '@/features/executions/detail/components/ExecutionDetailInfoBlock';
import ExecutionRequiredInputField from '@/features/executions/shared/components/ExecutionRequiredInputField';
import ExecutionDetailSectionCard from '@/features/executions/detail/components/ExecutionDetailSectionCard';
import type { RequiredInputField } from '@/features/executions/create/lib/inputFields';
import {
  resolveWaitingInputDisplayLabel,
  type WaitingInputDisplayGroup,
} from '@/shared/constants/waitingInputDisplay';

const { Text } = Typography;

interface WaitingInputActionPanelProps {
  title: string;
  summaryText?: string;
  requiredInputs: RequiredInputField[];
  requiredInputGroups: WaitingInputDisplayGroup<RequiredInputField>[];
  form?: FormInstance;
  submitLoading?: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onReset?: () => void;
  submitLabel: string;
  resetLabel: string;
  provideFieldPrefix: string;
  sourceLabel: string;
  enterJsonString: string;
  enterFieldPrefix: string;
  confirmTagLabel: string;
  extraActions?: React.ReactNode | ((form: FormInstance) => React.ReactNode);
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
      <ExecutionRequiredInputField
        field={field}
        jsonPlaceholder={props.enterJsonString}
        textPlaceholderPrefix={props.enterFieldPrefix}
        treatArrayAsJson
      />
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
  const [internalForm] = Form.useForm();
  const resolvedForm = form ?? internalForm;
  const fieldRenderProps = {
    provideFieldPrefix,
    sourceLabel,
    enterJsonString,
    enterFieldPrefix,
    confirmTagLabel,
  } as const;

  useEffect(() => {
    if (requiredInputs.length === 0) {
      resolvedForm.resetFields();
      return;
    }

    resolvedForm.setFieldsValue(buildInitialValues(requiredInputs));
  }, [requiredInputs, resolvedForm]);

  return (
    <ExecutionDetailSectionCard
      title={title}
      size={cardSize}
      style={{ marginBottom: 16 }}
      styles={{ body: { padding: 16 } }}
    >
      {summaryText ? (
        <ExecutionDetailInfoBlock style={{ marginBottom: 16, padding: '10px 12px' }}>
          <Text type="secondary">{summaryText}</Text>
        </ExecutionDetailInfoBlock>
      ) : null}
      <Form
        form={resolvedForm}
        layout="vertical"
        initialValues={buildInitialValues(requiredInputs)}
        onFinish={(values) => onSubmit(values as Record<string, unknown>)}
      >
        {requiredInputGroups.length > 0 ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {requiredInputGroups.map((group) => (
              <ExecutionDetailSectionCard
                key={group.label}
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
                    <ExecutionDetailSectionCard
                      key={field.name}
                      style={{ borderRadius: 10, background: 'var(--bg-secondary)' }}
                    >
                      {renderInputItem(field, fieldRenderProps)}
                    </ExecutionDetailSectionCard>
                  ))}
                </div>
              </ExecutionDetailSectionCard>
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
              <ExecutionDetailSectionCard
                key={field.name}
                style={{ borderRadius: 10, background: 'var(--bg-secondary)' }}
              >
                {renderInputItem(field, fieldRenderProps)}
              </ExecutionDetailSectionCard>
            ))}
          </div>
        )}
        <ExecutionDetailActionBar marginTop={4}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            htmlType="submit"
            loading={submitLoading}
          >
            {submitLabel}
          </Button>
          {typeof extraActions === 'function' ? extraActions(resolvedForm) : extraActions}
          <Button
            onClick={() => {
              resolvedForm.resetFields();
              onReset?.();
            }}
          >
            {resetLabel}
          </Button>
        </ExecutionDetailActionBar>
      </Form>
    </ExecutionDetailSectionCard>
  );
};

export default WaitingInputActionPanel;
