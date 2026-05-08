import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../lock/redis.service';
import { LockService } from '../lock/lock.service';
import { AllocationService } from '../allocation/allocation.service';
import { FreezeService } from '../freeze/freeze.service';
import { TemplateClient, TemplateParamsSchema } from '../template/template.client';
import { CdpExecutor, TemplateStep } from '../execution/cdp.executor';
import {
  Session,
  SessionState,
  ControlMode,
  CreateSessionRequest,
  CreateSessionResponse,
  StartSessionRequest,
  TakeoverSessionRequest,
  ContinueSessionRequest,
  WorkerEndpoints,
} from '../../interfaces';

// Session TTL: 86400 seconds (24 hours)
const SESSION_TTL_SECONDS = 86400;
const STEP_MESSAGE_MAX_LENGTH = 12000;
const STEP_TEXT_MAX_LENGTH = 12000;
const STEP_HTML_MAX_LENGTH = 120000;

// Step result interface
export interface StepResult {
  step_id: string;
  step_index: number;
  action: string;
  success: boolean;
  error?: string;
  message?: string;
  screenshot?: string;
  text?: string;
  html?: string;
  timestamp: number;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly lockService: LockService,
    private readonly allocationService: AllocationService,
    private readonly freezeService: FreezeService,
    private readonly templateClient: TemplateClient,
    private readonly cdpExecutor: CdpExecutor,
  ) {}

  private buildParamDefaultBindingMap(
    paramsSchema?: TemplateParamsSchema,
    requestParams: Record<string, unknown> = {},
  ): Map<string, string> {
    const candidates = new Map<string, string[]>();
    const properties = paramsSchema?.properties || {};

    for (const [paramName, schema] of Object.entries(properties)) {
      if (requestParams[paramName] === undefined || schema.default === undefined) {
        continue;
      }

      for (const bindingKey of this.toBindingKeys(schema.default)) {
        const paramNames = candidates.get(bindingKey) || [];
        paramNames.push(paramName);
        candidates.set(bindingKey, paramNames);
      }
    }

    const bindingMap = new Map<string, string>();
    for (const [bindingKey, paramNames] of candidates.entries()) {
      if (paramNames.length === 1) {
        bindingMap.set(bindingKey, paramNames[0]);
      }
    }

    return bindingMap;
  }

  private toBindingKeys(value: unknown): string[] {
    if (value === null) {
      return ['null'];
    }

    if (Array.isArray(value) || typeof value === 'object') {
      return [`json:${JSON.stringify(value)}`];
    }

    const keys = [`strict:${typeof value}:${String(value)}`];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      keys.push(`scalar:${String(value)}`);
    }
    return [...new Set(keys)];
  }

  private rewriteLegacyTemplateValue(value: unknown, bindingMap: Map<string, string>): unknown {
    if (typeof value === 'string') {
      if (value.includes('${')) {
        return value;
      }

      const paramName = this.toBindingKeys(value)
        .map((key) => bindingMap.get(key))
        .find((binding) => Boolean(binding));
      return paramName ? `\${${paramName}}` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      const paramName = this.toBindingKeys(value)
        .map((key) => bindingMap.get(key))
        .find((binding) => Boolean(binding));
      return paramName ? `\${${paramName}}` : value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.rewriteLegacyTemplateValue(item, bindingMap));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [
          key,
          this.rewriteLegacyTemplateValue(entryValue, bindingMap),
        ]),
      );
    }

    return value;
  }

  private normalizeTemplateSteps(
    steps: TemplateStep[],
    paramsSchema?: TemplateParamsSchema,
    requestParams: Record<string, unknown> = {},
  ): TemplateStep[] {
    const bindingMap = this.buildParamDefaultBindingMap(paramsSchema, requestParams);
    if (bindingMap.size === 0) {
      return steps;
    }

    return steps.map((step) => ({
      ...step,
      params: step.params
        ? (this.rewriteLegacyTemplateValue(step.params, bindingMap) as Record<string, unknown>)
        : step.params,
    }));
  }

  private truncateField(value: string | undefined, maxLength: number, suffix: string): string | undefined {
    if (!value || value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}\n${suffix}`;
  }

  private compactHtml(html?: string): string | undefined {
    if (!html) {
      return html;
    }

    const sanitized = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, 'data:image/omitted;base64,[truncated]');

    if (sanitized.length <= STEP_HTML_MAX_LENGTH) {
      return sanitized;
    }

    return `${sanitized.slice(0, STEP_HTML_MAX_LENGTH)}\n<!-- html truncated -->`;
  }

  private compactStepResult(step: StepResult): StepResult {
    return {
      ...step,
      message: this.truncateField(step.message, STEP_MESSAGE_MAX_LENGTH, '[message truncated]'),
      text: this.truncateField(step.text, STEP_TEXT_MAX_LENGTH, '[text truncated]'),
      html: this.compactHtml(step.html),
    };
  }

  /**
   * Create a new session
   * 1. Acquire profile write lock
   * 2. Allocate worker
   * 3. Create session state in Redis
   * 4. Return session and endpoints
   */
  async createSession(request: CreateSessionRequest): Promise<CreateSessionResponse> {
    const sessionId = uuidv4();
    const now = Date.now();

    // Step 1: Try to acquire profile write lock (disabled for dev - no 409 limit)
    // const lockResult = await this.lockService.acquireProfileLock(request.user_id, sessionId);
    // if (!lockResult.success) {
    //   throw new ConflictException(
    //     `User ${request.user_id} already has an active session. Lock held by another session.`,
    //   );
    // }

    // Step 2: Allocate a worker
    const workerInfo = await this.allocationService.allocateWorker(sessionId, request.user_id);

    if (!workerInfo) {
      // No workers available - release lock and throw error
      await this.lockService.releaseProfileLock(request.user_id, sessionId);
      throw new BadRequestException('No available workers in pool');
    }

    // Step 3: Create session state in Redis
    const sessionKey = `session:${sessionId}`;
    const sessionData: Record<string, string> = {
      state: 'IDLE',
      user_id: request.user_id,
      worker_ref: workerInfo.worker_id,
      frozen: '0',
      control_mode: 'AGENT_RUNNING',
      created_at: String(now),
      last_activity: String(now),
    };

    // Add template and params if provided
    if (request.template_id) {
      sessionData.template_id = request.template_id;
    }
    if (request.params) {
      sessionData.params = JSON.stringify(request.params);
    }

    // Add endpoints
    if (workerInfo.endpoints) {
      if (workerInfo.endpoints.novnc) {
        sessionData.novnc_url = workerInfo.endpoints.novnc;
      }
      sessionData.cdp_url = workerInfo.endpoints.cdp;
      if (workerInfo.endpoints.vnc) {
        sessionData.vnc_url = workerInfo.endpoints.vnc;
      }
    }

    await this.redisService.hmset(sessionKey, sessionData);
    await this.redisService.expire(sessionKey, SESSION_TTL_SECONDS);

    // Step 4: Create session token tracking
    const tokenKey = `token:session:${sessionId}`;
    await this.redisService.set(tokenKey, request.user_id, 7200);

    this.logger.log(`Session created: session=${sessionId}, user=${request.user_id}, worker=${workerInfo.worker_id}`);

    // Note: Browser will be started when session is started (not at creation time)
    // This allows user to connect to noVNC first and see the browser when execution begins

    // Build response
    const session: Session = {
      id: sessionId,
      user_id: request.user_id,
      state: 'IDLE' as SessionState,
      control_mode: 'AGENT_RUNNING' as ControlMode,
      frozen: false,
      worker_ref: workerInfo.worker_id,
      endpoints: workerInfo.endpoints!,
      template_id: request.template_id,
      params: request.params,
      created_at: now,
      last_activity: now,
    };

    return {
      session,
      endpoints: workerInfo.endpoints!,
    };
  }

  /**
   * Start session execution (transition IDLE -> RUNNING)
   */
  async startSession(sessionId: string, request: StartSessionRequest): Promise<Session> {
    const sessionKey = `session:${sessionId}`;

    // Get current session state
    const currentSession = await this.getSessionFromRedis(sessionId);
    if (!currentSession) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Check if session is in IDLE state
    if (currentSession.state !== 'IDLE') {
      throw new BadRequestException(`Session ${sessionId} is not in IDLE state. Current state: ${currentSession.state}`);
    }

    // Get template and execute all steps
    const template = await this.templateClient.getTemplate(request.template_id);
    const totalSteps = template?.steps?.length || 0;
    const rawExecutionBackend = typeof template?.config?.backend === 'string'
      ? template.config.backend
      : 'cli';
    const executionBackend = rawExecutionBackend === 'legacy' ? 'cli' : rawExecutionBackend;

    if (template && template.steps && template.steps.length > 0) {
      const normalizedSteps = this.normalizeTemplateSteps(
        template.steps as TemplateStep[],
        template.params_schema,
        request.params || {},
      );

      // Execute all steps with parameter substitution
      this.logger.log(`Executing ${template.steps.length} steps for session ${sessionId} with params: ${JSON.stringify(request.params)}`);

      const results = await this.cdpExecutor.executeSteps(
        normalizedSteps,
        sessionId,
        request.params || {},
        executionBackend,
      );

      const finalStateResult = await this.cdpExecutor.captureFinalState(
        sessionId,
        executionBackend,
      );
      if (finalStateResult.success || finalStateResult.screenshot || finalStateResult.html || finalStateResult.text) {
        results.push(finalStateResult);
      }

      // Store step results in Redis
      const stepsKey = `session:${sessionId}:steps`;
      const stepResults: StepResult[] = results.map((r, i) => ({
        step_id: r.step_id,
        step_index: i,
        action: r.action || normalizedSteps[i].action,
        success: r.success,
        error: r.error,
        message: r.message,
        screenshot: r.screenshot,
        text: r.text,
        html: r.html,
        timestamp: Date.now(),
      })).map((step) => this.compactStepResult(step));
      await this.redisService.set(stepsKey, JSON.stringify(stepResults), SESSION_TTL_SECONDS);

      const failedSteps = results.filter(r => !r.success);
      if (failedSteps.length > 0) {
        this.logger.warn(`Some steps failed: ${failedSteps.map(s => s.step_id).join(', ')}`);
        // Update session state to ERROR if any step failed
        const lastFailedStep = failedSteps[failedSteps.length - 1];
        const lastStepIndex = results.findIndex(r => r.step_id === lastFailedStep.step_id);

        await this.redisService.hmset(sessionKey, {
          state: 'ERROR',
          template_id: request.template_id,
          params: JSON.stringify(request.params),
          current_step: lastFailedStep.step_id,
          step_index: String(lastStepIndex >= 0 ? lastStepIndex : results.length - 1),
          last_activity: String(Date.now()),
        });

        this.logger.error(`Session ${sessionId} failed at step ${lastFailedStep.step_id}`);
        if (currentSession.worker_ref) {
          await this.allocationService.releaseWorker(currentSession.worker_ref);
        }
      } else {
        this.logger.log(`All ${results.length} steps completed successfully`);
        // Update session state to CLOSED after all steps completed
        await this.redisService.hmset(sessionKey, {
          state: 'CLOSED',
          template_id: request.template_id,
          params: JSON.stringify(request.params),
          current_step: finalStateResult.success ? 'final_state' : `step_${totalSteps - 1}`,
          step_index: String(finalStateResult.success ? results.length - 1 : totalSteps - 1),
          last_activity: String(Date.now()),
        });

        this.logger.log(`Session ${sessionId} completed all ${results.length} recorded steps`);
        if (currentSession.worker_ref) {
          await this.allocationService.releaseWorker(currentSession.worker_ref);
        }
      }
    } else {
      // No steps to execute, just update state
      await this.redisService.hmset(sessionKey, {
        state: 'RUNNING',
        template_id: request.template_id,
        params: JSON.stringify(request.params),
        current_step: 'step_0',
        step_index: '0',
        last_activity: String(Date.now()),
      });
    }

    this.logger.log(`Session started: session=${sessionId}, template=${request.template_id}`);

    const session = await this.getSessionFromRedis(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found after update`);
    }
    return session;
  }

  /**
   * Takeover session (transition RUNNING -> HUMAN_CONTROL)
   * Freezes CDP input, keeps noVNC input active
   */
  async takeoverSession(sessionId: string, request: TakeoverSessionRequest): Promise<Session> {
    // Get current session state
    const currentSession = await this.getSessionFromRedis(sessionId);
    if (!currentSession) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Check if session is in RUNNING state
    if (currentSession.state !== 'RUNNING') {
      throw new BadRequestException(
        `Session ${sessionId} is not in RUNNING state. Current state: ${currentSession.state}`,
      );
    }

    // Freeze session (atomically updates state, frozen, control_mode)
    const freezeResult = await this.freezeService.freezeSession(sessionId);

    if (!freezeResult.success) {
      throw new BadRequestException(`Failed to freeze session ${sessionId}`);
    }

    if (currentSession.worker_ref) {
      const workerInfo = await this.allocationService.getWorkerInfo(currentSession.worker_ref, true);
      if (workerInfo?.endpoints?.novnc) {
        await this.redisService.hmset(`session:${sessionId}`, {
          novnc_url: workerInfo.endpoints.novnc,
        });
      }
    }

    this.logger.log(`Session takeover: session=${sessionId}, reason=${request.reason}`);

    const session = await this.getSessionFromRedis(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found after update`);
    }
    return session;
  }

  /**
   * Continue session (transition HUMAN_CONTROL -> RUNNING)
   * Unfreezes CDP input, optionally from a specific step
   */
  async continueSession(sessionId: string, request: ContinueSessionRequest): Promise<Session> {
    // Get current session state
    const currentSession = await this.getSessionFromRedis(sessionId);
    if (!currentSession) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Check if session is in HUMAN_CONTROL state
    if (currentSession.state !== 'HUMAN_CONTROL') {
      throw new BadRequestException(
        `Session ${sessionId} is not in HUMAN_CONTROL state. Current state: ${currentSession.state}`,
      );
    }

    // Unfreeze session (atomically updates state, frozen, control_mode)
    const unfreezeResult = await this.freezeService.unfreezeSession(sessionId, request.step_id);

    if (!unfreezeResult.success) {
      throw new BadRequestException(`Failed to unfreeze session ${sessionId}`);
    }

    this.logger.log(`Session continue: session=${sessionId}, step=${request.step_id}`);

    const session = await this.getSessionFromRedis(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found after update`);
    }
    return session;
  }

  /**
   * Delete/close session
   * 1. Release profile write lock
   * 2. Release worker back to pool
   * 3. Update session state to CLOSED
   */
  async deleteSession(sessionId: string): Promise<{ success: boolean }> {
    const sessionKey = `session:${sessionId}`;

    // Get current session state
    const currentSession = await this.getSessionFromRedis(sessionId);
    if (!currentSession) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Release profile lock
    await this.lockService.releaseProfileLock(currentSession.user_id, sessionId);

    // Release worker back to pool
    if (currentSession.worker_ref) {
      await this.allocationService.releaseWorker(currentSession.worker_ref);
    }

    // Update session state to CLOSED
    await this.redisService.hset(sessionKey, 'state', 'CLOSED');
    await this.redisService.hset(sessionKey, 'last_activity', String(Date.now()));

    // Remove session token
    const tokenKey = `token:session:${sessionId}`;
    await this.redisService.del(tokenKey);

    // Clean up session data keys (SCAN pattern)
    // Note: In production, we'd scan and delete session:data:{sessionId}:* keys

    this.logger.log(`Session closed: session=${sessionId}, lock released, worker released`);

    return { success: true };
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<Session> {
    const session = await this.getSessionFromRedis(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return session;
  }

  /**
   * Check if user has active session (for lock conflict detection)
   */
  async hasActiveSession(userId: string): Promise<boolean> {
    const lockHolder = await this.lockService.checkProfileLock(userId);
    return lockHolder !== null;
  }

  /**
   * Get step results for a session
   */
  async getStepResults(sessionId: string): Promise<StepResult[]> {
    // First check if session exists
    const session = await this.getSessionFromRedis(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Get step results from Redis
    const stepsKey = `session:${sessionId}:steps`;
    const stepsData = await this.redisService.get(stepsKey);

    if (!stepsData) {
      return [];
    }

    try {
      return (JSON.parse(stepsData) as StepResult[]).map((step) => this.compactStepResult(step));
    } catch (e) {
      this.logger.error(`Failed to parse step results for session ${sessionId}`);
      return [];
    }
  }

  /**
   * List sessions with optional filtering
   */
  async listSessions(options: { page?: number; pageSize?: number; status?: string; search?: string }): Promise<{ sessions: Session[]; total: number; page: number; pageSize: number }> {
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const status = options.status;
    const search = options.search?.toLowerCase();

    // Scan all session keys
    const sessionKeys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redisService.scan(cursor, 'session:*', 100);
      cursor = result.cursor;
      sessionKeys.push(...result.keys);
    } while (cursor !== '0');

    // Filter out non-session keys (like session:*:steps)
    const filteredKeys = sessionKeys.filter(key => {
      const parts = key.split(':');
      return parts.length === 2; // Only session:{id} keys
    });

    // Get all sessions
    const sessions: Session[] = [];
    for (const key of filteredKeys) {
      const sessionId = key.replace('session:', '');
      try {
        const session = await this.getSessionFromRedis(sessionId);
        if (session) {
          // Apply filters
          if (status && session.state !== status) {
            continue;
          }
          if (search) {
            const searchStr = `${session.id} ${session.template_id || ''} ${session.user_id}`.toLowerCase();
            if (!searchStr.includes(search)) {
              continue;
            }
          }
          sessions.push(session);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Skipping invalid session ${sessionId}: ${errorMsg}`);
      }
    }

    // Sort by created_at descending
    sessions.sort((a, b) => b.created_at - a.created_at);

    // Paginate
    const total = sessions.length;
    const start = (page - 1) * pageSize;
    const paginatedSessions = sessions.slice(start, start + pageSize);

    return {
      sessions: paginatedSessions,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Helper: Get session data from Redis and convert to Session object
   */
  private async getSessionFromRedis(sessionId: string): Promise<Session | null> {
    const sessionKey = `session:${sessionId}`;
    const data = await this.redisService.hgetall(sessionKey);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Build endpoints
    const endpoints: WorkerEndpoints | undefined = data.cdp_url
      ? {
          cdp: data.cdp_url || '',
          novnc: data.novnc_url || undefined,
          vnc: data.vnc_url,
        }
      : undefined;

    // Parse params if exists, but tolerate malformed historical data.
    let params: Record<string, unknown> | undefined;
    if (data.params) {
      try {
        params = JSON.parse(data.params) as Record<string, unknown>;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to parse params for session ${sessionId}: ${errorMsg}`);
      }
    }

    return {
      id: sessionId,
      user_id: data.user_id || '',
      state: data.state as SessionState,
      control_mode: (data.control_mode || 'AGENT_RUNNING') as ControlMode,
      frozen: data.frozen === '1',
      worker_ref: data.worker_ref,
      endpoints,
      template_id: data.template_id,
      params,
      current_step: data.current_step,
      step_index: data.step_index ? parseInt(data.step_index, 10) : undefined,
      created_at: parseInt(data.created_at || '0', 10),
      last_activity: parseInt(data.last_activity || '0', 10),
    };
  }

  /**
   * Set session to ERROR state
   */
  async setErrorState(sessionId: string, errorMessage: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;
    await this.redisService.hmset(sessionKey, {
      state: 'ERROR',
      last_activity: String(Date.now()),
    });

    // Store error in session data
    const errorKey = `session:data:${sessionId}:last_error`;
    await this.redisService.set(errorKey, JSON.stringify({ class: 'SessionError', message: errorMessage }), 3600);

    this.logger.error(`Session error: session=${sessionId}, error=${errorMessage}`);
  }
}
