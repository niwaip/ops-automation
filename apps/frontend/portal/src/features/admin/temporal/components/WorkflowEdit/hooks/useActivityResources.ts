import { useMemo } from 'react';
import { useQuery } from 'react-query';
import { activityApi } from '@/api/activity';
import type { WorkflowDsl, ActivityDsl } from '@/api/temporal';
import type { WorkflowSelectableActivity } from './useWorkflowEditState';

export function useActivityResources(activityDsl: ActivityDsl) {
  const activitiesQuery = useQuery('activities', () => activityApi.list());
  const builtinActivitiesQuery = useQuery('builtin-activities', () => activityApi.listBuiltin());

  const activityResources = useMemo<WorkflowSelectableActivity[]>(() => {
    const customResources = (activitiesQuery.data || [])
      .filter((activity) => activity.isActive)
      .map((activity) => ({
        id: activity.id,
        source: 'custom' as const,
        ref: `custom:${activity.id}`,
        name: activity.name,
        fn: activity.fn,
        timeout: activity.timeout,
        retryPolicy: activity.retryPolicy,
        handler: activity.handler,
        config: activity.config || {},
        generatedCode: activity.generatedCode,
        isActive: activity.isActive,
        readonly: false,
      }));

    const builtinResources = (builtinActivitiesQuery.data || []).map((activity) => ({
      id: activity.key,
      source: 'builtin' as const,
      ref: activity.ref,
      name: activity.name,
      fn: activity.fn,
      timeout: activity.timeout,
      retryPolicy: activity.retryPolicy || null,
      handler: activity.handler,
      config: activity.config || {},
      generatedCode: activity.generatedCode,
      isActive: true,
      readonly: true,
      version: activity.version,
      description: activity.description,
    }));

    return [...builtinResources, ...customResources];
  }, [activitiesQuery.data, builtinActivitiesQuery.data]);

  const resolveStepActivity = (
    step?: WorkflowDsl['steps'][number]
  ): WorkflowSelectableActivity | undefined => {
    if (!step) {
      return undefined;
    }
    const base = activityResources.find(
      (activity) =>
        (step.activityRef && activity.ref === step.activityRef) ||
        (step.activityName && activity.name === step.activityName) ||
        (step.activityName && activity.fn === step.activityName)
    );

    const overlay = (activityDsl.activities || []).find(
      (activity) =>
        (step.activityRef &&
          (activity.activityRef === step.activityRef ||
            (activity.id && `custom:${activity.id}` === step.activityRef))) ||
        activity.name === step.activityName ||
        activity.fn === step.activityName ||
        (base && (activity.fn === base.fn || activity.name === base.name))
    );

    if (!base && !overlay) {
      return undefined;
    }

    if (!base && overlay) {
      return {
        id: String(overlay.id || overlay.name || overlay.fn || 'draft-activity'),
        source: 'custom' as const,
        ref: String(
          overlay.activityRef ||
            (overlay.id ? `custom:${overlay.id}` : '') ||
            `custom:${overlay.fn || overlay.name}`
        ),
        name: overlay.name || '未命名 Activity',
        fn: overlay.fn || '',
        timeout: overlay.timeout || '300s',
        retryPolicy: overlay.retryPolicy || null,
        handler: overlay.handler || 'browser',
        config: overlay.config || {},
        generatedCode: overlay.generatedCode || '',
        isActive: true,
        readonly: false,
      };
    }

    if (!overlay) {
      return base!;
    }

    return {
      ...base!,
      name: overlay.name || base!.name,
      timeout: overlay.timeout || base!.timeout,
      retryPolicy: overlay.retryPolicy || base!.retryPolicy,
      handler: overlay.handler || base!.handler,
      config: overlay.config || base!.config,
      generatedCode: overlay.generatedCode || base!.generatedCode,
    };
  };

  return {
    activityResources,
    resolveStepActivity,
    activitiesQuery,
    builtinActivitiesQuery,
  };
}
