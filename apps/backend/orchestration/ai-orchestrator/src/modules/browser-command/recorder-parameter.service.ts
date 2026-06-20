import { Injectable } from '@nestjs/common';
import { BrowserCommand } from './browser-command.service';

const FORBIDDEN_TEMPLATE_PARAM_TOKENS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'apikey',
] as const;

interface TemplateStepLike {
  step_id: string;
  action: string;
  locator?: {
    type?: string;
    value?: string;
  };
  params?: Record<string, unknown>;
  description?: string;
  branch?: {
    condition_fn?: string;
    description?: string;
    takeover_reason?: string;
  };
}

interface SkillParameterLike {
  name: string;
  description: string;
  required: boolean;
  exampleValue?: string;
  source?: string;
}

@Injectable()
export class RecorderParameterService {
  inferSkillParameters(
    commands: BrowserCommand[],
    options?: {
      includeStartUrl?: boolean;
      templateSteps?: TemplateStepLike[];
    }
  ): SkillParameterLike[] {
    const params: SkillParameterLike[] = [];
    const usedNames = new Set<string>();

    const registerParameter = (parameter: SkillParameterLike) => {
      const source = parameter.source?.trim();
      if (!source || params.some((item) => item.source === source)) {
        return;
      }

      const canonicalName = this.makeTemplateSafeParameterName(
        this.normalizeParameterName(parameter.name)
      );
      const existingIndex = params.findIndex(
        (item) =>
          this.makeTemplateSafeParameterName(this.normalizeParameterName(item.name)) === canonicalName
      );
      if (existingIndex >= 0) {
        const existing = params[existingIndex];
        const existingSource = existing?.source?.trim() || '';
        if (existing && source.startsWith('template.') && !existingSource.startsWith('template.')) {
          params[existingIndex] = {
            ...parameter,
            name: existing.name,
            source,
          };
        }
        return;
      }

      const name = this.ensureUniqueParameterName(parameter.name, usedNames);
      usedNames.add(name);
      params.push({
        ...parameter,
        name,
        source,
      });
    };

    for (const [index, command] of commands.entries()) {
      if (
        (options?.includeStartUrl ?? true) &&
        command.tool === 'navigate' &&
        typeof command.params.url === 'string'
      ) {
        registerParameter({
          name: 'startUrl',
          description: '起始页面地址，默认使用当前录制时的地址',
          required: false,
          exampleValue: command.params.url,
          source: `command.${index}.url`,
        });
      }

      if (
        (command.tool === 'search' || command.tool === 'smart_search') &&
        typeof command.params.query === 'string'
      ) {
        registerParameter({
          name: 'searchQuery',
          description: '搜索关键词',
          required: true,
          exampleValue: command.params.query,
          source: `command.${index}.query`,
        });
      }

      if (command.tool === 'fill' && typeof command.params.value === 'string') {
        registerParameter(this.inferFillParameter(command, index));
      }

      if (command.tool === 'type_text' && typeof command.params.text === 'string') {
        registerParameter({
          name: `typedText${index + 1}`,
          description: '键盘输入文本',
          required: true,
          exampleValue: command.params.text,
          source: `command.${index}.text`,
        });
      }

      if (command.tool === 'click_result' && command.params.index !== undefined) {
        registerParameter({
          name: 'resultIndex',
          description: '搜索结果序号，从 1 开始',
          required: false,
          exampleValue: String(command.params.index),
          source: `command.${index}.index`,
        });
      }
    }

    for (const [index, step] of (options?.templateSteps || []).entries()) {
      if (step.action === 'fill' && typeof step.params?.value === 'string') {
        registerParameter(this.inferTemplateFillParameter(step, index));
      }
      if (step.action === 'branch' && step.branch?.condition_fn) {
        const branchParameter = this.inferBranchThresholdParameter(step, index);
        if (branchParameter) {
          registerParameter(branchParameter);
        }
      }
    }

    if (
      options?.templateSteps &&
      this.templateStepsContainPlaceholder(options.templateSteps, 'rowIndex')
    ) {
      registerParameter({
        name: 'rowIndex',
        description: '要打开的明细行序号，从 1 开始',
        required: true,
        exampleValue: '1',
        source: 'template.detail.rowIndex',
      });
    }

    return params;
  }

  shouldExposeStartUrlParameter(
    commands: BrowserCommand[],
    templateSteps?: TemplateStepLike[]
  ): boolean {
    if (!templateSteps?.length) {
      return true;
    }

    const navigateCommands = commands.filter(
      (command) =>
        command.tool === 'navigate' &&
        typeof command.params.url === 'string' &&
        command.params.url.trim()
    );
    if (navigateCommands.length !== 1) {
      return true;
    }

    return false;
  }

  templateStepsContainPlaceholder(steps: TemplateStepLike[], placeholderName: string): boolean {
    const placeholder = `\${${placeholderName}}`;
    return steps.some((step) => this.objectContainsPlaceholder(step, placeholder));
  }

  objectContainsPlaceholder(value: unknown, placeholder: string): boolean {
    if (typeof value === 'string') {
      return value.includes(placeholder);
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.objectContainsPlaceholder(item, placeholder));
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some((entry) =>
        this.objectContainsPlaceholder(entry, placeholder)
      );
    }
    return false;
  }

  inferFillParameter(command: BrowserCommand, index: number): SkillParameterLike {
    const fieldHint = this.extractCommandFieldHint(command);
    const normalizedHint = fieldHint.toLowerCase();

    if (
      /(用户名|账号|账户|user\s*name|username|account|email|邮箱|手机号|mobile)/i.test(fieldHint)
    ) {
      return {
        name: 'username',
        description: '登录用户名',
        required: true,
        exampleValue: String(command.params.value || ''),
        source: `command.${index}.value`,
      };
    }

    if (/(密码|password|passwd|passcode|pin|secret)/i.test(fieldHint)) {
      return {
        name: 'loginCredential',
        description: '登录密码',
        required: true,
        exampleValue: String(command.params.value || ''),
        source: `command.${index}.value`,
      };
    }

    if (/(验证码|otp|verification|verify|code)/i.test(fieldHint)) {
      return {
        name: 'verificationCode',
        description: '验证码或校验码',
        required: true,
        exampleValue: String(command.params.value || ''),
        source: `command.${index}.value`,
      };
    }

    const genericName = normalizedHint
      ? `input${index + 1}${this.toPascalCase(this.sanitizeParameterName(normalizedHint))}`
      : `inputValue${index + 1}`;

    return {
      name: genericName,
      description: fieldHint ? `字段「${fieldHint}」的输入值` : `第 ${index + 1} 个输入框的值`,
      required: true,
      exampleValue: String(command.params.value || ''),
      source: `command.${index}.value`,
    };
  }

  inferTemplateFillParameter(step: TemplateStepLike, index: number): SkillParameterLike {
    const fieldHint = this.extractTemplateStepFieldHint(step);
    const commandLike = {
      locator: {
        name: fieldHint,
      },
      params: {
        selector: fieldHint,
        value: step.params?.value,
      },
      description: step.description,
    } as unknown as BrowserCommand;
    const inferred = this.inferFillParameter(commandLike, index);
    return {
      ...inferred,
      source: `template.${step.step_id}.params.value`,
    };
  }

  inferBranchThresholdParameter(
    step: TemplateStepLike,
    index: number
  ): SkillParameterLike | null {
    const conditionFn = step.branch?.condition_fn?.trim();
    if (!conditionFn) {
      return null;
    }

    const numericMatch = conditionFn.match(/([<>]=?)\s*(-?\d+(?:\.\d+)?)/);
    if (!numericMatch) {
      return null;
    }

    const thresholdValue = numericMatch[2];
    const hintSource = [step.description, step.branch?.description, step.branch?.takeover_reason]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join(' ');
    const normalizedHint = hintSource.toLowerCase();

    if (/(毛利率|粗利率|gross\s*margin|profit\s*margin)/i.test(hintSource)) {
      return {
        name: 'grossMarginThreshold',
        description: '自动执行所需的毛利率阈值，低于该值时转人工接管',
        required: true,
        exampleValue: thresholdValue,
        source: `template.${step.step_id}.branch.condition_fn`,
      };
    }

    if (/(金额|amount|price|total|cost)/i.test(hintSource)) {
      return {
        name: 'numericThreshold',
        description: '条件分支使用的数值阈值',
        required: true,
        exampleValue: thresholdValue,
        source: `template.${step.step_id}.branch.condition_fn`,
      };
    }

    const parameterName = normalizedHint
      ? `threshold${this.toPascalCase(this.sanitizeParameterName(normalizedHint)) || index + 1}`
      : `thresholdValue${index + 1}`;

    return {
      name: parameterName,
      description: '条件分支使用的判断阈值',
      required: true,
      exampleValue: thresholdValue,
      source: `template.${step.step_id}.branch.condition_fn`,
    };
  }

  extractCommandFieldHint(command: BrowserCommand): string {
    const candidates = [
      typeof command.locator?.name === 'string' ? command.locator.name : undefined,
      typeof command.params.selector === 'string' ? command.params.selector : undefined,
      typeof command.params.text === 'string' ? command.params.text : undefined,
      typeof command.description === 'string' ? command.description : undefined,
    ];

    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value) {
        return value.replace(/\s+/g, ' ');
      }
    }

    return '';
  }

  extractTemplateStepFieldHint(step: TemplateStepLike): string {
    const candidates = [
      typeof step.locator?.value === 'string' ? step.locator.value : undefined,
      typeof step.params?.selector === 'string' ? step.params.selector : undefined,
      typeof step.description === 'string' ? step.description : undefined,
    ];

    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value) {
        return value.replace(/\s+/g, ' ');
      }
    }

    return '';
  }

  sanitizeParameterName(value: string): string {
    const normalized = value
      .replace(/enter\s+/gi, '')
      .replace(/输入|请输入/g, '')
      .replace(/[^\w\s\u4e00-\u9fa5]+/g, ' ')
      .trim();

    if (!normalized) {
      return 'value';
    }

    if (
      /用户名|账号|账户|user\s*name|username|account|email|邮箱|手机号|mobile/i.test(normalized)
    ) {
      return 'username';
    }
    if (/密码|password|passwd|passcode|pin|secret/i.test(normalized)) {
      return 'loginCredential';
    }
    if (/验证码|otp|verification|verify|code/i.test(normalized)) {
      return 'verificationCode';
    }

    return normalized
      .split(/\s+/)
      .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(' ');
  }

  toPascalCase(value: string): string {
    const ascii = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!ascii) {
      return '';
    }

    return ascii
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  ensureUniqueParameterName(name: string, usedNames: Set<string>): string {
    const normalized = this.makeTemplateSafeParameterName(this.normalizeParameterName(name));
    if (!usedNames.has(normalized)) {
      return normalized;
    }

    let counter = 2;
    while (usedNames.has(`${normalized}${counter}`)) {
      counter += 1;
    }
    return `${normalized}${counter}`;
  }

  normalizeParameterName(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!cleaned) {
      return 'inputValue';
    }

    const words = cleaned
      .split(/\s+/)
      .map((part) => part.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean);
    if (words.length === 0) {
      return 'inputValue';
    }

    return words
      .map((part, index) => {
        if (index === 0) {
          return part.charAt(0).toLowerCase() + part.slice(1);
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('');
  }

  makeTemplateSafeParameterName(name: string): string {
    let normalized = name;

    normalized = normalized.replace(/password|passwd|pwd|passcode|secret/gi, 'Credential');
    normalized = normalized.replace(/token|api_?key|apikey/gi, 'AuthKey');

    const lower = normalized.toLowerCase();
    if (FORBIDDEN_TEMPLATE_PARAM_TOKENS.some((token) => lower.includes(token))) {
      normalized = `input${this.toPascalCase(normalized) || 'Value'}`;
    }

    return normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }
}
