import { Injectable, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  TemplateJSON,
  TemplateStep,
  Locator,
  LocatorType,
  ActionType,
  ParamsSchema,
  ParamSchema,
  WaitType,
  ValidationResult,
} from '../types/template.types';
import { TemplateValidator } from '../validators/template.validator';

interface ParsedAction {
  action: ActionType;
  locator?: Locator;
  params?: Record<string, string | number>;
  wait?: { type: WaitType; value: number | string };
}

@Injectable()
export class PlaywrightCompiler {
  constructor(private readonly templateValidator: TemplateValidator) {}

  compile(script: string, createdBy: string): { template: TemplateJSON; validation: ValidationResult } {
    if (!script || script.trim() === '') {
      throw new BadRequestException('Script cannot be empty');
    }

    const actions = this.parseScript(script);

    if (actions.length === 0) {
      throw new BadRequestException('No valid actions found in script');
    }

    const steps: TemplateStep[] = actions.map((action, index) => ({
      step_id: `step_${index + 1}`,
      action: action.action,
      locator: action.locator,
      params: action.params,
      wait: action.wait,
      on_fail: 'stop' as const,
      retry: { max_attempts: 3, delay_ms: 1000 },
    }));

    const paramsSchema = this.extractParamsSchema(script);

    const template: TemplateJSON = {
      id: uuidv4(),
      name: this.extractTemplateName(script) || 'Compiled Template',
      version: '1.0.0',
      status: 'DRAFT',
      params_schema: paramsSchema,
      steps,
      metadata: {
        created_by: createdBy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        description: 'Auto-generated from Playwright script',
      },
    };

    const validation = this.templateValidator.validate(template);
    return { template, validation };
  }

  private parseScript(script: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    const normalizedScript = this.normalizeScript(script);
    let match: RegExpExecArray | null;

    // page.click('locator')
    const clickRegex = /page\.click\(['"]([^'"]+)['"]\)/g;
    while ((match = clickRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'click',
        locator: this.parseLocatorString(match[1]!),
      });
    }

    // page.fill('locator', 'value')
    const fillRegex = /page\.fill\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/g;
    while ((match = fillRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'fill',
        locator: this.parseLocatorString(match[1]!),
        params: { value: match[2]! },
      });
    }

    // page.goto('url')
    const navigateRegex = /page\.goto\(['"]([^'"]+)['"]\)/g;
    while ((match = navigateRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'navigate',
        params: { url: match[1]! },
      });
    }

    // page.waitForTimeout(ms)
    const waitTimeoutRegex = /page\.waitForTimeout\((\d+)\)/g;
    while ((match = waitTimeoutRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'wait',
        wait: { type: 'timeout' as WaitType, value: parseInt(match[1]!, 10) },
      });
    }

    // page.waitForSelector('locator')
    const waitVisibleRegex = /page\.waitForSelector\(['"]([^'"]+)['"]\)/g;
    while ((match = waitVisibleRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'wait',
        locator: this.parseLocatorString(match[1]!),
        wait: { type: 'visible' as WaitType, value: match[1]! },
      });
    }

    // page.selectOption('locator', 'value')
    const selectRegex = /page\.selectOption\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/g;
    while ((match = selectRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'select',
        locator: this.parseLocatorString(match[1]!),
        params: { value: match[2]! },
      });
    }

    // page.check('locator')
    const checkRegex = /page\.check\(['"]([^'"]+)['"]\)/g;
    while ((match = checkRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'check',
        locator: this.parseLocatorString(match[1]!),
      });
    }

    // page.screenshot()
    const screenshotRegex = /page\.screenshot\([^)]*\)/g;
    while ((match = screenshotRegex.exec(normalizedScript)) !== null) {
      actions.push({ action: 'screenshot' });
    }

    // page.locator('...').click()
    const locatorClickRegex = /page\.locator\(['"]([^'"]+)['"]\)\.click\(\)/g;
    while ((match = locatorClickRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'click',
        locator: this.parseLocatorString(match[1]!),
      });
    }

    // page.locator('...').fill('value')
    const locatorFillRegex = /page\.locator\(['"]([^'"]+)['"]\)\.fill\(['"]([^'"]+)['"]\)/g;
    while ((match = locatorFillRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: 'fill',
        locator: this.parseLocatorString(match[1]!),
        params: { value: match[2]! },
      });
    }

    // page.getByRole('role', {name: 'text'}).action()
    const getByRoleRegex = /page\.getByRole\(['"]([^'"]+)['"](?:,\s*\{[^}]*name:\s*['"]([^'"]+)['"][^}]*\})?\)\.(\w+)\(\)/g;
    while ((match = getByRoleRegex.exec(normalizedScript)) !== null) {
      const roleValue = match[2] ? `${match[1]}[name="${match[2]}"]` : match[1]!;
      actions.push({
        action: this.mapPlaywrightMethod(match[3]!),
        locator: { type: 'role' as LocatorType, value: roleValue },
      });
    }

    // page.getByText('text').action()
    const getByTextRegex = /page\.getByText\(['"]([^'"]+)['"]\)\.(\w+)\(\)/g;
    while ((match = getByTextRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: this.mapPlaywrightMethod(match[2]!),
        locator: { type: 'text' as LocatorType, value: match[1]! },
      });
    }

    // page.getByTestId('test-id').action()
    const getByTestIdRegex = /page\.getByTestId\(['"]([^'"]+)['"]\)\.(\w+)\(\)/g;
    while ((match = getByTestIdRegex.exec(normalizedScript)) !== null) {
      actions.push({
        action: this.mapPlaywrightMethod(match[2]!),
        locator: { type: 'test-id' as LocatorType, value: match[1]! },
      });
    }

    return actions;
  }

  private parseLocatorString(locatorStr: string): Locator {
    if (locatorStr.startsWith('role=')) return { type: 'role', value: locatorStr.substring(5) };
    if (locatorStr.startsWith('text=')) return { type: 'text', value: locatorStr.substring(5) };
    if (locatorStr.startsWith('data-testid=')) return { type: 'test-id', value: locatorStr.substring(11) };
    if (locatorStr.startsWith('//') || locatorStr.startsWith('./')) return { type: 'xpath', value: locatorStr };
    if (locatorStr.startsWith('#') || locatorStr.startsWith('.') || locatorStr.startsWith('[')) return { type: 'css', value: locatorStr };
    return { type: 'text', value: locatorStr };
  }

  private mapPlaywrightMethod(method: string): ActionType {
    const methodMap: Record<string, ActionType> = { click: 'click', fill: 'fill', check: 'check', selectOption: 'select' };
    return methodMap[method] || 'click';
  }

  private normalizeScript(script: string): string {
    return script.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
  }

  private extractTemplateName(script: string): string | null {
    const nameMatch = script.match(/\/\/\s*@template-name:\s*([^\n]+)/);
    return nameMatch?.[1]?.trim() ?? null;
  }

  private extractParamsSchema(script: string): ParamsSchema {
    const properties: Record<string, ParamSchema> = {};
    const required: string[] = [];

    const paramRegex = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = paramRegex.exec(script)) !== null) {
      const paramName = match[1]!;
      if (!properties[paramName]) {
        properties[paramName] = { type: 'string', description: `Parameter ${paramName}` };
        required.push(paramName);
      }
    }

    const annotationRegex = /\/\/\s*@param\s+(\w+)\s*(?:\((\w+)\))?\s*:\s*([^\n]+)/g;
    while ((match = annotationRegex.exec(script)) !== null) {
      const paramName = match[1]!;
      const paramType = match[2] || 'string';
      const description = match[3]!.trim();
      properties[paramName] = { type: paramType as 'string' | 'number' | 'boolean', description };
    }

    return { type: 'object', properties, required };
  }
}