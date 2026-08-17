import {
  BudgetEnforcerService,
  INPUT_TRUNCATION_NOTICE,
} from '../src/modules/llm-operation/runtime/budget-enforcer.service';

describe('BudgetEnforcerService', () => {
  const service = new BudgetEnforcerService();

  describe('preflightInput', () => {
    it('passes inputs within budget', () => {
      expect(() => service.preflightInput({ text: 'short' }, 100)).not.toThrow();
    });

    it('throws BUDGET_EXCEEDED for oversized inputs', () => {
      expect(() =>
        service.preflightInput({ text: 'x'.repeat(10_000) }, 100),
      ).toThrow(/Input exceeds budget/);
    });
  });

  describe('prepareInput', () => {
    it('returns the input unchanged for the reject policy', () => {
      const input = { text: 'x'.repeat(10_000) };
      expect(service.prepareInput(input, 100, 'reject')).toBe(input);
    });

    it('returns the input unchanged when within budget even with truncate policy', () => {
      const input = { text: 'hello' };
      expect(service.prepareInput(input, 1000, 'truncate')).toBe(input);
    });

    it('truncates the largest string field to fit the budget and appends the notice', () => {
      const input = {
        text: 'x'.repeat(10_000),
        meta: 'small',
      };
      const prepared = service.prepareInput(input, 250, 'truncate');

      expect(prepared).not.toBe(input);
      expect(() => service.preflightInput(prepared, 250)).not.toThrow();
      expect(prepared.meta).toBe('small');
      const truncatedText = String(prepared.text);
      expect(truncatedText.length).toBeLessThan(10_000);
      expect(truncatedText.endsWith(INPUT_TRUNCATION_NOTICE)).toBe(true);
      expect(truncatedText.startsWith('x'.repeat(100))).toBe(true);
    });

    it('leaves oversized non-string inputs for preflight to reject', () => {
      const input = { items: ['x'.repeat(10_000)] };
      const prepared = service.prepareInput(input, 250, 'truncate');
      expect(() => service.preflightInput(prepared, 250)).toThrow(/Input exceeds budget/);
    });
  });
});
