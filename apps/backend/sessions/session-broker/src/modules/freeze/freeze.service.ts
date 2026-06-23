import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import { getBrowserWorkerUrl } from '../../config/service-endpoints';
import { RedisService } from '../lock/redis.service';

export interface FreezeResult {
  success: boolean;
  previousState: string;
  newState: string;
  frozen: boolean;
}

@Injectable()
export class FreezeService {
  private readonly logger = new Logger(FreezeService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl();

  constructor(private readonly redisService: RedisService) {}

  async syncRuntimeControlState(
    sessionId: string,
    state: string,
    controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL',
    reason?: string | null
  ): Promise<void> {
    const runtimeKey = this.getRuntimeControlKey(sessionId);
    const fields: Record<string, string> = {
      state,
      control_mode: controlMode,
      frozen: controlMode === 'HUMAN_CONTROL' ? '1' : '0',
      updated_at: new Date().toISOString(),
    };

    if (reason) {
      fields.reason = reason;
    }

    await this.redisService.hmset(runtimeKey, fields);
  }

  /**
   * Redis only keeps high-frequency runtime control state.
   * PostgreSQL remains the formal RuntimeSession truth source.
   */
  async freezeSession(sessionId: string, reason?: string): Promise<FreezeResult> {
    const runtimeKey = this.getRuntimeControlKey(sessionId);
    const currentState = (await this.redisService.hget(runtimeKey, 'state')) || 'busy';

    await this.syncRuntimeControlState(sessionId, 'frozen', 'HUMAN_CONTROL', reason);
    this.logger.log(`Runtime control frozen: session=${sessionId}`);

    // TODO: Send signal to worker to freeze CDP input
    await this.sendFreezeSignal(sessionId);

    return {
      success: true,
      previousState: currentState,
      newState: 'frozen',
      frozen: true,
    };
  }

  /**
   * Redis keeps the control pointer and current step hint used during resume.
   */
  async unfreezeSession(sessionId: string, stepId?: string): Promise<FreezeResult> {
    const runtimeKey = this.getRuntimeControlKey(sessionId);
    const currentState = (await this.redisService.hget(runtimeKey, 'state')) || 'frozen';

    await this.syncRuntimeControlState(sessionId, 'busy', 'AGENT_RUNNING');
    if (stepId) {
      await this.redisService.hset(runtimeKey, 'current_step', stepId);
    }

    this.logger.log(`Runtime control unfrozen: session=${sessionId}`);

    // TODO: Send signal to worker to unfreeze CDP input
    await this.sendUnfreezeSignal(sessionId);

    return {
      success: true,
      previousState: currentState,
      newState: 'busy',
      frozen: false,
    };
  }

  /**
   * Check if session is frozen
   */
  async isFrozen(sessionId: string): Promise<boolean> {
    const runtimeKey = this.getRuntimeControlKey(sessionId);
    const frozen = await this.redisService.hget(runtimeKey, 'frozen');
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
    const runtimeKey = this.getRuntimeControlKey(sessionId);
    const state = (await this.redisService.hget(runtimeKey, 'state')) || 'unknown';
    const frozen = (await this.redisService.hget(runtimeKey, 'frozen')) || '0';
    const controlMode =
      (await this.redisService.hget(runtimeKey, 'control_mode')) || 'AGENT_RUNNING';

    return {
      frozen: frozen === '1',
      state,
      control_mode: controlMode,
    };
  }

  async clearControlState(sessionId: string): Promise<void> {
    await this.redisService.del(this.getRuntimeControlKey(sessionId));
  }

  /**
   * Send freeze signal to worker (placeholder for actual implementation)
   * In production, this would call browser-worker API to disable CDP input
   */
  private async sendFreezeSignal(sessionId: string): Promise<void> {
    await this.postToBrowserWorker('/browser/freeze', {
      runtimeSessionId: sessionId,
      reason: 'Human takeover requested',
    });
    this.logger.debug(`Freeze signal sent to worker for session ${sessionId}`);
  }

  /**
   * Send unfreeze signal to worker (placeholder for actual implementation)
   * In production, this would call browser-worker API to enable CDP input
   */
  private async sendUnfreezeSignal(sessionId: string): Promise<void> {
    await this.postToBrowserWorker('/browser/resume', {
      runtimeSessionId: sessionId,
    });
    this.logger.debug(`Unfreeze signal sent to worker for session ${sessionId}`);
  }

  private getRuntimeControlKey(sessionId: string): string {
    return `runtime:${sessionId}:control`;
  }

  private async postToBrowserWorker(path: string, payload: Record<string, unknown>): Promise<void> {
    const url = new URL(path, this.browserWorkerUrl);

    await new Promise<void>((resolve) => {
      const request = http.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        (response) => {
          response.on('data', () => undefined);
          response.on('end', () => resolve());
        }
      );

      request.on('error', (error) => {
        this.logger.warn(`Failed to notify browser-worker ${path}: ${error.message}`);
        resolve();
      });

      request.write(JSON.stringify(payload));
      request.end();
    });
  }
}
