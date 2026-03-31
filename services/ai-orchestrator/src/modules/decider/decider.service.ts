import { Injectable } from '@nestjs/common';
import { DecideFailureDTO, DecideFailureResponseDTO, ChatMessage } from '../../interfaces';
import { OpenAICompatibleClient } from '../../client/openai-compatible';

/**
 * Error classification types
 */
type ErrorClassification = 'transient' | 'permanent' | 'human_required' | 'unknown';

/**
 * Failure history record for learning
 */
interface FailureHistoryRecord {
  session_id: string;
  step_id: string;
  error_type: string;
  error_message: string;
  decision: 'takeover' | 'retry' | 'skip';
  outcome: 'success' | 'failed';
  timestamp: Date;
}

/**
 * Decision rules configuration
 */
interface DecisionRules {
  retryable_errors: string[];
  takeover_errors: string[];
  skip_errors: string[];
  max_retries: number;
}

/**
 * Failure Decider Service
 * Makes decisions on how to handle failures during replay execution
 * Must return decision within 5 seconds
 */
@Injectable()
export class DeciderService {
  private defaultClient: OpenAICompatibleClient | null = null;
  private failureHistory: FailureHistoryRecord[] = [];
  private retryCount: Map<string, number> = new Map();
  private defaultRules: DecisionRules = {
    retryable_errors: [
      'timeout',
      'network_error',
      'element_not_found',
      'page_load_failed',
      'stale_element',
    ],
    takeover_errors: [
      'captcha_detected',
      'mfa_required',
      'authentication_failed',
      'human_verification',
      'unexpected_ui_state',
      'unknown_page',
    ],
    skip_errors: [
      'optional_step_failed',
      'assertion_failed_non_critical',
    ],
    max_retries: 3,
  };

  /**
   * Set the default AI client for decision making
   */
  setDefaultClient(client: OpenAICompatibleClient): void {
    this.defaultClient = client;
  }

  /**
   * Update decision rules
   */
  updateRules(rules: Partial<DecisionRules>): void {
    this.defaultRules = { ...this.defaultRules, ...rules };
  }

  /**
   * Decide failure handling strategy
   * Must complete within 5 seconds
   */
  async decideFailure(dto: DecideFailureDTO): Promise<DecideFailureResponseDTO> {
    const timeoutPromise = new Promise<DecideFailureResponseDTO>((_, reject) => {
      setTimeout(() => reject(new Error('Decision timeout')), 5000);
    });

    try {
      const decisionPromise = this.makeDecision(dto);
      return await Promise.race([decisionPromise, timeoutPromise]);
    } catch (error) {
      // Fallback decision on timeout or error
      return this.fallbackDecision(dto);
    }
  }

  /**
   * Make the actual decision
   */
  private async makeDecision(dto: DecideFailureDTO): Promise<DecideFailureResponseDTO> {
    // First check retry count
    const stepKey = `${dto.session_id}:${dto.step_id}`;
    const currentRetries = this.retryCount.get(stepKey) || 0;

    // If max retries exceeded, need different strategy
    if (currentRetries >= this.defaultRules.max_retries) {
      return this.classifyAndDecide(dto, 'max_retries_exceeded');
    }

    // Check if AI client is available for enhanced decision making
    if (this.defaultClient) {
      try {
        const aiDecision = await this.aiBasedDecision(dto, currentRetries);
        if (aiDecision) {
          // Update retry count for retry decisions
          if (aiDecision.decision === 'retry') {
            this.retryCount.set(stepKey, currentRetries + 1);
          }
          return aiDecision;
        }
      } catch {
        // Fall through to rule-based decision
      }
    }

    // Rule-based decision
    const decision = this.ruleBasedDecision(dto, currentRetries);

    // Update retry count
    if (decision.decision === 'retry') {
      this.retryCount.set(stepKey, currentRetries + 1);
    }

    return decision;
  }

  /**
   * AI-based decision making
   */
  private async aiBasedDecision(
    dto: DecideFailureDTO,
    currentRetries: number,
  ): Promise<DecideFailureResponseDTO | null> {
    const systemPrompt = this.buildDecisionSystemPrompt();
    const userPrompt = this.buildDecisionUserPrompt(dto, currentRetries);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await this.defaultClient!.chatCompletion(messages);
      return this.parseDecisionResponse(response);
    } catch {
      return null;
    }
  }

  /**
   * Build system prompt for decision making
   */
  private buildDecisionSystemPrompt(): string {
    return `You are a failure recovery decision assistant for browser automation.
Given an error during replay execution, decide the best recovery strategy:
- "takeover": Human intervention required (captcha, MFA, unexpected state)
- "retry": Try the step again (transient errors, timeouts)
- "skip": Skip the step (optional, non-critical failures)

Consider:
1. Error type and message
2. Retry history
3. Similar past failures
4. Business impact

Response format:
{
  "decision": "takeover" | "retry" | "skip",
  "reason": "Explanation of the decision"
}`;
  }

  /**
   * Build user prompt for decision making
   */
  private buildDecisionUserPrompt(dto: DecideFailureDTO, retries: number): string {
    const similarFailures = this.findSimilarFailures(dto.error_type);

    return `Error Details:
- Session: ${dto.session_id}
- Step: ${dto.step_id}
- Error Type: ${dto.error_type}
- Error Message: ${dto.error_message}
- Retry Count: ${retries}

Similar Past Failures: ${similarFailures.length} occurrences
${similarFailures.slice(0, 3).map(f => `- ${f.decision} (${f.outcome})`).join('\n')}

Make a decision for recovery.`;
  }

  /**
   * Parse AI decision response
   */
  private parseDecisionResponse(response: string): DecideFailureResponseDTO | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (['takeover', 'retry', 'skip'].includes(parsed.decision)) {
        return {
          decision: parsed.decision,
          reason: parsed.reason || 'AI-based decision',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Rule-based decision making
   */
  private ruleBasedDecision(
    dto: DecideFailureDTO,
    retries: number,
  ): DecideFailureResponseDTO {
    // Check takeover errors
    if (this.defaultRules.takeover_errors.some(e =>
      dto.error_type.toLowerCase().includes(e.toLowerCase()) ||
      dto.error_message.toLowerCase().includes(e.toLowerCase())
    )) {
      return {
        decision: 'takeover',
        reason: `Error type "${dto.error_type}" requires human intervention`,
      };
    }

    // Check skip errors
    if (this.defaultRules.skip_errors.some(e =>
      dto.error_type.toLowerCase().includes(e.toLowerCase()) ||
      dto.error_message.toLowerCase().includes(e.toLowerCase())
    )) {
      return {
        decision: 'skip',
        reason: `Error type "${dto.error_type}" is non-critical, skipping step`,
      };
    }

    // Check retryable errors
    if (this.defaultRules.retryable_errors.some(e =>
      dto.error_type.toLowerCase().includes(e.toLowerCase()) ||
      dto.error_message.toLowerCase().includes(e.toLowerCase())
    )) {
      if (retries < this.defaultRules.max_retries) {
        return {
          decision: 'retry',
          reason: `Error type "${dto.error_type}" is transient, retrying (attempt ${retries + 1}/${this.defaultRules.max_retries})`,
        };
      } else {
        return {
          decision: 'takeover',
          reason: `Max retries exceeded for "${dto.error_type}", requires human intervention`,
        };
      }
    }

    // Unknown error - default to takeover for safety
    return {
      decision: 'takeover',
      reason: `Unknown error type "${dto.error_type}", requiring human intervention for safety`,
    };
  }

  /**
   * Fallback decision when timeout or error occurs
   */
  private fallbackDecision(dto: DecideFailureDTO): DecideFailureResponseDTO {
    // Safe default: takeover for any unknown situation
    return {
      decision: 'takeover',
      reason: `Decision timeout or error, defaulting to takeover for "${dto.error_type}"`,
    };
  }

  /**
   * Classify error and decide (for max retries exceeded)
   */
  private classifyAndDecide(
    dto: DecideFailureDTO,
    classification: string,
  ): DecideFailureResponseDTO {
    if (classification === 'max_retries_exceeded') {
      // Check if it might be takeover-worthy
      if (this.defaultRules.takeover_errors.some(e =>
        dto.error_type.toLowerCase().includes(e.toLowerCase())
      )) {
        return {
          decision: 'takeover',
          reason: 'Max retries exceeded, error requires human intervention',
        };
      }
      // Otherwise skip to prevent infinite loops
      return {
        decision: 'skip',
        reason: 'Max retries exceeded, skipping to prevent infinite loop',
      };
    }
    return this.fallbackDecision(dto);
  }

  /**
   * Find similar failures from history
   */
  private findSimilarFailures(errorType: string): FailureHistoryRecord[] {
    return this.failureHistory.filter(
      (record) => record.error_type.toLowerCase().includes(errorType.toLowerCase()),
    );
  }

  /**
   * Record failure outcome for learning
   */
  recordOutcome(
    dto: DecideFailureDTO,
    decision: 'takeover' | 'retry' | 'skip',
    outcome: 'success' | 'failed',
  ): void {
    this.failureHistory.push({
      session_id: dto.session_id,
      step_id: dto.step_id,
      error_type: dto.error_type,
      error_message: dto.error_message,
      decision,
      outcome,
      timestamp: new Date(),
    });

    // Clear retry count if outcome is success or final failure
    if (outcome === 'success' || decision !== 'retry') {
      const stepKey = `${dto.session_id}:${dto.step_id}`;
      this.retryCount.delete(stepKey);
    }
  }

  /**
   * Clear retry count for a session (used when session ends)
   */
  clearSessionRetries(sessionId: string): void {
    for (const [key] of this.retryCount.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.retryCount.delete(key);
      }
    }
  }

  /**
   * Get failure statistics
   */
  getStatistics(): {
    totalFailures: number;
    takeoverCount: number;
    retryCount: number;
    skipCount: number;
    successRate: number;
  } {
    const total = this.failureHistory.length;
    const takeover = this.failureHistory.filter(f => f.decision === 'takeover').length;
    const retry = this.failureHistory.filter(f => f.decision === 'retry').length;
    const skip = this.failureHistory.filter(f => f.decision === 'skip').length;
    const success = this.failureHistory.filter(f => f.outcome === 'success').length;

    return {
      totalFailures: total,
      takeoverCount: takeover,
      retryCount: retry,
      skipCount: skip,
      successRate: total > 0 ? success / total : 0,
    };
  }
}