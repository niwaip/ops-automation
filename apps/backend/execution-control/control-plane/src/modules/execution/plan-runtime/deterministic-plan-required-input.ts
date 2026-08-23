import type {
  DeterministicPlanDraftV1,
  RequiredUserInputV1,
} from '@ops/backend-deterministic-plan';
import type { ExecutionRequiredInput } from '../state/execution.dto';

export interface DeterministicPlanRequiredInput extends ExecutionRequiredInput {
  inputPath: string;
  targetField: string;
  nodeId: string;
}

export function getMissingDeterministicPlanInputs(
  plan: DeterministicPlanDraftV1,
): DeterministicPlanRequiredInput[] {
  return (plan.requiredUserInputs || [])
    .filter((item) => item.missing !== false)
    .map((item) => normalizeRequiredInput(item));
}

export function materializeDeterministicPlanInput(
  currentInput: Record<string, unknown>,
  plan: DeterministicPlanDraftV1 | undefined,
  submittedInput: Record<string, unknown>,
): Record<string, unknown> {
  const nextInput = cloneJsonRecord(currentInput);
  if (!plan) return nextInput;

  for (const requiredInput of getMissingDeterministicPlanInputs(plan)) {
    if (!Object.prototype.hasOwnProperty.call(submittedInput, requiredInput.name)) continue;
    const value = submittedInput[requiredInput.name];
    if (value === undefined) continue;
    setValueByPath(nextInput, requiredInput.inputPath, value);
  }
  return nextInput;
}

function normalizeRequiredInput(
  item: RequiredUserInputV1,
): DeterministicPlanRequiredInput {
  const name = item.name?.trim() || `${item.nodeId}.${item.targetField}`;
  return {
    name,
    targetField: item.targetField,
    nodeId: item.nodeId,
    inputPath: item.inputPath?.trim() || `planInputs.${item.nodeId}.${item.targetField}`,
    type: item.type?.trim() || 'string',
    ...(Array.isArray(item.enum) && item.enum.length > 0 ? { enum: item.enum } : {}),
    description: item.description?.trim() || item.prompt,
    display_name: item.description?.trim() || item.prompt,
    required: true,
    required_mode: 'always',
    missing: true,
    source: 'unresolved',
    missing_reason: 'user_input_required',
  };
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value || {})) as Record<string, unknown>;
}

function setValueByPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split('.').map((item) => item.trim()).filter(Boolean);
  if (segments.length === 0) return;

  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}
