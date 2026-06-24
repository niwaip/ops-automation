import type { LLMUsage } from '../react-engine/interfaces';

export type ChatUserContext = {
  userId?: string;
  userRoles?: string[];
};

export type WaitingInputSemanticGroup = {
  key: string;
  label: string;
  kind: 'field' | 'array_group';
  blocking: boolean;
  required: boolean;
  fieldNames?: string[];
  missingFieldNames?: string[];
  description?: string;
};

export type WaitingInputSemantic = {
  mode?: 'field_level' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  summary?: string;
  groupedMissing?: WaitingInputSemanticGroup[];
};

export type WaitingInputItem = {
  name: string;
  type?: string;
  description?: string;
  group_label?: string;
  display_name?: string;
  missing?: boolean;
  needs_confirmation?: boolean;
};

export type WaitingInputRequiredItem = {
  name: string;
  value?: unknown;
  missing?: boolean;
};

export type WaitingInputDetails = {
  waitingStepId?: string;
  missingInputs: WaitingInputItem[];
  allRequiredInputs: WaitingInputRequiredItem[];
};

export type ChatSkillSchema = {
  name?: string;
  description?: string;
  paramsSchema?: {
    properties?: Record<
      string,
      {
        type: string;
        description?: string;
        extractionPrompt?: string;
        default?: string | number | boolean;
      }
    >;
    required?: string[];
  };
  guideContext?: import('../../interfaces').DocumentGuideContext;
};

export type WaitingInputPayload = {
  input: Record<string, unknown>;
  usage?: LLMUsage;
};
