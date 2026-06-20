import { Injectable } from '@nestjs/common';
import { BrowserCommand } from './browser-command.service';
import {
  BROWSER_RECORDING_EXECUTION_PLAN_VERSION,
  buildBrowserRecordingExecutionPlan,
} from './browser-recording-execution-plan';
import { RecorderLoopDraftState, TemplateStepLike } from './recorder-loop.types';

type ExportBackendLike = 'cli' | 'chrome-devtools' | 'mcp';

interface ExportParameterLike {
  name: string;
  description: string;
  required: boolean;
  exampleValue?: string;
  source?: string;
}

interface ExportOutputLike {
  name: string;
  description: string;
  location: string;
}

interface ExportMetadataLike {
  name: string;
  description: string;
}

interface ExportObservationLike {
  currentPageUrl?: string;
}

@Injectable()
export class RecorderExportService {
  inferSkillOutputs(
    commands: BrowserCommand[],
    observation?: ExportObservationLike
  ): ExportOutputLike[] {
    const outputs = new Map<string, ExportOutputLike>();
    const currentPageLocation = observation?.currentPageUrl
      ? `浏览器当前页面（${observation.currentPageUrl}）`
      : '浏览器当前页面';

    if (commands.length > 0) {
      outputs.set('pageState', {
        name: 'pageState',
        description: '执行完成后的页面状态、页面标题和可见内容',
        location: currentPageLocation,
      });
      outputs.set('executionResult', {
        name: 'executionResult',
        description: '每一步浏览器命令的执行结果与错误信息',
        location: '脚本标准输出 JSON 和 OUTPUT_FILE 文件',
      });
    }

    if (commands.some((command) => command.tool === 'snapshot' || command.tool === 'screenshot')) {
      outputs.set('snapshotArtifact', {
        name: 'snapshotArtifact',
        description: '页面快照或截图产物',
        location: 'browser worker 返回结果中的 path/snapshot 字段',
      });
    }

    if (commands.some((command) => command.tool === 'get_text' || command.tool === 'read_page')) {
      outputs.set('pageText', {
        name: 'pageText',
        description: '页面文本读取结果',
        location: 'browser worker execute 返回的 results[*].data.text',
      });
    }

    return [...outputs.values()];
  }

  buildSkillUsageMarkdown(input: {
    userGoal: string;
    backend: ExportBackendLike;
    runtimeSessionId: string;
    parameters: ExportParameterLike[];
    outputs: ExportOutputLike[];
  }): string {
    const parameterLines =
      input.parameters.length > 0
        ? input.parameters.map((param) => {
            const detail = [
              `- ${param.name}: ${param.description}`,
              param.required ? '必填' : '可选',
              param.exampleValue ? `示例=${param.exampleValue}` : undefined,
              param.source ? `来源=${param.source}` : undefined,
            ]
              .filter(Boolean)
              .join(' | ');
            return detail;
          })
        : ['- 无显式参数，直接调用即可'];
    const outputLines =
      input.outputs.length > 0
        ? input.outputs.map(
            (output) => `- ${output.name}: ${output.description} | 位置=${output.location}`
          )
        : ['- 执行结果以 browser worker 返回为准'];

    return [
      '# Recorder Built-in Skill',
      '',
      '## 目标',
      `${input.userGoal}`,
      '',
      '## 调用方式',
      'AI 聊天窗口只解析参数并调用该 skill。',
      'skill 内部按固定 executionPlan 调用 browser worker。',
      '',
      '## 默认运行配置',
      `- backend: ${input.backend}`,
      `- runtimeSessionId: ${input.runtimeSessionId}`,
      '',
      '## 参数',
      ...parameterLines,
      '',
      '## 输出',
      ...outputLines,
      '',
      '## 约束',
      '- 不允许聊天窗口自行改写执行步骤。',
      '- 页面变化较大时需要重新录制并重新生成 skill。',
    ].join('\n');
  }

  buildSkillPublishPayload(input: {
    userGoal: string;
    backend: ExportBackendLike;
    runtimeSessionId: string;
    commands: BrowserCommand[];
    templateSteps?: TemplateStepLike[];
    loopDraft?: RecorderLoopDraftState;
    loopPlanPreview?: Array<Record<string, unknown>>;
    parameters: ExportParameterLike[];
    outputs: ExportOutputLike[];
    metadata: ExportMetadataLike;
    exportArtifactId?: string;
  }): Record<string, unknown> {
    const paramsSchema = {
      properties: Object.fromEntries(
        input.parameters.map((param) => {
          const inferredType = this.inferSchemaTypeFromParameter(param.name);
          return [
            param.name,
            {
              type: inferredType,
              description: param.description,
              required: param.required,
              ...(param.exampleValue
                ? { default: this.coerceSchemaDefault(param.exampleValue, inferredType) }
                : {}),
              ...(param.source
                ? {
                    extractionPrompt: `优先从用户输入中提取 ${param.name}，来源提示: ${param.source}`,
                  }
                : {}),
            },
          ];
        })
      ),
      required: input.parameters.filter((param) => param.required).map((param) => param.name),
    };

    const executionPlan = buildBrowserRecordingExecutionPlan({
      backend: input.backend,
      runtimeSessionId: input.runtimeSessionId,
      commands: input.commands as unknown as Record<string, unknown>[],
      templateSteps: input.templateSteps as unknown as Array<Record<string, unknown>> | undefined,
      loopDraft: input.loopDraft as unknown as Record<string, unknown> | undefined,
      parameters: input.parameters,
      outputs: input.outputs,
      trace: {
        recorderSessionId: input.runtimeSessionId,
        exportArtifactId: input.exportArtifactId,
      },
    });

    return {
      name: input.metadata.name,
      description: input.metadata.description,
      triggerKeywords: this.buildTriggerKeywords(input.userGoal, input.commands),
      paramsSchema,
      executionFlowTemplateIds: [],
      executionFlow: [
        {
          id: 'step_browser_recording_execute',
          name: '执行录制脚本',
          type: 'tool',
          tool: { name: 'browser_step' },
          config: {
            executionMode: 'recording_script',
            parameterMode: 'collected_only',
            executionPlan: {
              backend: input.backend,
              runtimeSessionId: input.runtimeSessionId,
              commands: input.commands,
              ...(input.templateSteps ? { templateSteps: input.templateSteps } : {}),
            },
          },
        },
      ],
      ...(input.loopPlanPreview ? { loopPlanPreview: input.loopPlanPreview } : {}),
      tools: ['skill_match', 'browser_step'],
      apiEndpoints: {
        runtimeMetadata: {
          sourceType: 'browser_recording',
          goal: input.userGoal,
          expectedResult: '按录制脚本完成浏览器任务，并返回页面状态与执行结果',
          outputParams: Object.fromEntries(
            input.outputs.map((output) => [
              output.name,
              {
                description: output.description,
                location: output.location,
              },
            ])
          ),
          matchSummary: `该技能用于完成录制得到的浏览器任务: ${input.userGoal}`,
          paramCollectionGuidance:
            input.parameters.length > 0
              ? `调用前需要先收集参数: ${input.parameters.map((item) => item.name).join('、')}`
              : '该技能无需额外参数，可直接调用。',
          validationRules: '聊天窗口只允许解析参数，不允许改写 executionPlan 中的固定浏览器步骤。',
          executionPlanVersion: BROWSER_RECORDING_EXECUTION_PLAN_VERSION,
          executionPlan,
          trace: executionPlan.trace,
          ...(input.templateSteps ? { templateSteps: input.templateSteps } : {}),
          ...(input.loopDraft ? { loopDraft: input.loopDraft } : {}),
          ...(input.loopPlanPreview ? { loopPlanPreview: input.loopPlanPreview } : {}),
          usageMode: 'parameter_only_skill',
        },
      },
    };
  }

  buildLoopPlanPreview(
    loopDraft?: RecorderLoopDraftState
  ): Array<Record<string, unknown>> | undefined {
    if (!loopDraft) {
      return undefined;
    }

    const preview: Array<Record<string, unknown>> = [
      {
        id: 'loop_target',
        type: 'loop_target',
        config: {
          scope: loopDraft.target.scope,
          ...(loopDraft.target.regionId ? { regionId: loopDraft.target.regionId } : {}),
          ...(loopDraft.target.currentPageUrl
            ? { currentPageUrl: loopDraft.target.currentPageUrl }
            : {}),
          ...(loopDraft.target.match ? { match: loopDraft.target.match } : {}),
        },
      },
    ];

    if (loopDraft.eachIteration) {
      preview.push({
        id: 'loop_each_iteration',
        type: 'loop_each_iteration',
        config: {
          stepIds: loopDraft.eachIteration.stepIds,
          stepCount: loopDraft.eachIteration.stepCount,
          ...(typeof loopDraft.eachIteration.capturedFromIndex === 'number'
            ? { capturedFromIndex: loopDraft.eachIteration.capturedFromIndex }
            : {}),
          ...(typeof loopDraft.eachIteration.capturedToIndex === 'number'
            ? { capturedToIndex: loopDraft.eachIteration.capturedToIndex }
            : {}),
        },
      });
    }

    if (loopDraft.stopWhen) {
      preview.push({
        id: 'loop_stop_when',
        type: 'loop_stop_when',
        config: {
          read: loopDraft.stopWhen.read,
          conditionFn: loopDraft.stopWhen.conditionFn,
          description: loopDraft.stopWhen.description,
        },
      });
    }

    preview.push({
      id: 'loop_policy',
      type: 'loop_policy',
      config: {
        onNoProgress: loopDraft.onNoProgress || 'takeover',
        maxIterations: loopDraft.maxIterations || 100,
      },
    });

    return preview;
  }

  buildSkillName(userGoal: string): string {
    const base = userGoal
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    return base ? `browser_recording_${base}` : 'browser_recording_generated_skill';
  }

  buildTriggerKeywords(userGoal: string, commands: BrowserCommand[]): string[] {
    const keywords = new Set<string>();
    const normalizedGoal = userGoal.trim();
    if (normalizedGoal) {
      keywords.add(normalizedGoal);
      normalizedGoal
        .split(/[\s,，。；;]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 5)
        .forEach((item) => keywords.add(item));
    }

    commands.forEach((command) => {
      if (command.tool === 'navigate' && typeof command.params.url === 'string') {
        keywords.add('打开页面');
      }
      if (command.tool === 'search' || command.tool === 'smart_search') {
        keywords.add('搜索');
      }
      if (command.tool === 'click_result') {
        keywords.add('点击结果');
      }
    });

    return [...keywords].slice(0, 8);
  }

  buildFallbackExportMetadata(
    userGoal: string,
    commands: BrowserCommand[],
    parameters: ExportParameterLike[]
  ): ExportMetadataLike {
    const hasLogin =
      parameters.some((item) => /用户名|密码/.test(item.description)) ||
      commands.some((command) => command.tool === 'fill') ||
      /登录|signin|log in/i.test(userGoal);
    const executionEntryText = commands.find(
      (command) => command.tool === 'click' && typeof command.params.text === 'string'
    )?.params.text;
    const entryName =
      typeof executionEntryText === 'string' && executionEntryText.trim()
        ? executionEntryText.trim()
        : '目标页面';

    const name = hasLogin
      ? `登录并进入${entryName}`
      : this.buildSkillName(userGoal).replace(/^browser_recording_/, '') || '浏览器任务执行';
    const parameterSummary =
      parameters.length > 0
        ? `关键参数包括${parameters.map((item) => item.description).join('、')}。`
        : '当前流程无需额外参数。';

    return {
      name: name.slice(0, 255),
      description: `自动完成${userGoal}。${parameterSummary}`.slice(0, 1000),
    };
  }

  private inferSchemaTypeFromParameter(name: string): 'string' | 'number' | 'date' | 'boolean' {
    if (/index|count|size|amount|duration|threshold|rate|margin/i.test(name)) {
      return 'number';
    }
    if (/date|time/i.test(name)) {
      return 'date';
    }
    if (/enabled|checked|flag|bool/i.test(name)) {
      return 'boolean';
    }
    return 'string';
  }

  private coerceSchemaDefault(
    value: string,
    type: 'string' | 'number' | 'date' | 'boolean'
  ): string | number | boolean {
    if (type === 'number') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : value;
    }
    if (type === 'boolean') {
      return /^(true|1|yes)$/i.test(value);
    }
    return value;
  }
}
