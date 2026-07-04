export { ActivityCrudService, ActivityService, ActivityValidationService } from '@ops/platform/dist/modules/temporal-workflow';
export {
  BuiltinActivityRegistry,
  BUILTIN_ACTIVITY_REF_PREFIX,
  DOCUMENT_RENDER_ACTIVITY_KEY,
  HTTP_REQUEST_ACTIVITY_KEY,
  STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY,
} from '@ops/platform/dist/modules/temporal-workflow';
export type {
  BuiltinActivityDefinition,
} from '@ops/platform/dist/modules/temporal-workflow';
export type {
  ActivityExecutionOptions,
  ActivityFormData,
  ActivityValidationResult,
  BuiltinActivityDTO,
  GenerateCodeResult,
} from '@ops/platform/dist/modules/temporal-workflow';

import type {
  GenerateCodeResult,
} from '@ops/platform/dist/modules/temporal-workflow';
import {
  BUILTIN_ACTIVITY_REF_PREFIX as builtinActivityRefPrefix,
} from '@ops/platform/dist/modules/temporal-workflow';

export function isBuiltinActivityRef(ref: string | null | undefined): boolean {
  return Boolean(ref && ref.startsWith(builtinActivityRefPrefix));
}

export function hasGeneratedActivityCode(
  result: GenerateCodeResult,
): boolean {
  return result.success && typeof result.code === 'string' && result.code.trim().length > 0;
}
