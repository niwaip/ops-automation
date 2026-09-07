import { DatePicker, Form, Input, InputNumber, Select, Switch } from 'antd';
import type { FormInstance } from 'antd/es/form';
import dayjs from 'dayjs';
import React, { useEffect, useMemo } from 'react';
import type { WorkflowTemplateDefinition } from '../../../api/workbenchCoordination';

interface DynamicWorkflowFormProps {
  template: WorkflowTemplateDefinition;
  form: FormInstance;
  initialValues?: Record<string, any>;
}

export const DynamicWorkflowForm: React.FC<DynamicWorkflowFormProps> = ({
  template,
  form,
  initialValues,
}) => {
  const { properties = {}, required = [] } = template.paramsSchema || {};

  useEffect(() => {
    if (!initialValues) return;
    const valuesToSet: Record<string, any> = {};

    Object.entries(properties).forEach(([key, prop]) => {
      const rawVal = initialValues[key];
      if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
        if (prop.type === 'date') {
          valuesToSet[key] = dayjs.isDayjs(rawVal) ? rawVal : dayjs(rawVal);
        } else if (prop.type === 'number') {
          valuesToSet[key] = Number(rawVal);
        } else {
          valuesToSet[key] = rawVal;
        }
      } else if (prop.default !== undefined) {
        valuesToSet[key] = prop.default;
      }
    });

    form.setFieldsValue(valuesToSet);
  }, [template, initialValues, form, properties]);

  // 智能配对排序：将成对的字段（如类型+时长、开始+结束时间、类别+金额）排在同一行
  const orderedEntries = useMemo(() => {
    const entries = Object.entries(properties);
    const sorted = [...entries].sort(([aKey], [bKey]) => {
      const aIsReason =
        aKey === 'reason' || aKey === 'content' || aKey === 'desc' || aKey === 'description';
      const bIsReason =
        bKey === 'reason' || bKey === 'content' || bKey === 'desc' || bKey === 'description';
      if (aIsReason && !bIsReason) return 1;
      if (!aIsReason && bIsReason) return -1;
      return 0;
    });

    const moveToAfter = (targetKey: string, afterKey: string) => {
      const targetIdx = sorted.findIndex(([k]) => k === targetKey);
      const afterIdx = sorted.findIndex(([k]) => k === afterKey);
      if (targetIdx !== -1 && afterIdx !== -1 && targetIdx !== afterIdx + 1) {
        const [item] = sorted.splice(targetIdx, 1);
        const newAfterIdx = sorted.findIndex(([k]) => k === afterKey);
        sorted.splice(newAfterIdx + 1, 0, item);
      }
    };

    moveToAfter('durationHours', 'leaveType');
    moveToAfter('endTime', 'startTime');
    moveToAfter('amount', 'expenseType');
    moveToAfter('emergencyContact', 'handoverPerson');

    return sorted;
  }, [properties]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        columnGap: 12,
        rowGap: 0,
      }}
    >
      {orderedEntries.map(([key, prop]) => {
        const isFieldRequired = required.includes(key) || Boolean(prop.required);
        const label = prop.description || key;
        const isReason =
          key === 'reason' ||
          key === 'content' ||
          key === 'desc' ||
          key === 'description' ||
          Boolean(
            prop.description &&
              (prop.description.includes('事由') ||
                prop.description.includes('说明') ||
                prop.description.includes('背景'))
          );

        let inputElement: React.ReactNode;

        if (Array.isArray(prop.enum) && prop.enum.length > 0) {
          inputElement = (
            <Select
              placeholder={`选择${label}`}
              options={prop.enum.map((opt) => ({
                label: String(opt),
                value: opt,
              }))}
            />
          );
        } else if (prop.type === 'date') {
          inputElement = (
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder={`选择${label}`}
            />
          );
        } else if (prop.type === 'number') {
          const isMoney =
            key.toLowerCase().includes('amount') ||
            key.toLowerCase().includes('price') ||
            key.toLowerCase().includes('fee');
          const isHours =
            key.toLowerCase().includes('duration') || key.toLowerCase().includes('hours');
          const isDays = key.toLowerCase().includes('days');
          inputElement = (
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              prefix={isMoney ? '¥' : undefined}
              addonAfter={isHours ? '小时' : isDays ? '天' : undefined}
              placeholder={`输入${label}`}
            />
          );
        } else if (prop.type === 'boolean') {
          inputElement = <Switch />;
        } else if (isReason) {
          inputElement = (
            <Input.TextArea
              rows={2}
              placeholder={`输入${label}（必填，便于审批核实）`}
            />
          );
        } else {
          inputElement = <Input placeholder={`输入${label}`} />;
        }

        return (
          <div
            key={key}
            style={{
              gridColumn: isReason ? '1 / -1' : 'span 1',
            }}
          >
            <Form.Item
              name={key}
              label={label}
              rules={[
                {
                  required: isFieldRequired,
                  message: `请填写${label}`,
                },
              ]}
              style={{ marginBottom: 10 }}
            >
              {inputElement}
            </Form.Item>
          </div>
        );
      })}
    </div>
  );
};
