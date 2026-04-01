import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../lock/redis.service';

// Lua script for freeze check and set
const FREEZE_SET_SCRIPT = `
local frozen = redis.call('HGET', KEYS[1], 'frozen')
if frozen == '0' then
    redis.call('HSET', KEYS[1], 'frozen', '1')
    redis.call('HSET', KEYS[1], 'control_mode', 'HUMAN_CONTROL')
    redis.call('HSET', KEYS[1], 'state', 'HUMAN_CONTROL')
    return 1
else
    return 0
end
`;

// Lua script for unfreeze check and set
const UNFREEZE_SET_SCRIPT = `
local frozen = redis.call('HGET', KEYS[1], 'frozen')
if frozen == '1' then
    redis.call('HSET', KEYS[1], 'frozen', '0')
    redis.call('HSET', KEYS[1], 'control_mode', 'AGENT_RUNNING')
    redis.call('HSET', KEYS[1], 'state', 'RUNNING')
    return 1
else
    return 0
end
`;

export interface FreezeResult {
  success: boolean;
  previousState: string;
  newState: string;
  frozen: boolean;
}

@Injectable()
export class FreezeService {
  private readonly logger = new Logger(FreezeService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Freeze session - disable CDP input, keep noVNC input
   * Transitions state: RUNNING -> HUMAN_CONTROL
   * Sets frozen flag: 0 -> 1
   * Sets control_mode: AGENT_RUNNING -> HUMAN_CONTROL
   */
  async freezeSession(sessionId: string): Promise<FreezeResult> {
    const sessionKey = `session:${sessionId}`;

    // Get current state before freeze
    const currentState = await this.redisService.hget(sessionKey, 'state') || 'UNKNOWN';
    const currentFrozen = await this.redisService.hget(sessionKey, 'frozen') || '0';

    // Execute freeze script atomically
    const result = await this.redisService.eval(FREEZE_SET_SCRIPT, [sessionKey], []);

    if (result === 1) {
      this.logger.log(`Session frozen: session=${sessionId}`);

      // TODO: Send signal to worker to freeze CDP input
      // This would typically call the browser-worker service to:
      // - Disable CDP input interception
      // - Keep noVNC input active
      await this.sendFreezeSignal(sessionId);

      return {
        success: true,
        previousState: currentState,
        newState: 'HUMAN_CONTROL',
        frozen: true,
      };
    }

    this.logger.warn(`Session not frozen (already frozen or not exists): session=${sessionId}`);
    return {
      success: false,
      previousState: currentState,
      newState: currentState,
      frozen: currentFrozen === '1',
    };
  }

  /**
   * Unfreeze session - enable CDP input
   * Transitions state: HUMAN_CONTROL -> RUNNING
   * Sets frozen flag: 1 -> 0
   * Sets control_mode: HUMAN_CONTROL -> AGENT_RUNNING
   */
  async unfreezeSession(sessionId: string, stepId?: string): Promise<FreezeResult> {
    const sessionKey = `session:${sessionId}`;

    // Get current state before unfreeze
    const currentState = await this.redisService.hget(sessionKey, 'state') || 'UNKNOWN';
    const currentFrozen = await this.redisService.hget(sessionKey, 'frozen') || '0';

    // Execute unfreeze script atomically
    const result = await this.redisService.eval(UNFREEZE_SET_SCRIPT, [sessionKey], []);

    if (result === 1) {
      this.logger.log(`Session unfrozen: session=${sessionId}`);

      // Update current step if provided
      if (stepId) {
        await this.redisService.hset(sessionKey, 'current_step', stepId);
      }

      // Update last activity
      await this.redisService.hset(sessionKey, 'last_activity', String(Date.now()));

      // TODO: Send signal to worker to unfreeze CDP input
      await this.sendUnfreezeSignal(sessionId);

      return {
        success: true,
        previousState: currentState,
        newState: 'RUNNING',
        frozen: false,
      };
    }

    this.logger.warn(`Session not unfrozen (not frozen or not exists): session=${sessionId}`);
    return {
      success: false,
      previousState: currentState,
      newState: currentState,
      frozen: currentFrozen === '1',
    };
  }

  /**
   * Check if session is frozen
   */
  async isFrozen(sessionId: string): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    const frozen = await this.redisService.hget(sessionKey, 'frozen');
    return frozen === '1';
  }

  /**
   * Get freeze state details
   */
  async getFreezeState(sessionId: string): Promise<{
    frozen: boolean;
    state: string;
    control_mode: string;
  }> {
    const sessionKey = `session:${sessionId}`;
    const state = await this.redisService.hget(sessionKey, 'state') || 'UNKNOWN';
    const frozen = await this.redisService.hget(sessionKey, 'frozen') || '0';
    const controlMode = await this.redisService.hget(sessionKey, 'control_mode') || 'AGENT_RUNNING';

    return {
      frozen: frozen === '1',
      state,
      control_mode: controlMode,
    };
  }

  /**
   * Send freeze signal to worker (placeholder for actual implementation)
   * In production, this would call browser-worker API to disable CDP input
   */
  private async sendFreezeSignal(sessionId: string): Promise<void> {
    // TODO: Implement actual worker API call
    // Example: await this.workerClient.freezeCDPInput(sessionId);
    this.logger.debug(`Freeze signal sent to worker for session ${sessionId}`);
  }

  /**
   * Send unfreeze signal to worker (placeholder for actual implementation)
   * In production, this would call browser-worker API to enable CDP input
   */
  private async sendUnfreezeSignal(sessionId: string): Promise<void> {
    // TODO: Implement actual worker API call
    // Example: await this.workerClient.unfreezeCDPInput(sessionId);
    this.logger.debug(`Unfreeze signal sent to worker for session ${sessionId}`);
  }
}