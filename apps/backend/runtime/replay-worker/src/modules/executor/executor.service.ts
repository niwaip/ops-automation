import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CdpService } from '../cdp';
import { LogService } from '../log';
import { RetryService } from '../retry';
import { AiService } from '../ai-interaction';
import { TakeoverService } from '../takeover';
import { TemplateStep, TemplateInfo, ExecutionState, StepResult, Locator } from '../../interfaces';
import { getBrowserTemplateServiceUrl } from '../../config/service-endpoints';

/**
 * Default step timeout in milliseconds
 */
const DEFAULT_STEP_TIMEOUT_MS = 30000;

/**
 * Step Executor Service
 * Executes template steps sequentially with retry handling
 */
@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);
  private executions: Map<string, ExecutionState> = new Map();
  private templateCache: Map<string, TemplateInfo> = new Map();

  constructor(
    private readonly cdpService: CdpService,
    private readonly logService: LogService,
    retryService: RetryService,
    private readonly aiService: AiService,
    private readonly takeoverService: TakeoverService
  ) {
    // RetryService is injected for future use
    void retryService;
  }

  /**
   * Start a new execution
   */
  async startExecution(
    sessionId: string,
    templateId: string,
    params: Record<string, unknown>,
    cdpUrl: string
  ): Promise<string> {
    const executionId = uuidv4();

    // Fetch template info
    const template = await this.fetchTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Initialize execution state
    const execution: ExecutionState = {
      execution_id: executionId,
      session_id: sessionId,
      template_id: templateId,
      params,
      status: 'pending',
      current_step_index: 0,
      total_steps: template.steps.length,
      started_at: new Date(),
    };

    this.executions.set(executionId, execution);

    // Connect to CDP
    await this.cdpService.connect(cdpUrl);

    // Start execution in background
    this.logger.log(`Starting execution: ${executionId} for session: ${sessionId}`);
    this.executeTemplate(executionId, template).catch((error) => {
      this.logger.error(`Execution ${executionId} failed:`, error);
    });

    return executionId;
  }

  /**
   * Stop an execution
   */
  async stopExecution(sessionId: string): Promise<boolean> {
    const execution = this.findExecutionBySession(sessionId);
    if (!execution) {
      return false;
    }

    execution.status = 'paused';
    this.logger.log(`Execution ${execution.execution_id} stopped`);

    return true;
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId: string): ExecutionState | null {
    return this.executions.get(executionId) ?? null;
  }

  /**
   * Find execution by session ID
   */
  findExecutionBySession(sessionId: string): ExecutionState | null {
    for (const execution of Array.from(this.executions.values())) {
      if (execution.session_id === sessionId) {
        return execution;
      }
    }
    return null;
  }

  /**
   * Execute the template steps
   */
  private async executeTemplate(executionId: string, template: TemplateInfo): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return;
    }

    execution.status = 'running';
    this.logger.log(`Execution ${executionId}: Starting template execution`);

    try {
      for (let i = 0; i < template.steps.length; i++) {
        const step = template.steps[i];
        if (!step) continue;

        // Check if execution is paused or stopped
        if (execution.status !== 'running') {
          this.logger.log(
            `Execution ${executionId}: Stopped at step ${i} with status ${execution.status}`
          );
          return;
        }

        execution.current_step_index = i;

        // Apply parameter substitution to step
        const substitutedStep = this.substituteParams(step, execution.params);

        // Execute step with retry handling
        const result = await this.executeStepWithRetry(execution, substitutedStep, i);

        if (!result.success) {
          // Handle failure
          await this.handleStepFailure(execution, substitutedStep, result, i);
          return;
        }

        this.logger.debug(`Execution ${executionId}: Step ${i} (${step.step_id}) completed`);
      }

      // All steps completed successfully
      execution.status = 'completed';
      execution.completed_at = new Date();
      this.logger.log(`Execution ${executionId}: Template execution completed`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      execution.status = 'failed';
      execution.error = err.message;
      execution.completed_at = new Date();
      this.logger.error(`Execution ${executionId}: Template execution failed: ${err.message}`);
    }
  }

  /**
   * Execute a single step with retry handling
   */
  private async executeStepWithRetry(
    execution: ExecutionState,
    step: TemplateStep,
    stepIndex: number
  ): Promise<StepResult> {
    const startTime = new Date();
    const logId = uuidv4();
    let retryCount = 0;
    const maxRetries = step.retry?.max_attempts ?? 3;
    const retryDelay = step.retry?.delay_ms ?? 1000;
    let lastResult: StepResult | null = null;

    // Create initial log entry
    await this.logService.createLogEntry({
      id: logId,
      session_id: execution.session_id,
      step_id: step.step_id,
      step_index: stepIndex,
      action: step.action,
      locator_type: step.locator?.type,
      locator_value: step.locator?.value,
      locator_summary: this.getLocatorSummary(step.locator),
      started_at: startTime,
      result: 'success',
      retry_count: 0,
      takeover_triggered: false,
      context: { execution_id: execution.execution_id },
    });

    // Try executing the step
    while (retryCount <= maxRetries) {
      const result = await this.cdpService.execute(
        step.action,
        step.locator,
        this.buildActionParams(step),
        step.wait?.type === 'timeout' ? (step.wait.value as number) : DEFAULT_STEP_TIMEOUT_MS
      );
      lastResult = result;

      // Run assertions if defined
      if (step.assertions && result.success) {
        const assertionResults = await this.cdpService.runAssertions(
          step.assertions,
          DEFAULT_STEP_TIMEOUT_MS
        );
        const allPassed = assertionResults.every((a) => a.passed);
        result.success = allPassed;
        if (!allPassed) {
          result.error_message =
            'Assertion failed: ' + assertionResults.find((a) => !a.passed)?.type;
        }
      }

      if (result.success) {
        // Update log entry with success
        await this.logService.updateLogEntry(logId, {
          completed_at: new Date(),
          duration_ms: result.duration_ms,
          result: 'success',
          screenshot_ref: result.screenshot_ref,
        });
        return result;
      }

      // Step failed
      retryCount++;
      this.logger.warn(
        `Execution ${execution.execution_id}: Step ${stepIndex} failed, retry ${retryCount}/${maxRetries}`
      );

      if (retryCount <= maxRetries) {
        // Update log entry with retry info
        await this.logService.updateLogEntry(logId, {
          retry_count: retryCount,
          retry_reason: result.error_message,
        });

        // Wait before retry
        await this.delay(retryDelay);
      }
    }

    // All retries exhausted - need AI decision
    const aiDecision = await this.aiService.decideFailure({
      session_id: execution.session_id,
      step_id: step.step_id,
      error_type: 'step_execution_failed',
      error_message: `Step ${step.step_id} failed after ${maxRetries} retries`,
    });

    const finalErrorMessage = lastResult?.error_message ?? 'Unknown error';

    // Update log entry with final result
    await this.logService.updateLogEntry(logId, {
      completed_at: new Date(),
      duration_ms: Date.now() - startTime.getTime(),
      result: aiDecision.decision === 'retry' ? 'retry' : 'failed',
      error_class: 'StepExecutionError',
      error_message: finalErrorMessage,
      retry_count: retryCount,
    });

    // If AI decided to takeover, trigger it
    if (aiDecision.decision === 'takeover') {
      await this.takeoverService.triggerTakeover({
        session_id: execution.session_id,
        step_id: step.step_id,
        reason: aiDecision.reason,
        error_class: 'StepExecutionError',
        error_message: finalErrorMessage,
      });

      await this.logService.updateLogEntry(logId, {
        takeover_triggered: true,
        takeover_reason: aiDecision.reason,
      });

      execution.status = 'takeover';
    }

    return {
      success: false,
      action: step.action,
      locator: step.locator,
      duration_ms: Date.now() - startTime.getTime(),
      error_class: 'StepExecutionError',
      error_message: finalErrorMessage,
    };
  }

  /**
   * Handle step failure based on on_fail action
   */
  private async handleStepFailure(
    execution: ExecutionState,
    step: TemplateStep,
    result: StepResult,
    stepIndex: number
  ): Promise<void> {
    const onFail = step.on_fail ?? 'stop';

    this.logger.warn(
      `Execution ${execution.execution_id}: Step ${stepIndex} failed with on_fail=${onFail}`
    );

    if (onFail === 'skip') {
      // Continue to next step
      this.logger.log(`Execution ${execution.execution_id}: Skipping step ${stepIndex}`);
      return;
    }

    if (onFail === 'takeover') {
      await this.takeoverService.triggerTakeover({
        session_id: execution.session_id,
        step_id: step.step_id,
        reason: 'Step failed with on_fail=takeover',
        error_class: result.error_class,
        error_message: result.error_message,
      });
      execution.status = 'takeover';
      return;
    }

    // Default: stop execution
    execution.status = 'failed';
    execution.error = result.error_message ?? 'Step execution failed';
    execution.completed_at = new Date();
  }

  /**
   * Substitute parameters in step
   */
  private substituteParams(step: TemplateStep, params: Record<string, unknown>): TemplateStep {
    const substituted = JSON.parse(JSON.stringify(step));

    if (substituted.params) {
      for (const [key, value] of Object.entries(substituted.params)) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
          const paramName = value.slice(2, -1);
          if (params[paramName] !== undefined) {
            substituted.params[key] = params[paramName] as string | number;
          }
        }
      }
    }

    if (substituted.locator?.value && typeof substituted.locator.value === 'string') {
      if (substituted.locator.value.startsWith('${') && substituted.locator.value.endsWith('}')) {
        const paramName = substituted.locator.value.slice(2, -1);
        if (params[paramName] !== undefined) {
          substituted.locator.value = String(params[paramName]);
        }
      }
    }

    return substituted;
  }

  /**
   * Build action params from step
   */
  private buildActionParams(step: TemplateStep): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    if (step.params) {
      params.value = step.params.value;
      params.url = step.params.url;
      params.timeout = step.params.timeout;
      params.option = step.params.option;
      params.checked = step.params.checked;
    }

    if (step.wait) {
      params.wait_type = step.wait.type;
      params.wait_value = step.wait.value;
    }

    return params;
  }

  /**
   * Get locator summary for logging
   */
  private getLocatorSummary(locator?: Locator): string | undefined {
    if (!locator) return undefined;
    return `${locator.type}=${locator.value}`;
  }

  /**
   * Fetch template from Template Service
   */
  private async fetchTemplate(templateId: string): Promise<TemplateInfo | null> {
    // Check cache first
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId)!;
    }

    const templateServiceUrl = getBrowserTemplateServiceUrl();
    try {
      const response = await fetch(`${templateServiceUrl}/templates/${templateId}`);
      if (!response.ok) {
        return null;
      }

      const template = (await response.json()) as TemplateInfo;
      this.templateCache.set(templateId, template);
      return template;
    } catch (error) {
      this.logger.error(`Failed to fetch template ${templateId}:`, error);
      return null;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
