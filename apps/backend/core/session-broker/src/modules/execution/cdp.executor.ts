import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export interface TemplateStep {
  step_id: string;
  step_number?: number;
  action: string;
  params?: Record<string, unknown>;
  locator?: { type: string; value: string };
  wait?: { type: string; value?: string; timeout?: number };
  retry?: { max_attempts: number; delay_ms: number };
  on_fail?: string;
  selector?: string;
  target?: string;
  value?: string;
  url?: string;
  text?: string;
  key?: string;
  duration?: number;
  direction?: string;
  amount?: number;
}

export interface ExecutionResult {
  success: boolean;
  step_id: string;
  step?: number;
  action?: string;
  error?: string;
  message?: string;
  screenshot?: string;
  text?: string;
  html?: string;
}

@Injectable()
export class CdpExecutor implements OnModuleDestroy {
  private readonly logger = new Logger(CdpExecutor.name);
  private readonly browserWorkerUrl = process.env.BROWSER_WORKER_URL || 'http://ops-browser-worker:3004';

  async onModuleDestroy() {
    // No persistent browser connection to close
    this.logger.log('CdpExecutor destroyed');
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    this.logger.log(`POST ${path} with body: ${JSON.stringify(body)}`);
    const response = await fetch(`${this.browserWorkerUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      this.logger.error(`Request failed ${path}: ${response.status} ${text}`);
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Failed to parse response: ${text}`);
    }
  }

  /**
   * Start browser session via codegen API
   */
  async startBrowser(sessionId: string, url: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log(`Starting browser for session ${sessionId} at ${url}`);
      const result = await this.postJson<{ success: boolean; message?: string }>('/browser/init', {
        runtimeSessionId: sessionId,
        initialUrl: url,
        backend: 'legacy',
      });
      return result.success
        ? { success: true }
        : { success: false, error: result.message || 'Failed to start browser' };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start browser: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Navigate to URL (alias for startBrowser)
   */
  async navigateToUrl(url: string, sessionId?: string): Promise<{ success: boolean; error?: string }> {
    const sid = sessionId || `session-${Date.now()}`;
    return this.startBrowser(sid, url);
  }

  async executeStep(step: TemplateStep, sessionId?: string): Promise<ExecutionResult> {
    this.logger.log(`Executing step ${step.step_id}: ${step.action}`);

    try {
      const backend = 'legacy';
      const initResult = await this.postJson<{ success: boolean; message?: string }>('/browser/init', {
        runtimeSessionId: sessionId,
        backend,
      });
      if (!initResult.success) {
        throw new Error(initResult.message || 'Failed to initialize browser');
      }
      const result = await this.postJson<{
        success: boolean;
        results: Array<Record<string, unknown>>;
        message?: string;
      }>('/browser/execute', {
        runtimeSessionId: sessionId,
        backend,
        commands: [this.mapStepToCommand(step)],
      });
      if (Array.isArray(result.results) && result.results.length > 0) {
        const stepResult = result.results[0] || {};
        const success = stepResult.status !== 'error';
        return {
          success,
          step_id: step.step_id,
          action: String(stepResult.command || step.action),
          error: success ? undefined : String(stepResult.message || result.message || 'Step execution failed'),
          message: String(stepResult.message || result.message || ''),
        };
      }
      return { success: result.success, step_id: step.step_id, error: result.message };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Step ${step.step_id} failed: ${errorMsg}`);
      return { success: false, step_id: step.step_id, error: errorMsg };
    }
  }

  /**
   * Replace ${param_name} placeholders with actual values
   */
  private replaceParams(value: unknown, params: Record<string, unknown>): unknown {
    if (typeof value === 'string') {
      // Replace ${param_name} patterns
      return value.replace(/\$\{(\w+)\}/g, (match, paramName) => {
        if (params[paramName] !== undefined) {
          return String(params[paramName]);
        }
        // Return original placeholder if param not found
        return match;
      });
    }
    return value;
  }

  private mapStepToCommand(
    step: TemplateStep,
    params: Record<string, unknown> = {},
  ): { tool: string; params: Record<string, unknown> } {
    const commandParams: Record<string, unknown> = { ...(step.params || {}) };

    if (step.selector && commandParams.selector === undefined) commandParams.selector = step.selector;
    if (step.target && commandParams.target === undefined) commandParams.target = step.target;
    if (step.value && commandParams.value === undefined) commandParams.value = step.value;
    if (step.url && commandParams.url === undefined) commandParams.url = step.url;
    if (step.text && commandParams.text === undefined) commandParams.text = step.text;
    if (step.key && commandParams.key === undefined) commandParams.key = step.key;
    if (step.duration !== undefined && commandParams.duration === undefined) commandParams.duration = step.duration;
    if (step.direction && commandParams.direction === undefined) commandParams.direction = step.direction;
    if (step.amount !== undefined && commandParams.amount === undefined) commandParams.amount = step.amount;
    if (step.locator && commandParams.selector === undefined) {
      commandParams.selector = this.buildSelector(step.locator);
    }
    if (step.wait) {
      if (step.wait.value && commandParams.selector === undefined) {
        commandParams.selector = step.wait.value;
      }
      if (step.wait.timeout !== undefined && commandParams.duration === undefined) {
        commandParams.duration = step.wait.timeout;
      }
    }

    for (const key of Object.keys(commandParams)) {
      commandParams[key] = this.replaceParams(commandParams[key], params);
    }

    return {
      tool: step.action,
      params: commandParams,
    };
  }

  /**
   * Build CSS selector from locator
   */
  private buildSelector(locator: { type: string; value: string }): string {
    switch (locator.type) {
      case 'css':
        return locator.value;

      case 'xpath':
        return locator.value; // XPath handled separately in execution

      case 'text':
        return `text=${locator.value}`;

      case 'role':
        return `role=${locator.value}`;

      case 'placeholder':
        return `[placeholder="${locator.value}"]`;

      case 'label':
        return `label:has-text("${locator.value}")`;

      case 'testId':
        return `[data-testid="${locator.value}"]`;

      default:
        return locator.value;
    }
  }

  /**
   * Execute all steps in a template
   */
  async executeSteps(
    steps: TemplateStep[],
    sessionId?: string,
    params: Record<string, unknown> = {},
    backend: string = 'legacy',
  ): Promise<ExecutionResult[]> {
    this.logger.log(`Executing ${steps.length} steps for session ${sessionId}`);
    this.logger.debug(`Steps: ${JSON.stringify(steps)}, Params: ${JSON.stringify(params)}`);
    const commands = steps.map((step) => this.mapStepToCommand(step, params));
    this.logger.log(`Mapped commands: ${JSON.stringify(commands)}`);

    try {
      const initResult = await this.postJson<{ success: boolean; message?: string }>('/browser/init', {
        runtimeSessionId: sessionId,
        backend,
      });
      if (!initResult.success) {
        throw new Error(initResult.message || 'Failed to initialize browser');
      }

      const result = await this.postJson<{
        success: boolean;
        results: Array<Record<string, unknown>>;
        message?: string;
      }>('/browser/execute', {
        runtimeSessionId: sessionId,
        backend,
        commands,
      });

      this.logger.log(`Execution result: ${JSON.stringify(result)}`);

      if (Array.isArray(result.results)) {
        return result.results.map((r: any, i: number) => ({
          success: r.status !== 'error',
          step_id: steps[i]?.step_id || `step-${i + 1}`,
          action: r.command || steps[i]?.action,
          error: r.status === 'error' ? r.message : undefined,
          message: r.message || r.stdout,
          screenshot: r.screenshot,
          text: r.data?.text || r.text,
          html: r.html || r.stdout,
        }));
      }

      return steps.map((step) => ({
        success: false,
        step_id: step.step_id,
        error: result.message || 'Execution failed',
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Execution failed: ${errorMsg}`);

      return [{
        success: false,
        step_id: 'all',
        error: errorMsg,
      }];
    }
  }

  async captureFinalState(
    sessionId?: string,
    backend: string = 'legacy',
  ): Promise<ExecutionResult> {
    try {
      const result = await this.postJson<{
        success: boolean;
        results: Array<Record<string, unknown>>;
        message?: string;
      }>('/browser/execute', {
        runtimeSessionId: sessionId,
        backend,
        commands: [
          {
            tool: 'read_page',
            params: { max_length: 4000 },
          },
          {
            tool: 'screenshot',
            params: {},
          },
        ],
      });

      const rawPage: any = result.results?.[0] || {};
      const rawPageData: any = rawPage.data || {};
      const rawScreenshot: any = result.results?.[1] || {};
      const pageSuccess = rawPage.status !== 'error';
      const screenshotSuccess = !rawScreenshot?.status || rawScreenshot.status !== 'error';
      return {
        success: pageSuccess,
        step_id: 'final_state',
        action: 'final_state',
        error: pageSuccess
          ? undefined
          : String(
              rawPage.message ||
                rawScreenshot.message ||
                result.message ||
                'Final state capture failed',
            ),
        message: String(rawPage.message || rawPage.stdout || result.message || ''),
        screenshot:
          screenshotSuccess && typeof rawScreenshot.screenshot === 'string'
            ? rawScreenshot.screenshot
            : (typeof rawPage.screenshot === 'string' ? rawPage.screenshot : undefined),
        text:
          typeof rawPageData.text === 'string'
            ? rawPageData.text
            : (typeof rawPage.text === 'string' ? rawPage.text : undefined),
        html:
          typeof rawPage.html === 'string'
            ? rawPage.html
            : (typeof rawPage.stdout === 'string' ? rawPage.stdout : undefined),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Final state capture failed: ${errorMsg}`);
      return {
        success: false,
        step_id: 'final_state',
        action: 'final_state',
        error: errorMsg,
      };
    }
  }

  /**
   * Close browser connection (stop codegen)
   */
  async closeBrowser(sessionId?: string): Promise<void> {
    try {
      const result = await this.postJson<{ success: boolean }>('/browser/reset', {
        runtimeSessionId: sessionId,
        backend: 'legacy',
      });
      this.logger.log(`Browser stopped: ${result.success}`);
    } catch (error) {
      this.logger.warn(`Failed to stop browser: ${error}`);
    }
  }
}
