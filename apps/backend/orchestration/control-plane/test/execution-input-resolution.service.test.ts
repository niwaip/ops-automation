import { BadRequestException } from '@nestjs/common';
import { ExecutionInputResolutionService } from '../src/modules/execution/execution-input-resolution.service';

describe('ExecutionInputResolutionService', () => {
  const createUsage = (prompt: number, completion: number, reasoning = 0) => ({
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    completion_tokens_details: {
      reasoning_tokens: reasoning,
    },
  });

  it('normalizes submitted input, preserves passthrough fields, and aggregates usage', () => {
    const service = new ExecutionInputResolutionService();
    const reconcileSemantic = jest.fn().mockReturnValue({
      finalReady: true,
      previewReady: true,
    });

    const result = service.resolveSubmitInputState(
      {
        normalized: {
          input: {
            existing: 'keep-me',
            dueDate: 'stale-value',
          },
          semantic: {
            finalReady: false,
          },
        },
        requiredInputs: [
          {
            name: 'dueDate',
            type: 'date',
            required: true,
            missing: true,
            source: 'unresolved',
          },
        ],
        currentParamResolution: {
          dueDate: {
            type: 'date',
            required: true,
            requiredMode: 'always',
            source: 'unresolved',
            missing: true,
            needsConfirmation: false,
            final: false,
          },
        },
        missingInputs: [
          {
            name: 'dueDate',
            type: 'date',
            required: true,
            missing: true,
            source: 'unresolved',
          },
        ],
      },
      {
        input: {
          dueDate: '2026年6月2日',
        },
        currentUsage: createUsage(3, 2, 1),
        submittedUsage: createUsage(5, 4, 2),
        reconcileSemantic,
      }
    );

    expect(result.normalizedSubmittedInput).toEqual({
      dueDate: '2026-06-02',
    });
    expect(result.canResumeExecution).toBe(true);
    expect(result.remainingMissingInputs).toEqual([]);
    expect(result.updatedNormalized).toEqual({
      __usage: {
        prompt_tokens: 8,
        completion_tokens: 6,
        total_tokens: 14,
        completion_tokens_details: {
          reasoning_tokens: 3,
        },
      },
      dueDate: '2026-06-02',
      input: {
        existing: 'keep-me',
        dueDate: '2026-06-02',
      },
      paramResolution: {
        dueDate: expect.objectContaining({
          value: '2026-06-02',
          source: 'user_input',
          missing: false,
          final: true,
        }),
      },
      requiredInputs: [
        expect.objectContaining({
          name: 'dueDate',
          value: '2026-06-02',
          missing: false,
          source: 'user_input',
        }),
      ],
      semantic: {
        finalReady: true,
        previewReady: true,
      },
    });
    expect(reconcileSemantic).toHaveBeenCalledWith({ finalReady: false }, [
      expect.objectContaining({
        name: 'dueDate',
        missing: false,
      }),
    ]);
  });

  it('rejects fields that are not currently missing', () => {
    const service = new ExecutionInputResolutionService();

    expect(() =>
      service.resolveSubmitInputState(
        {
          normalized: {},
          requiredInputs: [
            {
              name: 'dueDate',
              type: 'date',
              required: true,
              missing: true,
              source: 'unresolved',
            },
          ],
          currentParamResolution: {
            dueDate: {
              type: 'date',
              required: true,
              requiredMode: 'always',
              source: 'unresolved',
              missing: true,
              needsConfirmation: false,
              final: false,
            },
          },
          missingInputs: [
            {
              name: 'dueDate',
              type: 'date',
              required: true,
              missing: true,
              source: 'unresolved',
            },
          ],
        },
        {
          input: {
            unexpected: 'value',
          },
        }
      )
    ).toThrow(BadRequestException);
  });
});
