import type { ActivityDefinition } from './temporal-workflow.types';

function normalizeCustomActivityRef(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.startsWith('custom:') ? normalized : `custom:${normalized}`;
}

export function resolveCustomActivityRef(
  activity: Partial<ActivityDefinition>,
  fallbackIndex?: number,
): string {
  return normalizeCustomActivityRef(activity.activityRef)
    || normalizeCustomActivityRef(activity.id)
    || normalizeCustomActivityRef(activity.fn)
    || normalizeCustomActivityRef(activity.name)
    || `custom:activity_${fallbackIndex ? fallbackIndex + 1 : 'unknown'}`;
}
