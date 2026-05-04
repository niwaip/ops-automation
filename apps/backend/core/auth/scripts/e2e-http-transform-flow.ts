import {
  ActivityDsl,
  TemporalWorkflowService,
  WorkflowDsl,
} from '../src/modules/temporal-workflow/temporal-workflow.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';

async function main() {
  const prisma: any = {
    temporalWorkflow: {},
    activity: {},
  };
  const builtin = new BuiltinActivityRegistry();
  const service = new TemporalWorkflowService(prisma, builtin);

  const city = process.env.CITY || '上海';
  const inputParams = {
    city,
  };

  const httpStepConfig = {
    method: 'GET',
    urlTemplate: 'https://wttr.in/{city}',
    queryTemplate: {
      format: 'j1',
      lang: 'zh',
    },
    responseMode: 'bodyMap',
    responseFieldMappings: {
      weatherText: 'current_condition.0.lang_zh.0.value',
      temperatureC: 'current_condition.0.temp_C',
      feelsLikeC: 'current_condition.0.FeelsLikeC',
      humidity: 'current_condition.0.humidity',
    },
    timeout: 30,
  };

  const preview = await service.previewHttpRequestConfig(httpStepConfig, inputParams);
  if (!preview.success || !preview.previewResponse) {
    throw new Error(`HTTP 预览失败: ${preview.error || 'unknown error'}`);
  }

  const transformGoal = `请把 ${city} 今天的天气信息整理为最终 JSON，至少包含 weatherText、temperatureC、feelsLikeC、humidity，并补充一句中文 summary。`;
  const generatedTransform = await service.generateStructuredTransformConfig(
    preview.previewResponse.body ?? preview.previewResponse,
    transformGoal,
    {
      contentType: 'json',
      outputMode: 'json',
    },
  );
  if (!generatedTransform.success || !generatedTransform.config) {
    throw new Error(`结构化配置生成失败: ${generatedTransform.error || 'unknown error'}`);
  }

  const workflowDsl: WorkflowDsl = {
    name: '天气结构化工作流',
    workflowClassName: 'WeatherStructuredWorkflow',
    workflowDefnName: '天气结构化工作流',
    taskQueue: 'SKILL_TASK_QUEUE',
    inputParams: {
      city: { description: '城市名', required: true, defaultValue: '' },
    },
    steps: [
      {
        id: 'step_http',
        name: '查询天气接口',
        type: 'activity',
        activityRef: 'builtin:httpRequest',
        activityName: 'httpRequest',
        startToCloseTimeout: '45s',
        input: {
          __httpRequest: httpStepConfig,
        },
      },
      {
        id: 'step_transform',
        name: '整理天气结果',
        type: 'activity',
        activityRef: 'builtin:structuredTransform',
        activityName: 'structuredTransform',
        startToCloseTimeout: '90s',
        input: {
          __structuredTransform: generatedTransform.config,
        },
      },
    ],
  };

  const activityDsl: ActivityDsl = {
    activities: [],
  };

  const generationLogs: string[] = [];
  const generated = await service.generateWorkflowCodeStreaming(
    workflowDsl,
    activityDsl,
    undefined,
    undefined,
    (log) => generationLogs.push(log),
  );
  if (!generated.success || !generated.code) {
    throw new Error(`代码生成失败: ${generated.error || 'unknown error'}`);
  }

  const validationLogs: string[] = [];
  const validation = await service.validateWorkflowRealStreaming(
    generated.code,
    workflowDsl.workflowClassName || 'WeatherStructuredWorkflow',
    inputParams,
    workflowDsl.taskQueue,
    (log) => validationLogs.push(log),
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    city,
    generationMode: generated.generationMode,
    generatedTransformConfig: generatedTransform.config,
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
