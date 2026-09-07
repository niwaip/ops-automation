import type {
  TemplateStepAction,
  TemplateStepExecutionPolicy,
} from '@/api/template';
import type { BranchStepSpec } from '@/features/recorder/lib/branch-analysis.api';
import type {
  BackendTemplateStepDraft,
  BackendTemplateStepPayload,
  MCPCommand,
  RecorderDebugExportArtifacts,
  TemplateStep,
} from './AIControls.types';
import { normalizeTemplateStepExecutionPolicy } from './AIControls.utils';

export const appendTemplateScreenshotSteps = (
  steps: BackendTemplateStepDraft[],
  autoAppendScreenshots: boolean,
  waitDuration: number
): BackendTemplateStepPayload[] => {
  const backendSteps: BackendTemplateStepPayload[] = [];
  let stepCounter = 1;

  steps.forEach((step) => {
    backendSteps.push({
      step_id: `step_${stepCounter}`,
      action: step.action,
      params: step.params,
      locator: step.locator,
      output_var: step.output_var,
      branch: step.branch,
      description: step.description,
      execution_policy: step.execution_policy,
    });
    stepCounter++;

    if (!autoAppendScreenshots) {
      return;
    }

    backendSteps.push({
      step_id: `step_${stepCounter}`,
      action: 'wait',
      params: { duration: waitDuration * 1000 },
    });
    stepCounter++;

    backendSteps.push({
      step_id: `step_${stepCounter}`,
      action: 'screenshot',
      params: {},
    });
    stepCounter++;

    backendSteps.push({
      step_id: `step_${stepCounter}`,
      action: 'wait',
      params: { duration: waitDuration * 1000 },
    });
    stepCounter++;
  });

  return backendSteps;
};

export const buildBranchTemplateSteps = (spec: BranchStepSpec): TemplateStep[] => {
  const timestamp = new Date();
  const stepSeed = Date.now();
  const primarySelector = spec.readSelectors[0] || 'body';

  return [
    {
      id: `${stepSeed}-read-value`,
      tool: 'read_value',
      params: {
        selector: primarySelector,
        method: spec.readMethod,
      },
      description: `读取条件值：${spec.description}`,
      timestamp,
      output_var: spec.outputVar,
      execution_policy: 'auto_execute',
    },
    {
      id: `${stepSeed}-branch`,
      tool: 'branch',
      params: {},
      description: `条件分歧：${spec.description}`,
      timestamp,
      branch: {
        condition_fn: spec.conditionFn,
        on_match: spec.onMatch,
        on_mismatch: spec.onMismatch,
        takeover_reason: spec.takeoverReason,
        description: spec.description,
      },
      execution_policy: 'auto_execute',
    },
  ];
};

export const buildBackendCoreSteps = (
  steps: TemplateStep[],
  extractedParams: Record<
    string,
    { type: string; description: string; default?: string | number; replaceable?: boolean }
  >,
  resolveParamName: (
    originalName: string,
    schema: {
      type: string;
      description: string;
      default?: string | number;
      replaceable?: boolean;
    }
  ) => string | undefined
): BackendTemplateStepDraft[] => {
  return steps.map((step) => {
    const substitutedParams = { ...step.params };

    Object.entries(extractedParams).forEach(([originalName, schema]) => {
      if (!schema.replaceable) {
        return;
      }
      const resolvedName = resolveParamName(originalName, schema);
      if (!resolvedName || schema.default === undefined) {
        return;
      }
      Object.keys(substitutedParams).forEach((key) => {
        if (substitutedParams[key] === schema.default) {
          substitutedParams[key] = `\${${resolvedName}}`;
        }
      });
    });

    const selector = typeof step.params.selector === 'string' ? step.params.selector : undefined;
    const backendStep: BackendTemplateStepDraft = {
      action: step.tool,
      ...(Object.keys(substitutedParams).length > 0
        ? { params: substitutedParams as Record<string, string | number> }
        : {}),
      ...(selector
        ? {
            locator: {
              type: 'css',
              value: selector,
            },
          }
        : {}),
      ...(step.output_var ? { output_var: step.output_var } : {}),
      ...(step.branch ? { branch: step.branch } : {}),
      ...(step.description ? { description: step.description } : {}),
      ...(step.execution_policy ? { execution_policy: step.execution_policy } : {}),
    };

    return backendStep;
  });
};

// Extract parameters from template steps for later replacement
export const extractParameters = (
  steps: TemplateStep[]
): Record<
  string,
  { type: string; description: string; default?: string | number; replaceable?: boolean }
> => {
  const params: Record<
    string,
    { type: string; description: string; default?: string | number; replaceable?: boolean }
  > = {};

  steps.forEach((step, index) => {
    const stepPrefix = `step${index + 1}`;
    const replaceableParams = step.replaceableParams || {};

    switch (step.tool) {
      case 'navigate':
        // Extract URL as parameter
        if (step.params.url) {
          params[`${stepPrefix}_url`] = {
            type: 'string',
            description: `步骤${index + 1}导航URL`,
            default: step.params.url as string,
            replaceable: replaceableParams['url'] || false,
          };
        }
        break;

      case 'fill':
        // Extract input value as parameter
        if (step.params.value) {
          params[`${stepPrefix}_value`] = {
            type: 'string',
            description: `步骤${index + 1}输入内容`,
            default: step.params.value as string,
            replaceable: replaceableParams['value'] || false,
          };
        }
        // Extract selector as parameter (optional)
        if (step.params.selector) {
          params[`${stepPrefix}_selector`] = {
            type: 'string',
            description: `步骤${index + 1}目标选择器`,
            default: step.params.selector as string,
            replaceable: replaceableParams['selector'] || false,
          };
        }
        break;

      case 'click':
        // Extract click target selector as parameter (optional)
        if (step.params.selector) {
          params[`${stepPrefix}_selector`] = {
            type: 'string',
            description: `步骤${index + 1}点击目标选择器`,
            default: step.params.selector as string,
            replaceable: replaceableParams['selector'] || false,
          };
        }
        if (step.params.text) {
          params[`${stepPrefix}_text`] = {
            type: 'string',
            description: `步骤${index + 1}点击目标文本`,
            default: step.params.text as string,
            replaceable: replaceableParams['text'] || false,
          };
        }
        break;

      case 'type_text':
        if (step.params.text) {
          params[`${stepPrefix}_text`] = {
            type: 'string',
            description: `步骤${index + 1}输入文本`,
            default: step.params.text as string,
            replaceable: replaceableParams['text'] || false,
          };
        }
        break;

      case 'wait':
        if (step.params.duration) {
          params[`${stepPrefix}_duration`] = {
            type: 'number',
            description: `步骤${index + 1}等待时间(ms)`,
            default: step.params.duration as number,
            replaceable: replaceableParams['duration'] || false,
          };
        }
        break;

      case 'scroll':
        if (step.params.amount) {
          params[`${stepPrefix}_amount`] = {
            type: 'number',
            description: `步骤${index + 1}滚动距离`,
            default: step.params.amount as number,
            replaceable: replaceableParams['amount'] || false,
          };
        }
        break;

      case 'search':
      case 'smart_search':
        // Extract search query as parameter
        if (step.params.query) {
          params[`${stepPrefix}_query`] = {
            type: 'string',
            description: `步骤${index + 1}搜索关键词`,
            default: step.params.query as string,
            replaceable: replaceableParams['query'] || false,
          };
        }
        // Extract input selector as parameter (optional)
        if (step.params.input_selector) {
          params[`${stepPrefix}_input_selector`] = {
            type: 'string',
            description: `步骤${index + 1}搜索输入框选择器`,
            default: step.params.input_selector as string,
            replaceable: replaceableParams['input_selector'] || false,
          };
        }
        break;
    }
  });

  return params;
};

// Generate executable script from template steps with parameterized variables
export const generateScript = (
  steps: TemplateStep[],
  params: Record<
    string,
    { type: string; description: string; default?: string | number; replaceable?: boolean }
  > = {}
): string => {
  const lines: string[] = [
    '// Auto-generated browser automation script',
    '// Generated at: ' + new Date().toISOString(),
    '',
    'const { chromium } = require("playwright");',
    '',
    '// === CONFIGURABLE PARAMETERS ===',
    '// You can modify these values before running the script',
  ];

  // Add parameter definitions with special marking for replaceable ones
  Object.entries(params).forEach(([key, param]) => {
    const defaultValue = param.type === 'number' ? param.default : `'${param.default}'`;
    // 添加可替换标记的特别注释
    if (param.replaceable) {
      lines.push(`// ⚠️ [可替换参数] ${param.description} - AI执行时可根据用户输入自动替换`);
    } else {
      lines.push(`// ${param.description}`);
    }
    lines.push(`const ${key} = process.env.${key.toUpperCase()} || ${defaultValue};`);
  });

  lines.push(
    '',
    'async function run() {',
    '  const browser = await chromium.launch({ headless: false });',
    '  const page = await browser.newPage();',
    ''
  );

  steps.forEach((step, index) => {
    const stepPrefix = `step${index + 1}`;
    lines.push(`  // Step ${index + 1}: ${step.description}`);

    switch (step.tool) {
      case 'navigate':
        lines.push(`  await page.goto(${stepPrefix}_url);`);
        break;

      case 'fill':
        lines.push(
          `  await page.fill(${stepPrefix}_selector || '${step.params.selector}', ${stepPrefix}_value);`
        );
        break;

      case 'click':
        if (step.params.selector) {
          lines.push(
            `  await page.click(${stepPrefix}_selector || '${step.params.selector}');`
          );
        } else if (step.params.text) {
          lines.push(`  await page.click(\`text=\${${stepPrefix}_text}\`);`);
        }
        break;

      case 'type_text':
        lines.push(`  await page.keyboard.type(${stepPrefix}_text);`);
        break;

      case 'press_key':
        lines.push(`  await page.keyboard.press('${step.params.key}');`);
        break;

      case 'wait':
        lines.push(`  await page.waitForTimeout(${stepPrefix}_duration);`);
        break;

      case 'screenshot':
        lines.push(
          `  await page.screenshot({ path: 'screenshot_${Date.now()}.png' });`
        );
        break;

      case 'scroll':
        lines.push(
          `  await page.mouse.wheel(0, ${stepPrefix}_amount || ${step.params.amount});`
        );
        break;

      case 'search':
      case 'smart_search':
        lines.push(`  // Search operation`);
        lines.push(
          `  await page.fill(${stepPrefix}_input_selector || '${step.params.input_selector}', ${stepPrefix}_query);`
        );
        lines.push(`  await page.keyboard.press('Enter');`);
        break;

      default:
        lines.push(`  // Unhandled step: ${step.tool}`);
    }

    lines.push('  await page.waitForTimeout(1000);', '');
  });

  lines.push(
    '  await browser.close();',
    '}',
    '',
    'run().catch(console.error);'
  );

  return lines.join('\n');
};

export const buildTemplateDescriptionFromArtifacts = (
  artifacts: RecorderDebugExportArtifacts
): string => {
  return (
    artifacts.skillDraft?.publishPayload?.description ||
    artifacts.skillDraft?.description ||
    artifacts.guidance ||
    '由录制流程自动生成的浏览器执行模板'
  );
};

export const buildTemplateNameFromArtifacts = (
  artifacts: RecorderDebugExportArtifacts
): string => {
  const rawName =
    artifacts.skillDraft?.publishPayload?.name ||
    artifacts.skillDraft?.name ||
    `recorder-export-${Date.now()}`;
  return rawName.slice(0, 255);
};

export const mapRuntimeLocatorType = (strategy: string): string | undefined => {
  switch (strategy) {
    case 'ref':
      return 'ref';
    case 'role':
      return 'role';
    case 'text':
    case 'label':
    case 'placeholder':
      return 'text';
    case 'testid':
      return 'test-id';
    case 'css':
      return 'css';
    default:
      return undefined;
  }
};

export const buildTemplateLocatorValue = (
  locator: NonNullable<MCPCommand['locator']>
): string => {
  if (locator.strategy === 'role' && locator.role && locator.name) {
    const escapedName = locator.name.replace(/"/g, '\\"');
    return `${locator.role}[name="${escapedName}"]`;
  }

  return locator.value || '';
};

export const inferLocatorTypeFromValue = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('xpath=')) {
    return 'xpath';
  }
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('.') ||
    trimmed.startsWith('[') ||
    trimmed.includes('>') ||
    trimmed.includes(':')
  ) {
    return 'css';
  }
  return 'text';
};

export const inferTemplateLocatorFromCommand = (
  command: MCPCommand
): { type: string; value: string } | undefined => {
  const runtimeLocator = command.locator;
  if (runtimeLocator?.value && runtimeLocator.strategy) {
    const mappedType = mapRuntimeLocatorType(runtimeLocator.strategy);
    if (mappedType) {
      return {
        type: mappedType,
        value: buildTemplateLocatorValue(runtimeLocator),
      };
    }
  }

  const params = command.params || {};
  const candidate =
    typeof params.selector === 'string'
      ? params.selector
      : typeof params.text === 'string'
        ? params.text
        : typeof params.target === 'string' && !/^e\d+$/i.test(params.target)
          ? params.target
          : undefined;

  if (!candidate || !['click', 'fill', 'select', 'check'].includes(command.tool)) {
    return undefined;
  }

  return {
    type: inferLocatorTypeFromValue(candidate),
    value: candidate,
  };
};

export const buildTemplateStepsFromArtifacts = (
  artifacts: RecorderDebugExportArtifacts
): Array<{
  step_id: string;
  action: TemplateStepAction;
  locator?: { type: string; value: string; fallback?: { type: string; value: string } };
  params?: Record<string, string | number>;
  output_var?: string;
  branch?: TemplateStep['branch'];
  description?: string;
  execution_policy?: TemplateStepExecutionPolicy;
}> => {
  if (artifacts.templateSteps && artifacts.templateSteps.length > 0) {
    return artifacts.templateSteps.map((step) => ({
      ...step,
      execution_policy: normalizeTemplateStepExecutionPolicy(step.execution_policy),
    }));
  }

  const parameterSources = new Map<string, string>();
  (artifacts.skillDraft?.parameters || []).forEach((parameter) => {
    if (parameter.source) {
      parameterSources.set(parameter.source, parameter.name);
    }
  });

  const coreSteps = (artifacts.skillDraft?.executionPlan?.commands || []).map(
    (command, commandIndex) => {
      const rawParams = Object.fromEntries(
        Object.entries(command.params || {}).filter(([, value]) =>
          ['string', 'number'].includes(typeof value)
        )
      ) as Record<string, string | number>;
      const locator = inferTemplateLocatorFromCommand(command);
      const locatorParamKeys = new Set(['selector', 'target', 'text']);

      const substitutedEntries = Object.entries(rawParams)
        .map(([key, value]) => {
          const parameterName =
            parameterSources.get(`command.${commandIndex}.${key}`) ||
            parameterSources.get(`${command.tool}.${key}`);
          if (!parameterName) {
            return [key, value];
          }
          return [key, `\${${parameterName}}`];
        })
        .filter(
          (entry): entry is [string, string | number] => !locatorParamKeys.has(String(entry[0]))
        );

      const normalizedParams = Object.fromEntries(substitutedEntries) as Record<
        string,
        string | number
      >;

      return {
        step_id: `step_${commandIndex + 1}`,
        action: command.tool as TemplateStepAction,
        ...(locator ? { locator } : {}),
        ...(Object.keys(normalizedParams).length > 0 ? { params: normalizedParams } : {}),
        description: command.description,
        execution_policy: 'auto_execute' as const,
      };
    }
  );

  return coreSteps;
};

export const buildTemplateParamsSchemaFromArtifacts = (
  artifacts: RecorderDebugExportArtifacts
) => {
  const publishSchema = artifacts.skillDraft?.publishPayload?.paramsSchema;
  if (publishSchema?.properties) {
    return {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(publishSchema.properties).map(([key, value]) => [
          key,
          {
            type: value.type,
            description: value.description,
            default: value.default,
            required: value.required,
          },
        ])
      ),
      required: publishSchema.required || [],
    };
  }

  return {
    type: 'object' as const,
    properties: Object.fromEntries(
      (artifacts.skillDraft?.parameters || []).map((parameter) => [
        parameter.name,
        {
          type: 'string',
          description: parameter.description,
          default: parameter.exampleValue,
          required: parameter.required,
        },
      ])
    ),
    required: (artifacts.skillDraft?.parameters || [])
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name),
  };
};
