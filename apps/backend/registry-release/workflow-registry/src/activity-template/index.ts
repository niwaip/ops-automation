export const BUILTIN_ACTIVITY_REF_PREFIX = 'builtin:activity:';
export const DOCUMENT_RENDER_ACTIVITY_KEY = 'builtin:activity:document_render';
export const HTTP_REQUEST_ACTIVITY_KEY = 'builtin:activity:http_request';
export const STRUCTURED_TRANSFORM_ACTIVITY_KEY = 'builtin:activity:structured_transform';
export const AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY = 'builtin:activity:ai_structured_transform';

export interface GenerateCodeResult {
  success: boolean;
  code?: string;
  error?: string;
  [key: string]: any;
}

export function isBuiltinActivityRef(ref: string | null | undefined): boolean {
  return Boolean(ref && ref.startsWith(BUILTIN_ACTIVITY_REF_PREFIX));
}

export function hasGeneratedActivityCode(
  result: GenerateCodeResult,
): boolean {
  return result.success && typeof result.code === 'string' && result.code.trim().length > 0;
}
