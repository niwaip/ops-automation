import { Injectable } from '@nestjs/common';
import { LlmOperationVersionState } from './types';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from './errors';

@Injectable()
export class OperationVersionPolicyService {
  private static readonly TRANSITIONS = new Map<
    LlmOperationVersionState,
    LlmOperationVersionState[]
  >([
    ['draft', ['validating']],
    ['validating', ['candidate', 'validation_failed']],
    ['candidate', ['approved', 'approval_rejected']],
    ['approved', ['approved', 'deprecated', 'activation_failed']],
    ['deprecated', ['approved', 'retired']],
    ['retired', ['retired']],
    ['validation_failed', ['draft', 'validating']],
    ['approval_rejected', ['candidate']],
    ['activation_failed', ['approved']],
  ]);

  public assertTransitionAllowed(
    from: LlmOperationVersionState,
    to: LlmOperationVersionState,
  ): void {
    const allowedTargets = OperationVersionPolicyService.TRANSITIONS.get(from);
    if (!allowedTargets || !allowedTargets.includes(to)) {
      throw new LlmOperationError(
        LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
        `Invalid state transition: ${from} → ${to}`,
        { from, to },
      );
    }
  }

  public listAllowedTransitions(from: LlmOperationVersionState): LlmOperationVersionState[] {
    return OperationVersionPolicyService.TRANSITIONS.get(from) || [];
  }
}
