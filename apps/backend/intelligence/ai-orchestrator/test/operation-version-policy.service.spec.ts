import { OperationVersionPolicyService } from '../src/modules/llm-operation/registry/operation-version-policy.service';
import { LlmOperationError, LLM_OPERATION_ERROR_CODES } from '../src/modules/llm-operation/registry/errors';

describe('OperationVersionPolicyService', () => {
  let service: OperationVersionPolicyService;

  beforeEach(() => {
    service = new OperationVersionPolicyService();
  });

  describe('assertTransitionAllowed', () => {
    it('should allow draft → validating', () => {
      expect(() => service.assertTransitionAllowed('draft', 'validating')).not.toThrow();
    });

    it('should allow validating → candidate', () => {
      expect(() => service.assertTransitionAllowed('validating', 'candidate')).not.toThrow();
    });

    it('should allow candidate → approved', () => {
      expect(() => service.assertTransitionAllowed('candidate', 'approved')).not.toThrow();
    });

    it('should allow approved → deprecated', () => {
      expect(() => service.assertTransitionAllowed('approved', 'deprecated')).not.toThrow();
    });

    it('should allow deprecated → retired', () => {
      expect(() => service.assertTransitionAllowed('deprecated', 'retired')).not.toThrow();
    });

    it('should allow approved → approved (idempotent)', () => {
      expect(() => service.assertTransitionAllowed('approved', 'approved')).not.toThrow();
    });

    it('should allow validation_failed → draft (reset)', () => {
      expect(() => service.assertTransitionAllowed('validation_failed', 'draft')).not.toThrow();
    });

    it('should allow approval_rejected → candidate (reset)', () => {
      expect(() => service.assertTransitionAllowed('approval_rejected', 'candidate')).not.toThrow();
    });

    it('should allow activation_failed → approved (reset)', () => {
      expect(() => service.assertTransitionAllowed('activation_failed', 'approved')).not.toThrow();
    });

    it('should reject draft → approved (skip states)', () => {
      expect(() => service.assertTransitionAllowed('draft', 'approved')).toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
          details: { from: 'draft', to: 'approved' },
        })
      );
    });

    it('should reject approved → draft (no backward)', () => {
      expect(() => service.assertTransitionAllowed('approved', 'draft')).toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
          details: { from: 'approved', to: 'draft' },
        })
      );
    });

    it('should reject retired → draft (terminal state)', () => {
      expect(() => service.assertTransitionAllowed('retired', 'draft')).toThrow(
        expect.objectContaining({
          code: LLM_OPERATION_ERROR_CODES.INVALID_STATE_TRANSITION,
          details: { from: 'retired', to: 'draft' },
        })
      );
    });
  });

  describe('listAllowedTransitions', () => {
    it('should return validating for draft', () => {
      const transitions = service.listAllowedTransitions('draft');
      expect(transitions).toEqual(['validating']);
    });

    it('should return candidate and validation_failed for validating', () => {
      const transitions = service.listAllowedTransitions('validating');
      expect(transitions).toContain('candidate');
      expect(transitions).toContain('validation_failed');
    });

    it('should return approved and approval_rejected for candidate', () => {
      const transitions = service.listAllowedTransitions('candidate');
      expect(transitions).toContain('approved');
      expect(transitions).toContain('approval_rejected');
    });

    it('should return approved, deprecated, activation_failed for approved', () => {
      const transitions = service.listAllowedTransitions('approved');
      expect(transitions).toContain('approved');
      expect(transitions).toContain('deprecated');
      expect(transitions).toContain('activation_failed');
    });

    it('should return approved and retired for deprecated', () => {
      const transitions = service.listAllowedTransitions('deprecated');
      expect(transitions).toContain('approved');
      expect(transitions).toContain('retired');
    });

    it('should return only retired for retired', () => {
      const transitions = service.listAllowedTransitions('retired');
      expect(transitions).toEqual(['retired']);
    });
  });
});