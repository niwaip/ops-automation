import { Injectable } from '@nestjs/common';
import { BrowserExecutionBackend, MCPCommand } from '../adapters/browser-execution.adapter';
import {
  BrowserActionStep,
  BrowserArtifactRef,
  BrowserError,
  BrowserRuntimeLocator,
  BrowserRuntimeParamBinding,
  BrowserSnapshotRef,
} from '../domain/browser-step.types';

@Injectable()
export class BrowserStepMapper {
  toActionStep(input: {
    command: MCPCommand;
    result?: Record<string, unknown>;
    backend: BrowserExecutionBackend;
    index: number;
  }): BrowserActionStep {
    const { command, result, backend, index } = input;
    const resultStatus = typeof result?.status === 'string' ? result.status : undefined;
    const success = resultStatus !== 'error';
    const action = command.tool;
    const runtimeTargetRef = this.extractRuntimeTargetRef(command.params);
    const locator = this.extractLocator(command.params, runtimeTargetRef);
    const error = success ? undefined : this.extractError(result);
    const scriptFragment = this.extractScriptFragment(result);
    const paramBindings = this.extractParamBindings(command.params);
    const replaceableParams = paramBindings
      .filter((binding) => binding.source === 'user_input' || binding.source === 'secret')
      .map((binding) => binding.name);
    const snapshot = this.extractSnapshot(result);
    const artifacts = this.extractArtifacts(result, scriptFragment);
    const assertionFragment = this.extractAssertionFragment(command);

    return {
      id: `step_${Date.now()}_${index}`,
      source: 'ai',
      backend,
      action,
      status: success ? 'success' : 'error',
      intent: command.description,
      ...(runtimeTargetRef ? { runtimeTargetRef } : {}),
      ...(locator ? { locator } : {}),
      params: command.params,
      ...(paramBindings.length ? { paramBindings } : {}),
      ...(replaceableParams.length ? { replaceableParams } : {}),
      ...(scriptFragment ? { scriptFragment } : {}),
      ...(assertionFragment ? { assertionFragment } : {}),
      ...(snapshot ? { snapshot } : {}),
      ...(artifacts.length ? { artifacts } : {}),
      replayable: success,
      ...(error ? { error } : {}),
      timestamp: Date.now(),
    };
  }

  private extractAssertionFragment(command: MCPCommand): string | undefined {
    if (!command.assertion) {
      return undefined;
    }

    const { type, expected } = command.assertion;
    
    // Default to a locator if present
    const locatorStr = command.locator?.expression || 'page';
    
    switch (type) {
      case 'visible':
        return `await expect(${locatorStr}).toBeVisible();`;
      case 'hidden':
        return `await expect(${locatorStr}).toBeHidden();`;
      case 'text_contains':
        return `await expect(${locatorStr}).toContainText('${expected}');`;
      case 'text_equals':
        return `await expect(${locatorStr}).toHaveText('${expected}');`;
      case 'value_equals':
        return `await expect(${locatorStr}).toHaveValue('${expected}');`;
      case 'url_contains':
        return `await expect(page).toHaveURL(/.*${expected}.*/);`;
      default:
        return undefined;
    }
  }

  applyGeneratedLocator(step: BrowserActionStep, locatorExpression?: string): BrowserActionStep {
    const expression = locatorExpression?.trim();
    if (!expression) {
      return step;
    }

    const parsed = this.parseLocatorExpression(expression);
    if (!parsed) {
      return {
        ...step,
        locator: {
          strategy: 'css',
          value: expression,
          expression,
          generatedBy: 'cli',
          confidence: 0.5,
        },
      };
    }

    return {
      ...step,
      locator: parsed,
    };
  }

  private extractRuntimeTargetRef(params: Record<string, unknown>): string | undefined {
    const candidates = [
      params.target,
      params.selector,
      params.ref,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && /^e\d+$/i.test(candidate.trim())) {
        return candidate.trim();
      }
    }
    return undefined;
  }

  private extractLocator(
    params: Record<string, unknown>,
    runtimeTargetRef?: string,
  ): BrowserRuntimeLocator | undefined {
    if (runtimeTargetRef) {
      return {
        strategy: 'ref',
        value: runtimeTargetRef,
        generatedBy: 'system',
      };
    }

    const selector = typeof params.selector === 'string' ? params.selector.trim() : '';
    if (selector) {
      return {
        strategy: 'css',
        value: selector,
        generatedBy: 'system',
        confidence: 0.3,
      };
    }

    const text = typeof params.text === 'string' ? params.text.trim() : '';
    if (text) {
      return {
        strategy: 'text',
        value: text,
        generatedBy: 'system',
        confidence: 0.2,
      };
    }

    const target = typeof params.target === 'string' ? params.target.trim() : '';
    if (target) {
      return {
        strategy: 'text',
        value: target,
        generatedBy: 'system',
        confidence: 0.2,
      };
    }

    return undefined;
  }

  private extractError(result?: Record<string, unknown>): BrowserError | undefined {
    const message = typeof result?.message === 'string'
      ? result.message
      : 'Browser command execution failed';
    return {
      code: 'BROWSER_COMMAND_FAILED',
      message,
      retryable: true,
      raw: result,
    };
  }

  private parseLocatorExpression(expression: string): BrowserRuntimeLocator | undefined {
    const roleMatch = expression.match(/^getByRole\('([^']+)'\s*,\s*\{\s*name:\s*(.+?)\s*\}\)$/);
    if (roleMatch?.[1] && roleMatch[2]) {
      return {
        strategy: 'role',
        value: roleMatch[1],
        role: roleMatch[1],
        name: this.normalizeLocatorName(roleMatch[2]),
        expression,
        generatedBy: 'cli',
        confidence: 0.95,
      };
    }

    const labelMatch = expression.match(/^getByLabel\((.+)\)$/);
    if (labelMatch?.[1]) {
      return {
        strategy: 'label',
        value: this.normalizeLocatorName(labelMatch[1]),
        expression,
        generatedBy: 'cli',
        confidence: 0.95,
      };
    }

    const placeholderMatch = expression.match(/^getByPlaceholder\((.+)\)$/);
    if (placeholderMatch?.[1]) {
      return {
        strategy: 'placeholder',
        value: this.normalizeLocatorName(placeholderMatch[1]),
        expression,
        generatedBy: 'cli',
        confidence: 0.95,
      };
    }

    const testIdMatch = expression.match(/^getByTestId\((.+)\)$/);
    if (testIdMatch?.[1]) {
      return {
        strategy: 'testid',
        value: this.normalizeLocatorName(testIdMatch[1]),
        expression,
        generatedBy: 'cli',
        confidence: 0.95,
      };
    }

    const textMatch = expression.match(/^getByText\((.+)\)$/);
    if (textMatch?.[1]) {
      return {
        strategy: 'text',
        value: this.normalizeLocatorName(textMatch[1]),
        expression,
        generatedBy: 'cli',
        confidence: 0.85,
      };
    }

    const locatorMatch = expression.match(/^locator\((.+)\)$/);
    if (locatorMatch?.[1]) {
      return {
        strategy: 'css',
        value: this.normalizeLocatorName(locatorMatch[1]),
        expression,
        generatedBy: 'cli',
        confidence: 0.6,
      };
    }

    return undefined;
  }

  private normalizeLocatorName(value: string): string {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('\'') && trimmed.endsWith('\''))
      || (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private extractScriptFragment(result?: Record<string, unknown>): string | null {
    const stdout = typeof result?.stdout === 'string' ? result.stdout : '';
    if (!stdout) {
      return null;
    }

    const codeBlockMatch = stdout.match(/### Ran Playwright code\s+```(?:js|ts)?\n([\s\S]*?)\n```/);
    if (codeBlockMatch?.[1]?.trim()) {
      return codeBlockMatch[1].trim();
    }

    return null;
  }

  private extractParamBindings(params: Record<string, unknown>): BrowserRuntimeParamBinding[] {
    const bindings: BrowserRuntimeParamBinding[] = [];
    const ignoredKeys = new Set([
      'target',
      'selector',
      'ref',
      'index',
      'button',
      'submit_key',
      'fullPage',
      'full_page',
      'timeout',
      'duration',
    ]);

    Object.entries(params).forEach(([key, value]) => {
      if (ignoredKeys.has(key) || value === undefined || value === null) {
        return;
      }

      const lowerKey = key.toLowerCase();
      const isSecret = /(password|token|secret|cookie|authorization|auth)/.test(lowerKey);
      const userInputLike = /(url|value|text|query|username|password|email|keyword|content|expected)/.test(lowerKey);

      bindings.push({
        name: key,
        source: isSecret ? 'secret' : (userInputLike ? 'user_input' : 'literal'),
        required: true,
        ...(isSecret ? { secret: true } : {}),
        value,
        description: this.buildParamDescription(key),
      });
    });

    return bindings;
  }

  private buildParamDescription(name: string): string {
    switch (name) {
      case 'url':
        return '目标页面地址';
      case 'value':
        return '输入值';
      case 'text':
        return '文本内容';
      case 'query':
        return '搜索关键词';
      case 'username':
        return '用户名';
      case 'password':
        return '密码';
      default:
        return `步骤参数 ${name}`;
    }
  }

  private extractSnapshot(result?: Record<string, unknown>): BrowserSnapshotRef | null {
    const snapshot = this.asRecord(result?.snapshot);
    if (!snapshot) {
      return null;
    }

    const id = typeof snapshot.id === 'string' ? snapshot.id : undefined;
    if (!id) {
      return null;
    }

    return {
      id,
      type: this.inferSnapshotType(snapshot.path),
      ...(typeof snapshot.path === 'string' ? { path: snapshot.path } : {}),
      createdAt: new Date().toISOString(),
    };
  }

  private extractArtifacts(
    result: Record<string, unknown> | undefined,
    scriptFragment: string | null,
  ): BrowserArtifactRef[] {
    const artifacts: BrowserArtifactRef[] = [];
    const data = this.asRecord(result?.data);
    const screenshotPath = typeof data?.screenshotPath === 'string' ? data.screenshotPath : undefined;
    const text = typeof result?.text === 'string' ? result.text : undefined;
    const html = typeof result?.html === 'string' ? result.html : undefined;

    if (screenshotPath) {
      artifacts.push({
        id: `artifact_screenshot_${Date.now()}`,
        type: 'screenshot',
        path: screenshotPath,
        createdAt: new Date().toISOString(),
      });
    }

    if (text) {
      artifacts.push({
        id: `artifact_text_${Date.now()}`,
        type: 'text',
        inlineText: text,
        createdAt: new Date().toISOString(),
      });
    }

    if (html) {
      artifacts.push({
        id: `artifact_html_${Date.now()}`,
        type: 'html',
        inlineText: html,
        createdAt: new Date().toISOString(),
      });
    }

    if (scriptFragment) {
      artifacts.push({
        id: `artifact_script_${Date.now()}`,
        type: 'script',
        inlineText: scriptFragment,
        createdAt: new Date().toISOString(),
      });
    }

    return artifacts;
  }

  private inferSnapshotType(snapshotPath: unknown): BrowserSnapshotRef['type'] {
    if (typeof snapshotPath !== 'string') {
      return 'yaml';
    }
    if (snapshotPath.endsWith('.png') || snapshotPath.endsWith('.jpg') || snapshotPath.endsWith('.jpeg')) {
      return 'image';
    }
    if (snapshotPath.endsWith('.html')) {
      return 'dom';
    }
    return 'yaml';
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }
}
