import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as http from 'http';

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
}

@Injectable()
export class CdpExecutor implements OnModuleDestroy {
  private readonly logger = new Logger(CdpExecutor.name);

  // Codegen API endpoint in browser-chrome container
  private readonly codegenHost = process.env.CDP_HOST || 'ops-browser-chrome';
  private readonly codegenPort = parseInt(process.env.CODEGEN_API_PORT || '3000', 10);

  async onModuleDestroy() {
    // No persistent browser connection to close
    this.logger.log('CdpExecutor destroyed');
  }

  /**
   * Make HTTP request to codegen API
   */
  private async makeRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      const options = {
        hostname: this.codegenHost,
        port: this.codegenPort,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        this.logger.error(`HTTP request error: ${err.message}`);
        reject(err);
      });

      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Start browser session via codegen API
   */
  async startBrowser(sessionId: string, url: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.log(`Starting browser for session ${sessionId} at ${url}`);

      const result = await this.makeRequest(
        `/start?session=${encodeURIComponent(sessionId)}&url=${encodeURIComponent(url)}`
      );

      if (result.status === 'started') {
        this.logger.log(`Browser started successfully for session ${sessionId}`);
        return { success: true };
      } else {
        this.logger.error(`Failed to start browser: ${result.error || 'Unknown error'}`);
        return { success: false, error: result.error || 'Failed to start browser' };
      }
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

  /**
   * Execute a single step by calling codegen API
   */
  async executeStep(step: TemplateStep, sessionId?: string): Promise<ExecutionResult> {
    this.logger.log(`Executing step ${step.step_id}: ${step.action}`);

    // Map step to action format expected by codegen API
    const action = this.mapStepToAction(step);

    try {
      const result = await this.makeRequest('/execute', 'POST', {
        session: sessionId,
        actions: [action],
      });

      if (result.status === 'completed' && result.results && result.results.length > 0) {
        const stepResult = result.results[0];
        return {
          success: stepResult.success,
          step_id: step.step_id,
          step: stepResult.step,
          action: stepResult.action,
          error: stepResult.success ? undefined : stepResult.message,
          message: stepResult.message,
        };
      } else if (result.error) {
        return {
          success: false,
          step_id: step.step_id,
          error: result.error,
        };
      }

      return { success: true, step_id: step.step_id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Step ${step.step_id} failed: ${errorMsg}`);
      return { success: false, step_id: step.step_id, error: errorMsg };
    }
  }

  /**
   * Map template step to action format for codegen API
   */
  private mapStepToAction(step: TemplateStep): any {
    const action: any = {
      action: step.action,
      step_number: step.step_number || parseInt(step.step_id.replace('step-', ''), 10) || 1,
      on_fail: step.on_fail || 'stop',
    };

    // Copy common fields
    if (step.selector) action.selector = step.selector;
    if (step.target) action.selector = step.target;
    if (step.value) action.value = step.value;
    if (step.url) action.url = step.url;
    if (step.text) action.value = step.text;
    if (step.key) action.key = step.key;
    if (step.duration) action.duration = step.duration;
    if (step.direction) action.direction = step.direction;
    if (step.amount) action.amount = step.amount;

    // Handle locator
    if (step.locator) {
      action.selector = this.buildSelector(step.locator);
    }

    // Handle params
    if (step.params) {
      Object.assign(action, step.params);
      if (step.params.url) action.url = step.params.url;
      if (step.params.value) action.value = step.params.value;
      if (step.params.text) action.value = step.params.text;
      if (step.params.selector) action.selector = step.params.selector;
      if (step.params.target) action.selector = step.params.target;
    }

    // Handle wait
    if (step.wait) {
      action.wait_type = step.wait.type;
      action.wait_value = step.wait.value;
      action.timeout = step.wait.timeout;
    }

    return action;
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
  async executeSteps(steps: TemplateStep[], sessionId?: string): Promise<ExecutionResult[]> {
    this.logger.log(`Executing ${steps.length} steps for session ${sessionId}`);

    // Map all steps to actions format
    const actions = steps.map((step, index) => ({
      ...this.mapStepToAction(step),
      step_number: step.step_number || index + 1,
    }));

    try {
      // Send all actions in one request
      const result = await this.makeRequest('/execute', 'POST', {
        session: sessionId,
        actions: actions,
      });

      if (result.status === 'completed' && result.results) {
        return result.results.map((r: any, i: number) => ({
          success: r.success,
          step_id: steps[i]?.step_id || `step-${i + 1}`,
          step: r.step,
          action: r.action,
          error: r.success ? undefined : r.message,
          message: r.message,
        }));
      } else if (result.error) {
        // All steps failed
        return steps.map((step) => ({
          success: false,
          step_id: step.step_id,
          error: result.error,
        }));
      }

      return steps.map((step) => ({ success: true, step_id: step.step_id }));
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

  /**
   * Close browser connection (stop codegen)
   */
  async closeBrowser(sessionId?: string): Promise<void> {
    try {
      const result = await this.makeRequest('/stop');
      this.logger.log(`Browser stopped: ${result.status}`);
    } catch (error) {
      this.logger.warn(`Failed to stop browser: ${error}`);
    }
  }
}