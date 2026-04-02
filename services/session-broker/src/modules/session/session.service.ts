import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../lock/redis.service';
import { LockService } from '../lock/lock.service';
import { AllocationService } from '../allocation/allocation.service';
import { FreezeService } from '../freeze/freeze.service';
import { TemplateClient } from '../template/template.client';
import { CdpExecutor } from '../execution/cdp.executor';
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
    const workerInfo = await this.allocationService.allocateWorker(sessionId);

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
      sessionData.novnc_url = workerInfo.endpoints.novnc;
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

    // Get template and execute first step
    const template = await this.templateClient.getTemplate(request.template_id);
    if (template && template.steps && template.steps.length > 0) {
      const firstStep = template.steps[0];

      // Execute navigate action
      if (firstStep.action === 'navigate' && firstStep.params?.url) {
        const url = firstStep.params.url as string;
        this.logger.log(`Executing first step: navigate to ${url}`);

        const result = await this.cdpExecutor.navigateToUrl(url, sessionId);
        if (!result.success) {
          this.logger.warn(`Failed to navigate: ${result.error}`);
        }
      }
    }

    // Update session state
    await this.redisService.hmset(sessionKey, {
      state: 'RUNNING',
      template_id: request.template_id,
      params: JSON.stringify(request.params),
      current_step: 'step_0',
      step_index: '0',
      last_activity: String(Date.now()),
    });

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
   * Helper: Get session data from Redis and convert to Session object
   */
  private async getSessionFromRedis(sessionId: string): Promise<Session | null> {
    const sessionKey = `session:${sessionId}`;
    const data = await this.redisService.hgetall(sessionKey);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Build endpoints
    const endpoints: WorkerEndpoints | undefined = data.novnc_url ? {
      novnc: data.novnc_url,
      cdp: data.cdp_url || '',
      vnc: data.vnc_url,
    } : undefined;

    // Parse params if exists
    const params = data.params ? JSON.parse(data.params) : undefined;

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