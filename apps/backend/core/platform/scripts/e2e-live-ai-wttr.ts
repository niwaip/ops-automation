import {
  TemporalWorkflowService,
} from '../src/modules/temporal/temporal-workflow.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal/builtin-activity.registry';

async function main() {
  const prisma: any = {
    temporalWorkflow: {},
    activity: {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
    },
  };
  const builtin = new BuiltinActivityRegistry();
  const service = new TemporalWorkflowService(prisma, builtin);

  const description = process.env.WORKFLOW_DESCRIPTION || [
    '实现一个天气查询工作流。',
    '公共输入必须包含 city。',
    '可选输入包含 lang 与 format。',
    '使用 wttr.in 查询天气。',
    '当 format=j1 时，返回今天相关的结构化天气数据。',
    '如果需要格式化文本展示，可增加 structuredTransform 步骤，但代码生成必须保持确定性且不能使用 workflow.unsafe。',
  ].join(' ');
  const referenceUrl = process.env.WORKFLOW_REFERENCE_URL || 'https://github.com/chubin/wttr.in';

  const draft = await service.generateAiWorkflowDraft({
    description,
    referenceUrl,
  });

  const generationLogs: string[] = [];
  const generation = await service.generateWorkflowCodeStreaming(
    draft.workflowDsl,
    draft.activityDsl,
    undefined,
    undefined,
    (log) => generationLogs.push(log),
  );
  if (!generation.success || !generation.code) {
    throw new Error(`代码生成失败: ${generation.error || 'unknown error'}`);
  }

  const workflowClassName = draft.workflowDsl.workflowClassName?.trim()
    || `${(draft.workflowDsl.name || 'Custom').replace(/\s+/g, '')}Workflow`;
  const validationLogs: string[] = [];
  const validation = await service.validateWorkflowRealStreaming(
    generation.code,
    workflowClassName,
    {
      city: process.env.CITY || 'shanghai',
      lang: process.env.LANG_PARAM || 'zh',
      format: process.env.FORMAT_PARAM || 'j1',
    },
    draft.workflowDsl.taskQueue,
    (log) => validationLogs.push(log),
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    draftSummary: {
      name: draft.name,
      description: draft.description,
      warnings: draft.warnings,
      stepCount: draft.workflowDsl.steps.length,
      steps: draft.workflowDsl.steps,
    },
    generationMode: generation.generationMode,
    generationLogs,
    validation,
    validationLogs,
  }, null, 2));

  if (!validation.success) {
    process.exit(1);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
