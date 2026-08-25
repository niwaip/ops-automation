"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const validDecision = {
    schemaVersion: 'planning-decision/v1',
    routeClass: 'single_capability',
    routeSource: 'deterministic_match',
    confidence: 0.95,
    reasonCodes: ['single_capability_match'],
    candidateIds: ['weather.read'],
    selectedCapabilityIds: ['weather.read'],
    catalogSnapshotDigest: 'a'.repeat(64),
    routingPolicyVersion: 'builtin-2026-08-23',
    routingPolicyDigest: 'b'.repeat(64),
    estimatedModelCalls: 0,
    estimatedInputTokens: 0,
    tokenBudget: 0,
    riskLevel: 'L0',
    requiresApproval: false,
    replayability: 'contract',
};
describe('PlanningDecisionV1', () => {
    it('accepts a complete versioned decision', () => {
        expect((0, index_1.validatePlanningDecisionV1)(validDecision)).toEqual({ valid: true, errors: [] });
        expect(() => (0, index_1.assertPlanningDecisionV1)(validDecision)).not.toThrow();
    });
    it('rejects invalid bounds, digests and enum values', () => {
        const result = (0, index_1.validatePlanningDecisionV1)({
            ...validDecision,
            confidence: 2,
            routingPolicyDigest: 'not-a-digest',
            routeClass: 'unknown',
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(expect.arrayContaining([
            'routeClass is invalid',
            'confidence must be a number between 0 and 1',
            'routingPolicyDigest must be a lowercase sha256 digest',
        ]));
    });
});
//# sourceMappingURL=index.spec.js.map