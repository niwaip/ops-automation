export interface TemporalWorkflowSourceTemplate {
  templateId?: string;
  version?: number;
  [key: string]: any;
}

export interface WorkflowDsl {
  sourceContext?: {
    sourceTemplate?: TemporalWorkflowSourceTemplate;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface TemplateWorkflowDraft {
  sourceTemplate?: TemporalWorkflowSourceTemplate;
  [key: string]: any;
}

export function resolveWorkflowTemplateSourceTemplate(
  workflowDsl: Pick<WorkflowDsl, 'sourceContext'> | null | undefined,
): TemporalWorkflowSourceTemplate | undefined {
  return workflowDsl?.sourceContext?.sourceTemplate ?? undefined;
}

export function hasTemplateWorkflowDraftSource(
  draft: TemplateWorkflowDraft,
): boolean {
  return Boolean(draft.sourceTemplate?.templateId?.trim());
}
