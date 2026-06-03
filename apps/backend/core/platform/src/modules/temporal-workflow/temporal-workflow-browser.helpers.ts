import type {
  BrowserDraftCommandInput,
  BrowserScriptCommand,
  BrowserTemplateParamsSchema,
  BrowserTemplateStepInput,
  BrowserWorkflowActivityPhase,
  BrowserWorkflowActivityPhaseGroup,
  BrowserWorkflowActivityStep,
  WorkflowInputParamDefinition,
} from './temporal-workflow.types';

export function normalizeBrowserActivitySteps(steps: unknown): Array<{
  name: string;
  action: string;
  config: Record<string, unknown>;
}> {
  if (!Array.isArray(steps)) {
    return [];
  }

  const normalized = steps.map((step, index) => {
    const stepIndexLabel = `${index + 1}. 浏览器操作`;
    const emptyConfig: Record<string, unknown> = {};
    const normalizedConfig: Record<string, unknown> = {};
    const rawStep = step && typeof step === 'object' ? step as Record<string, unknown> : null;
    const config = rawStep?.config && typeof rawStep.config === 'object'
      ? rawStep.config as Record<string, unknown>
      : emptyConfig;
    const action = String(config.action || '').trim();
    if (!action) {
      return null;
    }
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined) {
        normalizedConfig[key] = value;
      }
    });
    normalizedConfig.action = action;
    return {
      name: String(rawStep?.name || stepIndexLabel).trim() || stepIndexLabel,
      action,
      config: normalizedConfig,
    };
  });

  return normalized.filter((step): step is {
    name: string;
    action: string;
    config: Record<string, unknown>;
  } => step !== null);
}

export function buildBrowserWorkflowActivityPhases(
  steps: BrowserWorkflowActivityStep[],
): BrowserWorkflowActivityPhase[] {
  if (steps.length === 0) {
    return [];
  }

  const groups: BrowserWorkflowActivityPhaseGroup[] = [];
  let currentGroup: BrowserWorkflowActivityPhaseGroup | null = null;
  const pendingObservedSteps: BrowserWorkflowActivityStep[] = [];

  steps.forEach((step) => {
    const phaseType = classifyBrowserWorkflowPhaseType(String(step.config?.action || ''));
    if (phaseType === 'observe') {
      if (currentGroup) {
        currentGroup.steps.push(step);
      } else {
        pendingObservedSteps.push(step);
      }
      return;
    }

    const normalizedPhaseType = phaseType === 'open' ? 'open' : phaseType === 'transition' ? 'transition' : 'process';
    const shouldStartNewGroup = !currentGroup
      || (
        currentGroup.phaseType !== normalizedPhaseType
        && !(currentGroup.phaseType === 'open' && normalizedPhaseType === 'process')
      )
      || (
        normalizedPhaseType === 'open'
        && currentGroup.steps.length > 0
      )
      || normalizedPhaseType === 'transition';

    if (shouldStartNewGroup) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        phaseType: normalizedPhaseType,
        steps: [...pendingObservedSteps, step],
      };
      pendingObservedSteps.length = 0;
      return;
    }

    if (!currentGroup) {
      currentGroup = {
        phaseType: normalizedPhaseType,
        steps: [...pendingObservedSteps, step],
      };
      pendingObservedSteps.length = 0;
      return;
    }

    currentGroup.steps.push(step);
  });

  if (pendingObservedSteps.length > 0) {
    if (currentGroup) {
      const existingGroup = currentGroup as BrowserWorkflowActivityPhaseGroup;
      currentGroup = {
        phaseType: existingGroup.phaseType,
        steps: [...existingGroup.steps, ...pendingObservedSteps],
      };
    } else {
      currentGroup = {
        phaseType: 'process',
        steps: [...pendingObservedSteps],
      };
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  const enrichedGroups = enrichBrowserWorkflowPhaseGroups(groups);

  return enrichedGroups.map((group, index) => ({
    name: buildBrowserWorkflowPhaseName(group.phaseType, index + 1),
    phaseType: group.phaseType,
    timeout: inferBrowserTemplateTimeoutFromSteps(group.steps),
    initializeSession: index === 0,
    cleanupSession: index === enrichedGroups.length - 1,
    steps: group.steps,
  }));
}

function enrichBrowserWorkflowPhaseGroups(
  groups: BrowserWorkflowActivityPhaseGroup[],
): BrowserWorkflowActivityPhaseGroup[] {
  return groups.map((group, index) => {
    if (group.phaseType !== 'open') {
      return group;
    }
    if (group.steps.some((step) => String(step.config?.action || '').trim().toLowerCase() === 'waitforselector')) {
      return {
        phaseType: group.phaseType,
        steps: deduplicateBrowserReadyCheckSteps(group.steps),
      };
    }

    const readyCheckPlacement = buildOpenPhaseReadyCheckStep(
      group,
      groups[index + 1],
    );
    if (!readyCheckPlacement) {
      return group;
    }

    const { step: readyCheckStep, insertAt } = readyCheckPlacement;
    const hasEquivalentReadyCheck = group.steps.some((step) =>
      isSameBrowserReadyCheckStep(step, readyCheckStep),
    );
    if (hasEquivalentReadyCheck) {
      return {
        phaseType: group.phaseType,
        steps: deduplicateBrowserReadyCheckSteps(group.steps),
      };
    }

    return {
      phaseType: group.phaseType,
      steps: deduplicateBrowserReadyCheckSteps([
        ...group.steps.slice(0, insertAt),
        readyCheckStep,
        ...group.steps.slice(insertAt),
      ]),
    };
  });
}

function buildOpenPhaseReadyCheckStep(
  currentGroup: BrowserWorkflowActivityPhaseGroup,
  nextGroup: BrowserWorkflowActivityPhaseGroup | undefined,
): { step: BrowserWorkflowActivityStep; insertAt: number } | null {
  const currentGroupReadyCheck = findBrowserReadyCheckInsertionPoint(currentGroup);
  if (currentGroupReadyCheck?.alreadyExists) {
    return null;
  }
  const selector = currentGroupReadyCheck?.selector || extractBrowserReadySelectorFromGroup(nextGroup);
  if (!selector) {
    return null;
  }

  return {
    step: {
      name: `${(currentGroupReadyCheck?.insertAt ?? currentGroup.steps.length) + 1}. 等待页面可交互`,
      type: 'browser',
      timeout: '30s',
      config: {
        action: 'waitForSelector',
        selector,
        timeoutMs: 15000,
        duration: 15000,
      },
      inputParams: {},
    },
    insertAt: currentGroupReadyCheck?.insertAt ?? currentGroup.steps.length,
  };
}

function findBrowserReadyCheckInsertionPoint(
  group: BrowserWorkflowActivityPhaseGroup,
): { selector: string; insertAt: number; alreadyExists?: boolean } | null {
  for (let index = 0; index < group.steps.length; index += 1) {
    const step = group.steps[index];
    const action = String(step.config?.action || '').trim().toLowerCase();
    if (!['fill', 'type', 'type_text', 'click', 'hover', 'press', 'press_key', 'waitforselector'].includes(action)) {
      continue;
    }

    const selector = extractBrowserReadySelectorFromConfig(step.config);
    if (!selector) {
      continue;
    }

    return {
      selector,
      insertAt: index,
      alreadyExists: action === 'waitforselector',
    };
  }

  return null;
}

function deduplicateBrowserReadyCheckSteps(
  steps: BrowserWorkflowActivityStep[],
): BrowserWorkflowActivityStep[] {
  const seenSelectors = new Set<string>();
  return steps.filter((step) => {
    const action = String(step.config?.action || '').trim().toLowerCase();
    if (action !== 'waitforselector') {
      return true;
    }

    const selector = String(step.config?.selector || '').trim();
    if (!selector) {
      return true;
    }
    if (seenSelectors.has(selector)) {
      return false;
    }
    seenSelectors.add(selector);
    return true;
  });
}

function extractBrowserReadySelectorFromGroup(
  group: BrowserWorkflowActivityPhaseGroup | undefined,
): string | null {
  if (!group) {
    return null;
  }

  for (const step of group.steps) {
    const action = String(step.config?.action || '').trim().toLowerCase();
    if (!['fill', 'type', 'type_text', 'click', 'hover', 'press', 'press_key', 'waitforselector'].includes(action)) {
      continue;
    }

    const selector = extractBrowserReadySelectorFromConfig(step.config);
    if (selector) {
      return selector;
    }
  }

  return null;
}

function extractBrowserReadySelectorFromConfig(
  config: Record<string, unknown> | undefined,
): string | null {
  if (!config) {
    return null;
  }

  const locatorSelector = buildBrowserReadySelectorFromLocator(config.locator);
  if (locatorSelector) {
    return locatorSelector;
  }

  for (const candidate of [config.selector, config.target]) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const normalized = candidate.trim();
    if (!normalized) {
      continue;
    }
    if (isBrowserRuntimeRefSelector(normalized)) {
      continue;
    }
    if (/^https?:\/\//i.test(normalized)) {
      continue;
    }
    return normalized;
  }

  return null;
}

function buildBrowserReadySelectorFromLocator(locator: unknown): string | null {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    return null;
  }

  const locatorRecord = locator as Record<string, unknown>;
  const locatorType = String(locatorRecord.type || '').trim().toLowerCase();
  const locatorValue = String(locatorRecord.value || '').trim();
  if (!locatorValue) {
    return null;
  }

  if (locatorType === 'ref' && isBrowserRuntimeRefSelector(locatorValue)) {
    return null;
  }
  if (locatorType === 'role') {
    return `role=${locatorValue}`;
  }
  if (locatorType === 'text') {
    return `text=${locatorValue}`;
  }
  if (locatorType === 'test-id') {
    return `[data-testid="${locatorValue}"]`;
  }
  if (locatorType === 'xpath') {
    return `xpath=${locatorValue}`;
  }

  return locatorValue;
}

function isBrowserRuntimeRefSelector(value: string): boolean {
  return /^e\d+$/i.test(value.trim());
}

function isSameBrowserReadyCheckStep(
  left: BrowserWorkflowActivityStep,
  right: BrowserWorkflowActivityStep,
): boolean {
  return String(left.config?.action || '').trim().toLowerCase() === String(right.config?.action || '').trim().toLowerCase()
    && String(left.config?.selector || '').trim() === String(right.config?.selector || '').trim();
}

function classifyBrowserWorkflowPhaseType(
  action: string,
): 'open' | 'transition' | 'process' | 'observe' {
  const normalized = String(action || '').trim().toLowerCase();
  if (!normalized) {
    return 'process';
  }
  if ([
    'wait',
    'waitfortimeout',
    'waitforselector',
    'screenshot',
    'snapshot',
    'read_page',
    'get_text',
  ].includes(normalized)) {
    return 'observe';
  }
  if (['goto', 'navigate'].includes(normalized)) {
    return 'open';
  }
  if ([
    'click',
    'search',
    'smart_search',
    'click_result',
    'switch_latest_tab',
    'focus_latest_page',
  ].includes(normalized)) {
    return 'transition';
  }
  return 'process';
}

function buildBrowserWorkflowPhaseName(
  phaseType: 'open' | 'transition' | 'process',
  index: number,
): string {
  switch (phaseType) {
    case 'open':
      return `${index}. 页面打开`;
    case 'transition':
      return `${index}. 页面迁移`;
    case 'process':
    default:
      return `${index}. 页面处理`;
  }
}

export function extractBrowserActivityPlaceholders(steps: Array<{
  config: Record<string, unknown>;
}>): string[] {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      const matches = [
        ...value.matchAll(/\{([^{}]+)\}/g),
        ...value.matchAll(/\$\{([^{}]+)\}/g),
      ];
      matches.forEach((match) => {
        const key = String(match[1] || '').trim();
        if (key) {
          keys.add(key);
        }
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };

  steps.forEach((step) => visit(step.config));
  return Array.from(keys);
}

export function buildBrowserActivityStepsFromDraftCommands(
  commands: BrowserDraftCommandInput[],
): BrowserWorkflowActivityStep[] {
  return commands.map((command, index) => {
    const action = String(command.tool || '').trim();
    const params = command.params && typeof command.params === 'object'
      ? command.params
      : {};
    const config: Record<string, unknown> = {
      action,
    };
    const locator = normalizeBrowserDraftLocator(command.locator);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        config[key] = value;
      }
    });

    if (locator) {
      config.locator = locator;
    }

    return {
      name: `${index + 1}. ${String(command.description || action || '浏览器操作').trim() || '浏览器操作'}`,
      type: 'browser',
      timeout: '30s',
      config,
      inputParams: {},
    };
  });
}

export function buildBrowserActivityStepsFromTemplateSteps(
  steps: BrowserTemplateStepInput[],
): BrowserWorkflowActivityStep[] {
  const pickFirst = (...values: unknown[]): unknown => {
    const found = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
    return found === undefined ? undefined : found;
  };

  return steps.map((step, index) => {
    const action = String(step?.action || '').trim();
    const normalizedAction = action.toLowerCase();
    const selector = normalizeBrowserTemplateStepSelector(step);
    const params = step?.params && typeof step.params === 'object' ? step.params : {};
    const config: Record<string, unknown> = {
      action,
    };

    if (selector) {
      config.selector = selector;
      config.target = selector;
    }

    const url = pickFirst(
      params.url,
      params.targetUrl,
      params.href,
      normalizedAction.includes('goto') || normalizedAction.includes('navigate')
        ? pickFirst(params.target, params.value)
        : undefined,
    );
    if (url !== undefined) {
      config.url = String(url);
      config.target = String(url);
    } else if (!selector) {
      const target = pickFirst(params.target);
      if (target !== undefined) {
        config.target = String(target);
      }
    }

    const textValue = pickFirst(
      params.value,
      params.text,
      params.query,
      params.keyword,
      params.content,
      params.input,
      params.searchQuery,
    );
    if (textValue !== undefined) {
      config.value = String(textValue);
      config.text = String(textValue);
      config.query = String(textValue);
    }

    const keyValue = pickFirst(
      params.key,
      params.code,
      normalizedAction.includes('press') ? params.value : undefined,
    );
    if (keyValue !== undefined) {
      config.key = String(keyValue);
    }

    const indexValue = pickFirst(params.index, params.resultIndex);
    if (indexValue !== undefined) {
      const num = Number(indexValue);
      config.index = Number.isFinite(num) ? num : 1;
    }

    const timeoutValue = pickFirst(step?.wait?.value, step?.wait?.timeout, params.duration, params.timeoutMs, params.timeout);
    if (timeoutValue !== undefined) {
      const num = Number(timeoutValue);
      config.timeoutMs = Number.isFinite(num) ? num : timeoutValue;
      config.duration = Number.isFinite(num) ? num : timeoutValue;
    }

    const stepInputParams = extractBrowserActivityPlaceholders([{ config }]).reduce<Record<string, string>>((acc, key) => {
      acc[key] = '';
      return acc;
    }, {});

    return {
      name: `${index + 1}. ${action || '浏览器操作'}`,
      type: 'browser',
      timeout: '30s',
      config,
      inputParams: stepInputParams,
    };
  });
}

function normalizeBrowserTemplateStepSelector(step: BrowserTemplateStepInput): string {
  if (!step?.locator?.value) {
    return '';
  }
  const locatorType = String(step.locator.type || '').toLowerCase();
  if (locatorType === 'test-id') {
    return `[data-testid="${step.locator.value}"]`;
  }
  return String(step.locator.value);
}

export function buildBrowserInputParamsFromTemplateSource(
  steps: BrowserTemplateStepInput[],
  paramsSchema?: BrowserTemplateParamsSchema,
): Record<string, WorkflowInputParamDefinition> {
  const properties = paramsSchema?.properties && typeof paramsSchema.properties === 'object'
    ? paramsSchema.properties
    : {};
  const requiredList = Array.isArray(paramsSchema?.required)
    ? paramsSchema.required.map((item) => String(item))
    : [];
  const declaredInputParams = Object.entries(properties).reduce<Record<string, WorkflowInputParamDefinition>>((acc, [key, propertySchema]) => {
    const propertyType = String(propertySchema?.type || 'string').toLowerCase();
    const normalizedType = (['string', 'number', 'boolean', 'date'].includes(propertyType) ? propertyType : 'string') as WorkflowInputParamDefinition['type'];
    const defaultValue = propertySchema?.default;
    const requiredFromSchema = propertySchema?.required === true || requiredList.includes(key);
    acc[key] = {
      required: requiredFromSchema,
      defaultValue: defaultValue === undefined || defaultValue === null ? '' : String(defaultValue),
      description: String(propertySchema?.description || `模板参数 ${key}`),
      source: 'declared',
      type: normalizedType,
      exampleValue: typeof defaultValue === 'string' || typeof defaultValue === 'number' || typeof defaultValue === 'boolean'
        ? defaultValue
        : undefined,
    };
    return acc;
  }, {});

  if (Object.keys(declaredInputParams).length > 0) {
    return declaredInputParams;
  }

  const inferredInputParams: Record<string, WorkflowInputParamDefinition> = {};
  steps.forEach((step) => {
    const action = String(step?.action || '').toLowerCase();
    const selector = String(step?.locator?.value || '');
    const params = step?.params && typeof step.params === 'object' ? step.params : {};
    const hint = `${selector} ${String(params.field || '')} ${String(params.name || '')}`;
    const value = String(params.value || params.text || '').trim();
    const url = String(params.url || params.targetUrl || params.href || params.target || '').trim();

    if (!inferredInputParams.startUrl && action.includes('goto') && url) {
      inferredInputParams.startUrl = {
        description: '起始页面地址，默认使用当前录制时的地址',
        required: false,
        defaultValue: url,
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: url,
      };
    }

    if (!inferredInputParams.username && /(用户名|账号|账户|user\s*name|username|account|email|邮箱|手机号|mobile)/i.test(hint)) {
      inferredInputParams.username = {
        description: '登录用户名',
        required: true,
        defaultValue: value || '',
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: value || 'test',
      };
    }

    if (!inferredInputParams.loginCredential && /(密码|password|passwd|passcode|pin|secret)/i.test(hint)) {
      inferredInputParams.loginCredential = {
        description: '登录密码',
        required: true,
        defaultValue: value || '',
        source: 'inferred_from_template',
        type: 'string',
        exampleValue: value || 'test123',
      };
    }
  });

  return inferredInputParams;
}

function normalizeBrowserDraftLocator(
  locator?: BrowserDraftCommandInput['locator'],
): { type: string; value: string } | undefined {
  if (!locator?.value) {
    return undefined;
  }

  const strategy = String(locator.strategy || '').trim().toLowerCase();
  const locatorType = strategy === 'testid' ? 'test-id' : strategy;
  const locatorValue = locator.role && locator.name
    ? `${locator.role}[name="${locator.name}"]`
    : String(locator.value);

  if (!locatorType || !locatorValue.trim()) {
    return undefined;
  }

  return {
    type: locatorType,
    value: locatorValue.trim(),
  };
}

export function parseBrowserScriptCommands(script: string): BrowserScriptCommand[] {
  const commands: BrowserScriptCommand[] = [];
  const lines = String(script || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const gotoMatch = line.match(/\.goto\(\s*(['"`])((?:\\.|(?!\1).)+)\1/);
    if (gotoMatch) {
      commands.push({ action: 'goto', url: gotoMatch[2] });
      return;
    }

    const locatorClickMatch = line.match(/\.locator\(\s*(['"`])((?:\\.|(?!\1).)+)\1\s*\)(?:\.first\(\))?\.click\(/);
    if (locatorClickMatch) {
      const locatorValue = locatorClickMatch[2]!;
      if (/^e\d+$/i.test(locatorValue)) {
        commands.push({ action: 'click', target: locatorValue, locator: { type: 'ref', value: locatorValue } });
      } else {
        commands.push({ action: 'click', selector: locatorValue });
      }
      return;
    }

    const clickMatch = line.match(/\.click\(\s*(['"`])((?:\\.|(?!\1).)+)\1/);
    if (clickMatch) {
      commands.push({ action: 'click', selector: clickMatch[2] });
      return;
    }

    const locatorFillMatch = line.match(/\.locator\(\s*(['"`])((?:\\.|(?!\1).)+)\1\s*\)(?:\.first\(\))?\.fill\(\s*(['"`])((?:\\.|(?!\3).)+)\3/);
    if (locatorFillMatch) {
      const locatorValue = locatorFillMatch[2]!;
      if (/^e\d+$/i.test(locatorValue)) {
        commands.push({
          action: 'fill',
          target: locatorValue,
          value: locatorFillMatch[4] || '',
          locator: { type: 'ref', value: locatorValue },
        });
      } else {
        commands.push({ action: 'fill', selector: locatorValue, value: locatorFillMatch[4] || '' });
      }
      return;
    }

    const fillMatch = line.match(/\.fill\(\s*(['"`])((?:\\.|(?!\1).)+)\1\s*,\s*(['"`])((?:\\.|(?!\3).)+)\3/);
    if (fillMatch) {
      commands.push({ action: 'fill', selector: fillMatch[2], value: fillMatch[4] || '' });
      return;
    }

    const locatorPressMatch = line.match(/\.locator\(\s*(['"`])((?:\\.|(?!\1).)+)\1\s*\)(?:\.first\(\))?\.press\(\s*(['"`])((?:\\.|(?!\3).)+)\3/);
    if (locatorPressMatch) {
      const locatorValue = locatorPressMatch[2]!;
      if (/^e\d+$/i.test(locatorValue)) {
        commands.push({
          action: 'press',
          target: locatorValue,
          value: locatorPressMatch[4],
          locator: { type: 'ref', value: locatorValue },
        });
      } else {
        commands.push({ action: 'press', selector: locatorValue, value: locatorPressMatch[4] });
      }
      return;
    }

    const getByRoleFillMatch = line.match(/page\.getByRole\(\s*(['"`])([^'"`]+)\1\s*,\s*\{\s*name:\s*(['"`])((?:\\.|(?!\3).)+)\3\s*\}\s*\)(?:\.first\(\))?\.fill\(\s*([^)]*?)\s*\)/);
    if (getByRoleFillMatch) {
      commands.push({
        action: 'fill',
        selector: `role=${getByRoleFillMatch[2]}[name="${getByRoleFillMatch[4]}"]`,
        locator: { type: 'role', value: `${getByRoleFillMatch[2]}[name="${getByRoleFillMatch[4]}"]` },
        value: getByRoleFillMatch[5]?.trim().replace(/^['"`]|['"`]$/g, '') || '',
      });
      return;
    }

    const getByRoleClickMatch = line.match(/page\.getByRole\(\s*(['"`])([^'"`]+)\1\s*,\s*\{\s*name:\s*(['"`])((?:\\.|(?!\3).)+)\3\s*\}\s*\)(?:\.first\(\))?\.click\(\s*\)/);
    if (getByRoleClickMatch) {
      commands.push({
        action: 'click',
        selector: `role=${getByRoleClickMatch[2]}[name="${getByRoleClickMatch[4]}"]`,
        locator: { type: 'role', value: `${getByRoleClickMatch[2]}[name="${getByRoleClickMatch[4]}"]` },
      });
      return;
    }

    const getByTextClickMatch = line.match(/page\.getByText\(\s*(['"`])((?:\\.|(?!\1).)+)\1(?:,\s*\{[^}]*\})?\s*\)(?:\.first\(\))?\.click\(\s*\)/);
    if (getByTextClickMatch) {
      commands.push({
        action: 'click',
        selector: `text=${getByTextClickMatch[2]}`,
        locator: { type: 'text', value: getByTextClickMatch[2]! },
      });
      return;
    }

    const pressMatch = line.match(/\.press\(\s*(['"`])((?:\\.|(?!\1).)+)\1\s*,\s*(['"`])((?:\\.|(?!\3).)+)\3/);
    if (pressMatch) {
      commands.push({ action: 'press', selector: pressMatch[2], value: pressMatch[4] });
      return;
    }

    const waitForSelectorMatch = line.match(/\.waitForSelector\(\s*(['"`])((?:\\.|(?!\1).)+)\1/);
    if (waitForSelectorMatch) {
      commands.push({ action: 'waitForSelector', selector: waitForSelectorMatch[2] });
      return;
    }

    const waitForTimeoutMatch = line.match(/\.waitForTimeout\(\s*(\d+)\s*\)/);
    if (waitForTimeoutMatch) {
      commands.push({
        action: 'waitForTimeout',
        timeoutMs: Number(waitForTimeoutMatch[1]),
      });
    }
  });

  return commands;
}

export function extractScriptPlaceholders(script: string): string[] {
  const scriptStr = String(script || '');
  const matches = [
    ...scriptStr.matchAll(/\{([^{}]+)\}/g),
    ...scriptStr.matchAll(/\$\{([^{}]+)\}/g),
  ];
  const keys = matches
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function inferBrowserTemplateTimeoutFromSteps(
  steps: Array<{ config: Record<string, unknown> }>,
): string {
  const waitMs = steps.reduce((acc, step) => {
    const config = step.config || {};
    const action = String(config.action || '').trim();
    if (!['wait', 'waitForTimeout', 'waitForSelector'].includes(action)) {
      return acc;
    }
    const duration = Number(config.timeoutMs ?? config.duration ?? 0);
    return acc + (Number.isFinite(duration) ? duration : 0);
  }, 0);
  const estimatedSeconds = Math.ceil((waitMs / 1000) + steps.length * 8);
  const timeoutSeconds = Math.min(Math.max(estimatedSeconds, 60), 900);
  return `${timeoutSeconds}s`;
}

export function browserActionLabel(action: BrowserScriptCommand['action']): string {
  switch (action) {
    case 'goto':
      return '访问页面';
    case 'click':
      return '点击元素';
    case 'fill':
      return '输入文本';
    case 'press':
      return '键盘按键';
    case 'waitForSelector':
      return '等待元素出现';
    case 'waitForTimeout':
      return '等待时间';
    default:
      return '浏览器操作';
  }
}
