import {
  computeOperationDigest,
  canonicalizeJson,
} from '../src/modules/llm-operation/operation-digest.util';

describe('operation-digest.util', () => {
  describe('canonicalizeJson', () => {
    it('should return null for null/undefined input', () => {
      expect(canonicalizeJson(null)).toBeNull();
      expect(canonicalizeJson(undefined)).toBeNull();
    });

    it('should preserve primitive values', () => {
      expect(canonicalizeJson('test')).toBe('test');
      expect(canonicalizeJson(42)).toBe(42);
      expect(canonicalizeJson(true)).toBe(true);
    });

    it('should preserve array order', () => {
      const input = [3, 1, 2];
      const result = canonicalizeJson(input);
      expect(result).toEqual([3, 1, 2]);
    });

    it('should sort object keys lexicographically', () => {
      const input = { z: 1, a: 2, m: 3 };
      const result = canonicalizeJson(input) as Record<string, number>;
      expect(Object.keys(result)).toEqual(['a', 'm', 'z']);
      expect(result).toEqual({ a: 2, m: 3, z: 1 });
    });

    it('should recursively canonicalize nested objects', () => {
      const input = {
        z: { b: 1, a: 2 },
        a: { y: 3, x: 4 },
      };
      const result = canonicalizeJson(input) as any;
      expect(Object.keys(result)).toEqual(['a', 'z']);
      expect(Object.keys(result.a)).toEqual(['x', 'y']);
      expect(Object.keys(result.z)).toEqual(['a', 'b']);
    });
  });

  describe('computeOperationDigest', () => {
    const baseInput = {
      inputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          markdown_content: { type: 'string' },
        },
      },
      promptTemplateId: 'news-summary',
      version: '1',
      modelPolicyId: 'task-default',
      temperature: 0,
      maxInputTokens: 4000,
      maxOutputTokens: 2000,
    };

    it('should return sha256:<hex> format', () => {
      const digest = computeOperationDigest(baseInput);
      expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce identical digest for identical input', () => {
      const digest1 = computeOperationDigest(baseInput);
      const digest2 = computeOperationDigest(baseInput);
      expect(digest1).toBe(digest2);
    });

    it('should produce identical digest when inputSchema keys reordered', () => {
      const reorderedInput = {
        ...baseInput,
        inputSchema: {
          properties: {
            items: { type: 'array' },
          },
          type: 'object',
        },
      };
      const digest1 = computeOperationDigest(baseInput);
      const digest2 = computeOperationDigest(reorderedInput);
      expect(digest1).toBe(digest2);
    });

    it('should produce different digest when version changes', () => {
      const modifiedInput = { ...baseInput, version: '2' };
      const digest1 = computeOperationDigest(baseInput);
      const digest2 = computeOperationDigest(modifiedInput);
      expect(digest1).not.toBe(digest2);
    });

    it('should produce different digest when temperature changes', () => {
      const modifiedInput = { ...baseInput, temperature: 0.5 };
      const digest1 = computeOperationDigest(baseInput);
      const digest2 = computeOperationDigest(modifiedInput);
      expect(digest1).not.toBe(digest2);
    });

    it('should produce different digest when modelPolicyId changes', () => {
      const modifiedInput = { ...baseInput, modelPolicyId: 'task-strict' };
      const digest1 = computeOperationDigest(baseInput);
      const digest2 = computeOperationDigest(modifiedInput);
      expect(digest1).not.toBe(digest2);
    });

    it('should produce different digest when model output transport changes', () => {
      const digest1 = computeOperationDigest(baseInput);
      const digest2 = computeOperationDigest({ ...baseInput, modelOutputMode: 'text' });
      expect(digest1).not.toBe(digest2);
    });

    it('should handle null schemas', () => {
      const inputWithNullSchemas = {
        ...baseInput,
        inputSchema: null,
        outputSchema: null,
      };
      const digest = computeOperationDigest(inputWithNullSchemas);
      expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should produce stable digest with minimal input', () => {
      const minimalInput = {
        inputSchema: null,
        outputSchema: null,
        promptTemplateId: 'test',
        version: '1',
        modelPolicyId: 'default',
        temperature: 0,
        maxInputTokens: 1000,
        maxOutputTokens: 500,
      };
      const digest1 = computeOperationDigest(minimalInput);
      const digest2 = computeOperationDigest(minimalInput);
      expect(digest1).toBe(digest2);
    });
  });
});
