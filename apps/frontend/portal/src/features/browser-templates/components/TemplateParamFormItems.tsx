import React from 'react';
import { Form, Input } from 'antd';
import type { ParamProperty } from '@/features/browser-templates/lib/templateDetail';

interface TemplateParamFormItemsProps {
  paramProperties: Record<string, ParamProperty>;
  requiredParams: string[];
  fallbackPlaceholder: string;
}

const TemplateParamFormItems: React.FC<TemplateParamFormItemsProps> = ({
  paramProperties,
  requiredParams,
  fallbackPlaceholder,
}) => (
  <>
    {Object.entries(paramProperties).map(([paramName, paramDef]) => (
      <Form.Item
        key={paramName}
        name={paramName}
        label={paramName}
        rules={[
          { required: requiredParams.includes(paramName), message: `${paramName} is required` },
        ]}
        help={paramDef.description || undefined}
      >
        <Input placeholder={paramDef.description || fallbackPlaceholder} />
      </Form.Item>
    ))}
  </>
);

export default TemplateParamFormItems;
