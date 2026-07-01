import axios from 'axios';
import type {
  ActivityDsl,
  WorkflowDsl,
} from '../src/modules/temporal-workflow/temporal-workflow.service';
import { createTemporalWorkflowScriptService } from './temporal-workflow-script-harness';

async function main() {
  const previewFull = process.env.PREVIEW_FULL === 'true';
  const previewBodyMap = process.env.PREVIEW_BODY_MAP === 'true';
  const service = createTemporalWorkflowScriptService();

  // Build a simple workflow using builtin httpRequest with step-level config
  const workflowDsl: WorkflowDsl = {
    name: '天气查询工作流',
    workflowClassName: 'WeatherWorkflow',
    workflowDefnName: '天气查询工作流',
    taskQueue: 'SKILL_TASK_QUEUE',
    inputParams: {
      city: { description: '城市名', required: true, defaultValue: '' },
    },
    steps: [
      {
        id: 'step_1',
        name: '查询天气接口',
        type: 'activity',
        activityRef: 'builtin:httpRequest',
        activityName: 'httpRequest',
        // Step-level httpRequest config
        input: {
          __httpRequest: {
            method: 'GET',
            urlTemplate: 'https://wttr.in/{city}',
            // j1 是可选参数，这里作为默认常量注入
            queryTemplate: { format: 'j1' },
            responseMode: previewBodyMap ? 'bodyMap' : previewFull ? 'body' : 'bodyPath',
            responseBodyPath: previewBodyMap ? '' : previewFull ? '' : 'current_condition.0.temp_C',
            responseFieldMappings: previewBodyMap
              ? {
                  weatherText: 'current_condition.0.lang_zh.0.value',
                  temperatureC: 'current_condition.0.temp_C',
                  feelsLikeC: 'current_condition.0.FeelsLikeC',
                  windSpeedKmph: 'current_condition.0.windspeedKmph',
                }
              : {},
            timeout: 30,
          },
        },
        startToCloseTimeout: '30s',
      },
    ],
  };
  const activityDsl: ActivityDsl = { activities: [] };

  const gen = await service.generateWorkflowCode(workflowDsl, activityDsl);
  if (!gen.success || !gen.code) {
    throw new Error(`生成代码失败: ${gen.error || 'unknown'}`);
  }

  const code = gen.code;
  const fn =
    workflowDsl.workflowClassName ||
    `${(workflowDsl.name || 'Custom').replace(/\s+/g, '')}Workflow`;

  // Call sandbox agent for real validation
  const agentUrl =
    process.env.SANDBOX_WORKER_URL ||
    process.env.WORKFLOW_VALIDATION_AGENT_URL ||
    process.env.ACTIVITY_VALIDATION_AGENT_URL ||
    process.env.TEMPORAL_SANDBOX_AGENT_URL ||
    process.env.SANDBOX_AGENT_URL ||
    'http://localhost:8090';

  const payload = {
    code,
    fn_name: fn,
    workflow_id: `wttr-${Date.now()}`,
    input_data: {
      city: 'shanghai',
      ...(previewFull || previewBodyMap ? { __httpResponsePreview: true } : {}),
    },
    // task_queue can be omitted; the agent has its own validation queue
  };

  const resp = await axios.post(`${agentUrl}/validate-workflow`, payload, { timeout: 180000 });
  // Print concise result
  const data: any = resp.data as any;
  const ok = data?.success === true && data?.result?.success === true && !data?.result?.error;
  const result = data?.result?.result ?? data?.result;
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        agentUrl,
        previewFull,
        previewBodyMap,
        ok,
        status: resp.status,
        value: result,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
