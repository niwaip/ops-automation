import { STRUCTURED_TRANSFORM_STEP_CONFIG_KEY } from './builtin-activity.registry';
import type {
  AiDraftActivityResource,
  AiWorkflowDraftPlan,
} from './temporal-workflow-draft.service';

type PickFirstNonEmptyString = (...values: unknown[]) => string | undefined;

export function formatActivityResources(
  activityResources: AiDraftActivityResource[]
): string {
  const builtin = activityResources.filter((item) => item.ref.startsWith('builtin:'));
  const custom = activityResources.filter((item) => !item.ref.startsWith('builtin:'));

  const formatList = (list: AiDraftActivityResource[]) =>
    JSON.stringify(
      list.map((item) => ({
        ref: item.ref,
        name: item.name,
        fn: item.fn,
        timeout: item.timeout,
        handler: item.handler,
        description: item.description || '',
      })),
      null,
      2
    );

  return [
    '# Builtin Activities（系统内置，优先使用）：',
    formatList(builtin),
    ...(custom.length > 0
      ? ['# Custom Activities（仅当明显依赖时使用）：', formatList(custom.slice(0, 25))]
      : []),
  ].join('\n');
}

export function buildAnalyzeAiWorkflowDraftPrompt(args: {
  description: string;
  referenceUrl: string;
  referenceExcerpt: string;
  activityResources: AiDraftActivityResource[];
  skillFileContent?: string;
  skillFileType?: string;
}): string {
  const { description, referenceUrl, referenceExcerpt, activityResources, skillFileContent, skillFileType } = args;

  return [
    '【区域 A: ROLE & CONSTRAINTS】',
    '你是一个企业级 Temporal Workflow 草稿生成器。',
    '你的职责是根据用户说明、技能文件和参考资料，生成一个“可编辑、可审计、受控”的 Workflow 草稿 JSON。',
    '硬性规则：',
    '1. 只能从系统给出的 activity 资源中选择，不能发明新的 activityRef。',
    '2. 必须只输出 Workflow 草稿 JSON，不要输出 Markdown 标记（```json）或任何解释文字。',
    '3. 默认优先选择 builtin activity；只有当用户目标明显依赖现有 custom activity 时才使用 custom。',
    '4. 【HTTP 提取规则】：如果提供了参考 URL（如 https://wttr.in/shanghai?format=j1），必须将其分解：',
    '   - 协议与域名部分存入 urlTemplate (如 https://wttr.in/shanghai)',
    '   - 查询参数部分存入 queryTemplate (如 { "format": "j1" })',
    '   - 严禁将参考 URL 整体塞入 urlTemplate 而忽略 queryTemplate。',
    '   - 严禁在 urlTemplate 或 queryTemplate 中包含 Markdown 反引号 (`) 或多余空格。',
    '5. 【参数化与声明规则】：只有动态输入才在 template 中使用 {param} 占位符。常量作为常量存入 config。workflow.inputParams 声明运行时输入。如果步骤模板出现了 {param} 占位符，inputParams 必须补齐定义。',
    '6. 不要生成 script 执行代码，不要包含 shell 命令。',
    '7. workflowClassName 使用 Python 类名风格，以 Workflow 结尾。taskQueue 默认使用 SKILL_TASK_QUEUE。',
    '8. documentRender 只用于 Office 模版渲染，不能用于通用数据提取。提取转换优先使用 builtin:structuredTransform。AI 理解/分类才使用 builtin:aiStructuredTransform。',
    '',
    '【区域 B: CONTEXT】',
    formatActivityResources(activityResources),
    '',
    '结构化转换(builtin:structuredTransform)配置示范：',
    JSON.stringify(
      {
        contentType: 'json',
        contentTemplate: '{content}',
        outputMode: 'json',
        outputSchema: { fieldName: 'string' },
        contextTemplate: '',
        fieldMappings: { fieldName: 'source.path' },
        textTemplate: '',
      },
      null,
      2
    ),
    '',
    '【区域 C: OBJECTIVE】',
    skillFileContent
      ? `【技能文件内容（优先参考）(${skillFileType || 'yaml/json'}】\n${skillFileContent.slice(0, 4000)}\n\n【用户补充说明（可覆盖文件设定）】`
      : '【用户目标说明】',
    description || '（无额外补充说明，完全按照技能文件或参考内容处理）',
    `参考 URL: ${referenceUrl || '无'}`,
    `参考内容摘录（可能截断）: ${referenceExcerpt || '无'}`,
    '',
    '【区域 D: OUTPUT SPEC】',
    '必须直接返回符合以下 Schema 的 JSON 对象：',
    JSON.stringify(
      {
        workflowName: 'string',
        workflowDescription: 'string',
        workflowClassName: 'string',
        workflowDefnName: 'string',
        taskQueue: 'SKILL_TASK_QUEUE',
        inputParams: {
          exampleParam: {
            description: '参数说明',
            required: true,
            defaultValue: '',
            source: 'declared',
            type: 'string',
            exampleValue: 'sample_exampleParam',
          },
        },
        outputParams: {
          result: {
            description: '输出说明',
            sourceStep: 'step_1',
          },
        },
        extraPrompt: '给后续 AI 代码生成的补充说明',
        warnings: ['可选风险提示'],
        steps: [
          {
            id: 'step_1',
            name: '步骤名称',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'HTTP 请求',
            startToCloseTimeout: '30s',
            input: {
              __httpRequest: {
                method: 'GET',
                urlTemplate: 'https://example.com',
                queryTemplate: {},
                headersTemplate: {},
                jsonTemplate: {},
                dataTemplate: {},
                timeout: 30,
                responseMode: 'body',
                responseBodyPath: '',
                responseFieldMappings: {},
              },
            },
          },
        ],
        activities: [
          {
            activityRef: 'builtin:httpRequest',
            name: 'HTTP 请求',
            timeout: '30s',
            retryPolicy: { maxRetries: 2, backoffMs: 1000 },
            config: {},
          },
        ],
      },
      null,
      2
    ),
  ].join('\n');
}

export function buildRepairAiWorkflowDraftPlanPrompt(args: {
  currentPlan: AiWorkflowDraftPlan;
  issues: string[];
  description: string;
  referenceUrl: string;
  referenceExcerpt: string;
  activityResources: AiDraftActivityResource[];
}): string {
  const { currentPlan, issues, description, referenceUrl, referenceExcerpt, activityResources } =
    args;
  return [
    '【区域 A: ROLE & CONSTRAINTS】',
    '你是一个 Temporal Workflow 草稿修复器。',
    '你的任务不是重写需求，而是根据问题清单修复当前草稿 JSON，使其变成一个可直接进入下一步代码生成的完整 Workflow 草稿。',
    '请使用 ReAct 风格在脑中逐项核对，但最终只输出修复后的 JSON 对象，不要输出思考过程、Markdown 或解释。',
    '硬性要求：',
    '1. 只输出一个 JSON 对象。',
    '2. 不允许删除已有的有效步骤，除非该步骤明显错误且必须替换。',
    '3. 如果存在 builtin:httpRequest，必须确保 __httpRequest 完整，且 query 参数放入 queryTemplate。',
    '4. 如果存在 builtin:structuredTransform，必须确保 __structuredTransform 完整，至少包含 contentType、contentTemplate、outputMode、outputSchema、contextTemplate、fieldMappings、textTemplate。',
    '5. builtin:structuredTransform 的 contentTemplate 默认应为 {content}。',
    '6. 如果目标是格式化文本、ASCII、类似 wttr.in 风格，则 builtin:structuredTransform.outputMode 必须为 text，并优先修复为 textTemplate 或 fieldMappings，不要默认改成 AI 转换。',
    '7. 如果目标是结构化 JSON，则 builtin:structuredTransform.outputMode 必须为 json，并提供非空 outputSchema。',
    '8. 如果存在 builtin:aiStructuredTransform，必须确保 __structuredTransform 至少包含 contentType、contentTemplate、instructionTemplate、outputMode、outputSchema、contextTemplate。',
    '9. 继续沿用已经正确的 inputParams/outputParams/steps/activityRef，不要发明新的未注册 activityRef。',
    '',
    '【区域 B: CONTEXT】',
    formatActivityResources(activityResources),
    '',
    '【当前草稿】',
    JSON.stringify(currentPlan, null, 2),
    '',
    '【问题清单（必须逐条修复）】',
    ...issues.map((item, index) => `${index + 1}. ${item}`),
    '',
    `【参考 URL】${referenceUrl || '无'}`,
    `【参考内容摘录】${referenceExcerpt || '无'}`,
    '',
    '【区域 C: OBJECTIVE】',
    '【用户目标】',
    description || '无',
    '',
    '【区域 D: OUTPUT SPEC】',
    '必须直接返回修复后的 Workflow 草稿 JSON 对象，结构与 analyze prompt 的 OUTPUT SPEC 一致（workflowName / workflowDescription / workflowClassName / workflowDefnName / taskQueue / inputParams / outputParams / extraPrompt / warnings / steps / activities）。',
    '严禁输出 Markdown 标记（```json）或任何解释文字。',
  ].join('\n');
}

export function buildAnalyzeAiWorkflowRefinementPrompt(args: {
  currentWorkflowDsl: unknown;
  userPrompt: string;
  activityResources: AiDraftActivityResource[];
}): string {
  const { currentWorkflowDsl, userPrompt, activityResources } = args;
  const dsl =
    currentWorkflowDsl && typeof currentWorkflowDsl === 'object'
      ? (currentWorkflowDsl as Record<string, any>)
      : {};
  const rawSteps = Array.isArray(dsl.steps) ? dsl.steps : [];
  const stepSummary = {
    name: dsl.name,
    inputParams: dsl.inputParams,
    outputParams: dsl.outputParams,
    steps: rawSteps.map((step: any, index: number) => ({
      id: step?.id || `step_${index + 1}`,
      name: step?.name,
      activityRef: step?.activityRef,
    })),
  };
  return [
    '【区域 A: ROLE & CONSTRAINTS】',
    '你是一个 Temporal Python 开发专家，负责改进现有的 Workflow DSL 设计。',
    '请根据用户提出的改进要求，对当前的工作流步骤、参数定义、输出映射进行调整。',
    '输出要求：',
    '1. 只返回一个 JSON 对象，不要输出 Markdown 或任何解释。',
    '2. JSON 结构必须符合 AiWorkflowDraftPlan 接口：',
    '   {',
    '     “workflowName”: “中文名称”,',
    '     “workflowDescription”: “描述”,',
    '     “workflowClassName”: “Python类名”,',
    '     “workflowDefnName”: “Temporal显示名”,',
    '     “taskQueue”: “队列名”,',
    '     “steps”: [{ “id”: “step_1”, “name”: “步骤名”, “type”: “activity”, “activityRef”: “builtin:...”, “input”: { ... } }],',
    '     “inputParams”: { “paramName”: { “description”: “描述”, “required”: true, “defaultValue”: “”, “source”: “declared”, “type”: “string”, “exampleValue”: “sample_value” } },',
    '     “outputParams”: { “result”: { “description”: “描述”, “sourceStep”: “step_1” } },',
    '     “activities”: [{ “activityRef”: “...”, “config”: { ... } }],',
    '     “warnings”: [“注意点1”]',
    '   }',
    '3. 必须确保 activityRef 在资源池中存在。',
    '4. 如果涉及 HTTP 请求，必须将配置放在 input 的 “__httpRequest” 字段下，并遵循分解规则：域名归 urlTemplate，参数归 queryTemplate。',
    '5. 如果涉及结构化转换，必须将配置放在 input 的 “__structuredTransform” 字段下。',
    '6. `__httpRequest` 和 `__structuredTransform` 是步骤内部配置，不允许写入 workflow 级别的 inputParams，也不允许暴露为 workflow runtime 参数。',
    '6.1 inputParams 可以携带 source/type/exampleValue 元数据；如果步骤模板中存在未声明的 {param} 占位符，必须补齐参数定义，且不得把占位符改写成字面量。',
    '7. 严禁在模板字段中包含 Markdown 反引号 (`) 或多余空格。',
    '8. 如果某一步使用 builtin:structuredTransform，必须完整输出 contentType、contentTemplate、outputMode、outputSchema、contextTemplate、fieldMappings、textTemplate；其中 contentTemplate 默认为 {content}。',
    '9. 如果用户要求”格式化输出””ASCII 文本””类似 wttr.in”，builtin:structuredTransform.outputMode 必须为 text，并优先产出 textTemplate。',
    '10. 只有在用户明确要求 AI 语义理解、摘要、归纳、模糊分类或难以用固定规则表达时，才使用 builtin:aiStructuredTransform，此时必须输出 instructionTemplate。',
    '',
    '【区域 B: CONTEXT】',
    formatActivityResources(activityResources),
    '',
    '【当前 Workflow 摘要】',
    JSON.stringify(stepSummary, null, 2),
    '',
    '【区域 C: OBJECTIVE】',
    '【改进要求】',
    userPrompt,
    '',
    '【区域 D: OUTPUT SPEC】',
    '必须直接返回 AiWorkflowDraftPlan 形状的 JSON 对象（结构同上方输出要求所列）。',
    '严禁输出 Markdown 标记（```json）或任何解释文字。',
  ].join('\n');
}

export function buildAiDraftStepSampleKey(
  _step: NonNullable<AiWorkflowDraftPlan['steps']>[number] | undefined,
  index: number,
  _pickFirstNonEmptyString: PickFirstNonEmptyString
): string {
  // Use index-only key to avoid stepId collisions overwriting samples
  // when two steps happen to share the same (possibly empty) id.
  return `step_${index + 1}`;
}


export function buildStructuredTransformPlaceholderKeys(
  sampleInputs: Record<string, any>,
  ...configs: Array<Record<string, any> | undefined>
): Set<string> {
  const placeholderKeys = new Set<string>(['content', ...Object.keys(sampleInputs || {})]);
  configs.forEach((config) => {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return;
    }
    const fieldMappings =
      config.fieldMappings &&
      typeof config.fieldMappings === 'object' &&
      !Array.isArray(config.fieldMappings)
        ? (config.fieldMappings as Record<string, any>)
        : {};
    const outputSchema =
      config.outputSchema &&
      typeof config.outputSchema === 'object' &&
      !Array.isArray(config.outputSchema)
        ? (config.outputSchema as Record<string, any>)
        : {};
    Object.keys(fieldMappings).forEach((key) => placeholderKeys.add(String(key || '').trim()));
    Object.keys(outputSchema).forEach((key) => placeholderKeys.add(String(key || '').trim()));
  });
  return placeholderKeys;
}

export function buildAiDraftResolutionGoal(args: {
  plan: AiWorkflowDraftPlan;
  currentStep: NonNullable<AiWorkflowDraftPlan['steps']>[number] | undefined;
  previousStep: NonNullable<AiWorkflowDraftPlan['steps']>[number] | undefined;
  description: string;
  pickFirstNonEmptyString: PickFirstNonEmptyString;
}): string {
  const { plan, currentStep, previousStep, description, pickFirstNonEmptyString } = args;
  const currentInput =
    currentStep?.input && typeof currentStep.input === 'object' && !Array.isArray(currentStep.input)
      ? (currentStep.input as Record<string, any>)
      : {};
  const transformConfig =
    currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] &&
    typeof currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object'
      ? (currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>)
      : {};
  const outputHints = Object.entries(plan.outputParams || {})
    .filter(([, value]) => value?.sourceStep === currentStep?.id)
    .map(([key, value]) => `${key}: ${pickFirstNonEmptyString(value?.description) || '输出字段'}`);

  return [
    description,
    pickFirstNonEmptyString(plan.workflowDescription),
    pickFirstNonEmptyString(plan.extraPrompt),
    currentStep?.name ? `当前步骤: ${currentStep.name}` : '',
    previousStep?.name ? `上一步骤: ${previousStep.name}` : '',
    transformConfig.outputMode ? `目标输出模式: ${String(transformConfig.outputMode).trim()}` : '',
    pickFirstNonEmptyString(transformConfig.instructionTemplate)
      ? `已有规则说明: ${pickFirstNonEmptyString(transformConfig.instructionTemplate)}`
      : '',
    pickFirstNonEmptyString(transformConfig.textTemplate)
      ? `已有文本模板: ${pickFirstNonEmptyString(transformConfig.textTemplate)}`
      : '',
    outputHints.length > 0 ? `期望输出:\n${outputHints.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
