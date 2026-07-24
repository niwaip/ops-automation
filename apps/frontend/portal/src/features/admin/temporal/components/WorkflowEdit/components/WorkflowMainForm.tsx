import React from 'react';
import { Form, FormInstance } from 'antd';
import type { WorkflowDsl } from '@/api/temporal';
import { BasicInfoSection } from './BasicInfoSection';
import { WorkflowExecutionConfigSection } from './WorkflowExecutionConfigSection';
import { WorkflowInputParamsSection } from './WorkflowInputParamsSection';

export interface WorkflowMainFormProps {
  form: FormInstance;
  isGeneratedCodeStale: boolean;
  currentSourceContext: any;
  currentSourceTemplate: any;
  workflowDsl: WorkflowDsl;
  setWorkflowDsl: React.Dispatch<React.SetStateAction<WorkflowDsl>>;
  SECTION_CARD_STYLE: React.CSSProperties;
  SECTION_CARD_BODY_STYLE: React.CSSProperties;
  SOFT_PANEL_STYLE: React.CSSProperties;
  renderTipLabel: (label: string, tip: string) => React.ReactNode;
  renderWorkflowDurationField: (
    field: any,
    label: string,
    tip: string,
    enabled: boolean,
    defaultValue: string
  ) => React.ReactNode;
  groupedWorkflowInputParams: any;
}

export const WorkflowMainForm: React.FC<WorkflowMainFormProps> = ({
  form,
  isGeneratedCodeStale,
  currentSourceContext,
  currentSourceTemplate,
  workflowDsl,
  setWorkflowDsl,
  SECTION_CARD_STYLE,
  SECTION_CARD_BODY_STYLE,
  SOFT_PANEL_STYLE,
  renderTipLabel,
  renderWorkflowDurationField,
  groupedWorkflowInputParams,
}) => {
  return (
    <Form form={form} layout="vertical">
      <BasicInfoSection
        isGeneratedCodeStale={isGeneratedCodeStale}
        currentSourceContext={currentSourceContext}
        currentSourceTemplate={currentSourceTemplate}
        workflowDsl={workflowDsl}
        setWorkflowDsl={setWorkflowDsl}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
        SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
        renderTipLabel={renderTipLabel}
      />

      <WorkflowExecutionConfigSection
        workflowDsl={workflowDsl}
        setWorkflowDsl={setWorkflowDsl}
        renderWorkflowDurationField={renderWorkflowDurationField}
        renderTipLabel={renderTipLabel}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
        SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
      />

      <WorkflowInputParamsSection
        workflowDsl={workflowDsl}
        setWorkflowDsl={setWorkflowDsl}
        groupedWorkflowInputParams={groupedWorkflowInputParams}
        SECTION_CARD_STYLE={SECTION_CARD_STYLE}
        SECTION_CARD_BODY_STYLE={SECTION_CARD_BODY_STYLE}
        SOFT_PANEL_STYLE={SOFT_PANEL_STYLE}
      />
    </Form>
  );
};
