import { Injectable, Logger } from '@nestjs/common';
import { DecideFailureRequest, DecideFailureResponse } from '../../interfaces';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';

interface DeciderResponse {
  decision: 'takeover' | 'retry' | 'skip';
  reason: string;
}

interface RecognizeResponse {
  params: Record<string, unknown>;
  confidence: number;
}

/**
 * AI Interaction Service
 * Communicates with AI Orchestrator for failure decisions
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private aiOrchestratorUrl: string;
  private decisionTimeoutMs: number = 5000; // 5 seconds timeout for decisions

  constructor() {
    this.aiOrchestratorUrl = getAiOrchestratorUrl();
  }

  /**
   * Request failure decision from AI Orchestrator
   * Must respond within 5 seconds
   */
  async decideFailure(request: DecideFailureRequest): Promise<DecideFailureResponse> {
    const timeoutPromise = new Promise<DecideFailureResponse>((_, reject) => {
      setTimeout(() => reject(new Error('AI decision timeout')), this.decisionTimeoutMs);
    });

    try {
      const decisionPromise = this.callDecider(request);
      return await Promise.race([decisionPromise, timeoutPromise]);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn(`AI decision failed or timed out: ${err.message}`);
      // Fallback to takeover for safety
      return this.fallbackDecision(request);
    }
  }

  /**
   * Call AI Orchestrator decider endpoint
   */
  private async callDecider(request: DecideFailureRequest): Promise<DecideFailureResponse> {
    try {
      const response = await fetch(`${this.aiOrchestratorUrl}/ai/decide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: request.session_id,
          step_id: request.step_id,
          error_type: request.error_type,
          error_message: request.error_message,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Orchestrator returned ${response.status}`);
      }

      const data = (await response.json()) as DeciderResponse;

      // Validate response
      if (!['takeover', 'retry', 'skip'].includes(data.decision)) {
        throw new Error(`Invalid decision: ${data.decision}`);
      }

      this.logger.log(
        `AI decision for ${request.session_id}/${request.step_id}: ${data.decision} (${data.reason})`
      );

      return {
        decision: data.decision,
        reason: data.reason ?? 'AI Orchestrator decision',
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to call AI Orchestrator: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fallback decision when AI is unavailable
   */
  private fallbackDecision(request: DecideFailureRequest): DecideFailureResponse {
    // Safe default: takeover for unknown situations
    this.logger.warn(`Using fallback decision for ${request.session_id}/${request.step_id}`);

    // Check for known error patterns
    const takeoverErrors = [
      'captcha',
      'mfa',
      'authentication',
      'human_verification',
      'unexpected_ui',
    ];

    const skipErrors = ['optional', 'non_critical'];

    const errorLower = request.error_message.toLowerCase();

    if (takeoverErrors.some((e) => errorLower.includes(e))) {
      return {
        decision: 'takeover',
        reason: `Error pattern indicates human intervention needed: ${request.error_type}`,
      };
    }

    if (skipErrors.some((e) => errorLower.includes(e))) {
      return {
        decision: 'skip',
        reason: `Error pattern indicates non-critical step: ${request.error_type}`,
      };
    }

    // Default to takeover for safety
    return {
      decision: 'takeover',
      reason: `AI unavailable, defaulting to takeover for safety: ${request.error_type}`,
    };
  }

  /**
   * Request parameter recognition from AI Orchestrator
   */
  async recognizeParams(
    templateId: string,
    userInput: string,
    context?: Record<string, unknown>
  ): Promise<RecognizeResponse> {
    try {
      const response = await fetch(`${this.aiOrchestratorUrl}/ai/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          user_input: userInput,
          context,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Orchestrator returned ${response.status}`);
      }

      return (await response.json()) as RecognizeResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to call AI recognize: ${err.message}`);
      return {
        params: {},
        confidence: 0,
      };
    }
  }

  /**
   * Check if AI Orchestrator is available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.aiOrchestratorUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Set AI Orchestrator URL
   */
  setOrchestratorUrl(url: string): void {
    this.aiOrchestratorUrl = url;
    this.logger.log(`AI Orchestrator URL set to: ${url}`);
  }

  /**
   * Set decision timeout
   */
  setDecisionTimeout(timeoutMs: number): void {
    this.decisionTimeoutMs = timeoutMs;
    this.logger.log(`Decision timeout set to: ${timeoutMs}ms`);
  }
}
