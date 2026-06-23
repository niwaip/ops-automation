import { Injectable, Logger } from '@nestjs/common';
import { TakeoverTriggerRequest, TakeoverTriggerResponse } from '../../interfaces';
import { getSessionBrokerUrl } from '../../config/service-endpoints';

interface TakeoverResponse {
  state: string;
}

/**
 * Takeover Service
 * Triggers session takeover via Session Broker API
 */
@Injectable()
export class TakeoverService {
  private readonly logger = new Logger(TakeoverService.name);
  private sessionBrokerUrl: string;

  constructor() {
    this.sessionBrokerUrl = getSessionBrokerUrl();
  }

  /**
   * Trigger session takeover
   * Transitions session state from RUNNING to HUMAN_CONTROL
   */
  async triggerTakeover(request: TakeoverTriggerRequest): Promise<TakeoverTriggerResponse> {
    this.logger.warn(`Triggering takeover for session ${request.session_id}: ${request.reason}`);

    try {
      const response = await fetch(
        `${this.sessionBrokerUrl}/session/${request.session_id}/takeover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: request.reason,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Takeover request failed: ${response.status} - ${errorText}`);
        return {
          success: false,
          session_state: 'RUNNING',
          message: `Session Broker returned ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as TakeoverResponse;

      this.logger.log(`Takeover successful for session ${request.session_id}: state=${data.state}`);

      return {
        success: true,
        session_state: data.state ?? 'HUMAN_CONTROL',
        message: `Takeover triggered: ${request.reason}`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to trigger takeover: ${err.message}`);
      return {
        success: false,
        session_state: 'ERROR',
        message: err.message,
      };
    }
  }

  /**
   * Release takeover (continue session)
   * Transitions session state from HUMAN_CONTROL to RUNNING
   */
  async releaseTakeover(sessionId: string, stepId: string): Promise<TakeoverTriggerResponse> {
    this.logger.log(`Releasing takeover for session ${sessionId}, continuing from step ${stepId}`);

    try {
      const response = await fetch(`${this.sessionBrokerUrl}/session/${sessionId}/continue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          step_id: stepId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Continue request failed: ${response.status} - ${errorText}`);
        return {
          success: false,
          session_state: 'HUMAN_CONTROL',
          message: `Session Broker returned ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as TakeoverResponse;

      this.logger.log(`Continue successful for session ${sessionId}: state=${data.state}`);

      return {
        success: true,
        session_state: data.state ?? 'RUNNING',
        message: `Session continued from step ${stepId}`,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to release takeover: ${err.message}`);
      return {
        success: false,
        session_state: 'ERROR',
        message: err.message,
      };
    }
  }

  /**
   * Get session state from Session Broker
   */
  async getSessionState(sessionId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.sessionBrokerUrl}/session/${sessionId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { state?: string };
      return data.state ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Check if session is in takeover state
   */
  async isInTakeoverState(sessionId: string): Promise<boolean> {
    const state = await this.getSessionState(sessionId);
    return state === 'HUMAN_CONTROL';
  }

  /**
   * Set Session Broker URL
   */
  setSessionBrokerUrl(url: string): void {
    this.sessionBrokerUrl = url;
    this.logger.log(`Session Broker URL set to: ${url}`);
  }

  /**
   * Batch trigger takeover for multiple sessions
   */
  async batchTriggerTakeover(
    requests: TakeoverTriggerRequest[]
  ): Promise<TakeoverTriggerResponse[]> {
    const results: TakeoverTriggerResponse[] = [];

    for (const request of requests) {
      const result = await this.triggerTakeover(request);
      results.push(result);
    }

    return results;
  }
}
