import type {
  ActivityDefinition,
  ActivityDsl,
  WorkflowDsl,
} from './temporal-workflow.types';
import { TemporalWorkflowActivityResolutionService } from './temporal-workflow-activity-resolution.service';
import type { TemporalWorkflowActivityResolutionSupport } from './temporal-workflow-activity-resolution.service';

interface CollectEnrichedActivitiesParams {
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  activityResolutionService: TemporalWorkflowActivityResolutionService;
  createActivityResolutionSupport: () => TemporalWorkflowActivityResolutionSupport;
  buildDeterministicActivityCode: (activityDef: ActivityDsl['activities'][number]) => string | null;
}

export async function collectEnrichedActivities(
  params: CollectEnrichedActivitiesParams,
): Promise<ActivityDefinition[]> {
  const {
    workflowDsl,
    activityDsl,
    activityResolutionService,
    createActivityResolutionSupport,
    buildDeterministicActivityCode,
  } = params;

  const enrichedActivities: ActivityDefinition[] = [];
  const seenActivityKeys = new Set<string>();

  const pushActivity = (activity: ActivityDefinition | null) => {
    if (!activity) {
      return;
    }
    const activityKey = `${activity.fn}::${activity.name}`;
    if (seenActivityKeys.has(activityKey)) {
      return;
    }
    seenActivityKeys.add(activityKey);
    enrichedActivities.push(activity);
  };

  for (const activity of activityDsl.activities) {
    const enriched = await activityResolutionService.enrichActivityDefinition(
      activity,
      createActivityResolutionSupport(),
    );
    if (enriched.handler === 'browser') {
      enriched.generatedCode = buildDeterministicActivityCode(enriched) || enriched.generatedCode || undefined;
    } else if (!enriched.generatedCode) {
      enriched.generatedCode = buildDeterministicActivityCode(enriched) || undefined;
    }
    pushActivity(enriched);
  }

  for (const step of workflowDsl.steps.filter((item) => item.type === 'activity')) {
    pushActivity(await activityResolutionService.resolveActivityDefinition(
      step,
      activityDsl,
      createActivityResolutionSupport(),
    ));
  }

  return enrichedActivities;
}
