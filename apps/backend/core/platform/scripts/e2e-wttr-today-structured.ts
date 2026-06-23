import * as http from 'node:http';

import {
  ActivityDsl,
  TemporalWorkflowService,
  WorkflowDsl,
} from '../src/modules/temporal/temporal-workflow.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal/builtin-activity.registry';

const WTTR_SAMPLE = {
  current_condition: [
    {
      FeelsLikeC: '18',
      humidity: '73',
      lang_zh: [{ value: '晴朗' }],
      localObsDateTime: '2026-05-03 08:40 PM',
      precipMM: '0.0',
      pressure: '1014',
      temp_C: '18',
      visibility: '10',
      weatherCode: '113',
      weatherDesc: [{ value: 'Clear' }],
      winddir16Point: 'N',
      windspeedKmph: '13',
    },
  ],
  nearest_area: [
    {
      areaName: [{ value: 'Pootung' }],
      country: [{ value: 'China' }],
      region: [{ value: 'Shanghai' }],
    },
  ],
  request: [
    {
      query: 'Lat 31.23 and Lon 121.49',
      type: 'LatLon',
    },
  ],
  weather: [
    {
      date: '2026-05-03',
      avgtempC: '18',
      maxtempC: '24',
      mintempC: '17',
      astronomy: [
        {
          sunrise: '05:08 AM',
          sunset: '06:34 PM',
        },
      ],
      hourly: [
        {
          time: '0',
          tempC: '17',
          FeelsLikeC: '17',
          humidity: '92',
          chanceofrain: '100',
          lang_zh: [{ value: '小雨' }],
          weatherDesc: [{ value: 'Light rain' }],
          windspeedKmph: '15',
        },
        {
          time: '1200',
          tempC: '24',
          FeelsLikeC: '25',
          humidity: '65',
          chanceofrain: '0',
          lang_zh: [{ value: '晴朗' }],
          weatherDesc: [{ value: 'Sunny' }],
          windspeedKmph: '14',
        },
        {
          time: '2100',
          tempC: '20',
          FeelsLikeC: '20',
          humidity: '78',
          chanceofrain: '0',
          lang_zh: [{ value: '晴朗间多云' }],
          weatherDesc: [{ value: 'Partly cloudy' }],
          windspeedKmph: '9',
        },
      ],
    },
  ],
};

async function startMockServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname.startsWith('/wttr/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(WTTR_SAMPLE));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}

async function main() {
  const mock = await startMockServer();
  const previewHost = process.env.WORKFLOW_HTTP_PREVIEW_HOST || '127.0.0.1';
  const runtimeHost =
    process.env.WORKFLOW_HTTP_RUNTIME_HOST ||
    process.env.WORKFLOW_HTTP_MOCK_HOST ||
    'host.docker.internal';
  const prisma: any = {
    temporalWorkflow: {},
    activity: {},
  };
  const builtin = new BuiltinActivityRegistry();
  const service = new TemporalWorkflowService(prisma, builtin);
  const httpStepConfig = {
    method: 'GET',
    urlTemplate: `http://${runtimeHost}:${mock.port}/wttr/{city}`,
    queryTemplate: {
      format: '{format}',
      lang: '{lang}',
    },
    headersTemplate: {},
    jsonTemplate: {},
    dataTemplate: {},
    timeout: 15,
    responseMode: 'body',
    responseBodyPath: '',
    responseFieldMappings: {},
  };
  const sampleInputs = {
    city: 'shanghai',
    lang: 'zh',
    format: 'j1',
  };
  const preview = await service.previewHttpRequestConfig(
    {
      ...httpStepConfig,
      urlTemplate: `http://${previewHost}:${mock.port}/wttr/{city}`,
    },
    sampleInputs
  );
  if (!preview.success || !preview.previewResponse) {
    throw new Error(`HTTP 预览失败: ${preview.error || 'unknown error'}`);
  }
  const generatedTransform = await service.generateStructuredTransformConfig(
    preview.previewResponse.body ?? preview.previewResponse,
    [
      '请根据输入 JSON 提取今天的天气结果并返回 JSON。',
      '只处理今天相关的数据。',
      '输出字段使用稳定、可审计的固定规则，不要依赖 instructionTemplate 作为唯一执行逻辑。',
      '如果需要输出字段，请优先生成 fieldMappings；只有文本输出才生成 textTemplate。',
    ].join('\n'),
    {
      contentType: 'json',
      outputMode: 'json',
    }
  );
  if (!generatedTransform.success || !generatedTransform.config) {
    throw new Error(`结构化转换配置生成失败: ${generatedTransform.error || 'unknown error'}`);
  }

  const workflowDsl: WorkflowDsl = {
    name: '天气查询工作流-今日结构化',
    workflowClassName: 'TodayWeatherStructuredWorkflow',
    workflowDefnName: '天气查询工作流-今日结构化',
    taskQueue: 'SKILL_TASK_QUEUE',
    inputParams: {
      city: { description: '城市名', required: true, defaultValue: '' },
      lang: { description: '语言', required: false, defaultValue: 'zh' },
      format: { description: 'wttr 输出格式', required: false, defaultValue: 'j1' },
    },
    outputParams: {
      todayWeather: {
        description: '今天的结构化天气信息',
        sourceStep: 'step_2',
      },
    },
    steps: [
      {
        id: 'step_1',
        name: '查询城市天气(JSON格式)',
        type: 'activity',
        activityRef: 'builtin:httpRequest',
        activityName: 'httpRequest',
        startToCloseTimeout: '30s',
        input: {
          __httpRequest: httpStepConfig,
        },
      },
      {
        id: 'step_2',
        name: '提取今日天气信息',
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

  const activityDsl: ActivityDsl = { activities: [] };
  const generationLogs: string[] = [];
  const generation = await service.generateWorkflowCodeStreaming(
    workflowDsl,
    activityDsl,
    undefined,
    undefined,
    (log) => generationLogs.push(log)
  );

  if (!generation.success || !generation.code) {
    throw new Error(`代码生成失败: ${generation.error || 'unknown error'}`);
  }

  const validationLogs: string[] = [];
  const validation = await service.validateWorkflowRealStreaming(
    generation.code,
    workflowDsl.workflowClassName || 'TodayWeatherStructuredWorkflow',
    {
      city: 'shanghai',
      lang: 'zh',
      format: 'j1',
    },
    workflowDsl.taskQueue,
    (log) => validationLogs.push(log)
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        mockPreviewBaseUrl: `http://${previewHost}:${mock.port}`,
        mockRuntimeBaseUrl: `http://${runtimeHost}:${mock.port}`,
        validWttrExamples: ['https://wttr.in/Berlin?lang=zh', 'https://wttr.in/shanghai?format=j1'],
        generationMode: generation.generationMode,
        generatedTransformConfig: generatedTransform.config,
        generationLogs,
        validation,
        validationLogs,
      },
      null,
      2
    )
  );

  await mock.close();

  if (!validation.success) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
