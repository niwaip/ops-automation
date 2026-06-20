import type {
  ExecutionDto,
  ExecutionStepDto,
  WaitingInputDisplayGroup,
} from '../../types/execution.types.js';
import type { SkillConfig, SkillParamProperty } from '../../types/skill.types.js';
import { buildWaitingInputDisplayGroups } from '../../lib/waiting-input-display.js';

export interface RequiredInputField {
  name: string;
  type: string;
  description?: string;
  display_name?: string;
  group_label?: string;
  value?: unknown;
}

const JSON_LIKE_INPUT_TYPES = new Set(['object', 'json', 'array']);

export const isJsonLikeInputType = (type: string): boolean =>
  JSON_LIKE_INPUT_TYPES.has(type.toLowerCase());

export const isBooleanInputType = (type: string): boolean => type.toLowerCase() === 'boolean';

export const isNumericInputType = (type: string): boolean => {
  const normalizedType = type.toLowerCase();
  return normalizedType === 'number' || normalizedType === 'integer';
};

export const parseExecutionInputValue = (type: string, value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (isJsonLikeInputType(type) && typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
};

export const buildSkillExecutionInputInitialValues = (
  skill?: SkillConfig
): Record<string, unknown> => {
  const entries = Object.entries(skill?.paramsSchema?.properties || {});
  return Object.fromEntries(
    entries.map(([name, config]) => [
      name,
      config.default ?? (isBooleanInputType(config.type) ? false : undefined),
    ])
  );
};

export const normalizeSkillExecutionInput = (
  values: Record<string, unknown>,
  properties: Record<string, SkillParamProperty>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) => {
      const config = properties[key];
      if (!config) {
        return [];
      }

      const parsedValue = parseExecutionInputValue(config.type, value);
      return parsedValue === undefined ? [] : [[key, parsedValue]];
    })
  );

export const getExecutionWaitingInputStep = (
  execution: ExecutionDto,
  steps?: ExecutionStepDto[]
): ExecutionStepDto | undefined => {
  if (execution.status !== 'waiting_input' || !steps?.length) {
    return undefined;
  }

  return steps.find(
    (step) =>
      step.id === execution.currentStepId ||
      (step.type === 'input_collection' && step.status === 'running')
  );
};

export const getExecutionWaitingInputFields = (
  execution: ExecutionDto,
  steps?: ExecutionStepDto[]
): RequiredInputField[] => {
  const waitingInputStep = getExecutionWaitingInputStep(execution, steps);
  const rawFields = waitingInputStep?.inputJson?.requiredInputs;
  if (!Array.isArray(rawFields)) {
    return [];
  }

  return rawFields.flatMap((field) => {
    if (typeof field !== 'object' || field === null) {
      return [];
    }

    const candidate = field as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      return [];
    }

    return [
      {
        name: candidate.name,
        type:
          typeof candidate.type === 'string' && candidate.type.trim() ? candidate.type : 'unknown',
        description: typeof candidate.description === 'string' ? candidate.description : undefined,
        display_name:
          typeof candidate.display_name === 'string' ? candidate.display_name : undefined,
        group_label: typeof candidate.group_label === 'string' ? candidate.group_label : undefined,
        value: candidate.value,
      },
    ];
  });
};

export const buildExecutionWaitingInputInitialValues = (
  fields: RequiredInputField[]
): Record<string, unknown> =>
  Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.value ?? (isBooleanInputType(field.type) ? false : undefined),
    ])
  );

export const normalizeExecutionWaitingInputValues = (
  values: Record<string, unknown>,
  requiredInputs: RequiredInputField[]
): Record<string, unknown> =>
  requiredInputs.reduce<Record<string, unknown>>((acc, field) => {
    const parsedValue = parseExecutionInputValue(field.type, values[field.name]);
    if (parsedValue !== undefined) {
      acc[field.name] = parsedValue;
    }
    return acc;
  }, {});

export const buildExecutionWaitingInputGroups = (
  execution: ExecutionDto,
  steps?: ExecutionStepDto[]
): WaitingInputDisplayGroup<RequiredInputField>[] =>
  buildWaitingInputDisplayGroups(getExecutionWaitingInputFields(execution, steps));
