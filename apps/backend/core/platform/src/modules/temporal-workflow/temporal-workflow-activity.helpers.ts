import type { ActivityDefinition, ActivityDsl, WorkflowDsl } from './temporal-workflow.types';
import { TemporalWorkflowActivityResolutionService } from './temporal-workflow-activity-resolution.service';
import type { TemporalWorkflowActivityResolutionSupport } from './temporal-workflow-activity-resolution.service';
import type { ActivityCodegenService } from './temporal-activity-codegen.service';

interface CollectEnrichedActivitiesParams {
  workflowDsl: WorkflowDsl;
  activityDsl: ActivityDsl;
  activityResolutionService: TemporalWorkflowActivityResolutionService;
  createActivityResolutionSupport: () => TemporalWorkflowActivityResolutionSupport;
  buildDeterministicActivityCode: (activityDef: ActivityDsl['activities'][number]) => string | null;
  activityCodegenService?: ActivityCodegenService;
  onProgress?: (log: string) => void;
}

export async function collectEnrichedActivities(
  params: CollectEnrichedActivitiesParams
): Promise<ActivityDefinition[]> {
  const {
    workflowDsl,
    activityDsl,
    activityResolutionService,
    createActivityResolutionSupport,
    buildDeterministicActivityCode,
    activityCodegenService,
    onProgress,
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
      createActivityResolutionSupport()
    );
    if (enriched.handler === 'browser') {
      enriched.generatedCode =
        buildDeterministicActivityCode(enriched) || enriched.generatedCode || undefined;
    } else if (!enriched.generatedCode) {
      enriched.generatedCode = buildDeterministicActivityCode(enriched) || undefined;
    }
    // P1-C-B: AI 只生成 Activity 业务代码 — 确定性代码缺失时，用 AI 逐 Activity 生成
    if (!enriched.generatedCode && activityCodegenService) {
      onProgress?.(
        `[${new Date().toISOString()}] AI 生成 Activity 代码: ${enriched.name} (${enriched.fn})`
      );
      try {
        const retryPolicy =
          enriched.retryPolicy && typeof enriched.retryPolicy.maxRetries === 'number'
            ? { maxRetries: enriched.retryPolicy.maxRetries, backoffMs: enriched.retryPolicy.backoffMs }
            : undefined;
        const aiResult = await activityCodegenService.generateCode({
          name: enriched.name,
          fn: enriched.fn,
          timeout: enriched.timeout,
          retryPolicy,
          handler: enriched.handler,
          config: enriched.config,
          generatedCode: enriched.generatedCode,
          isActive: true,
        });
        if (aiResult.success && aiResult.code) {
          enriched.generatedCode = aiResult.code;
          onProgress?.(
            `[${new Date().toISOString()}] AI Activity 代码生成成功: ${enriched.name}`
          );
        } else {
          onProgress?.(
            `[${new Date().toISOString()}] AI Activity 代码生成失败: ${enriched.name} - ${
              aiResult.error || 'unknown'
            }`
          );
        }
      } catch {
        onProgress?.(
          `[${new Date().toISOString()}] AI Activity 代码生成异常: ${enriched.name}，将回退到完整 AI 工作流生成`
        );
      }
    }
    pushActivity(enriched);
  }

  for (const step of workflowDsl.steps.filter((item) => item.type === 'activity')) {
    pushActivity(
      await activityResolutionService.resolveActivityDefinition(
        step,
        activityDsl,
        createActivityResolutionSupport()
      )
    );
  }

  return enrichedActivities;
}
