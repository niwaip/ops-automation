import { mapExecutionStepToDto, mapExecutionToDto } from '../src/modules/execution/execution.mapper';

describe('execution.mapper', () => {
  it('maps execution record to dto and prefers embedded usage from normalized input', () => {
    const dto = mapExecutionToDto({
      id: 'execution-1',
      createdBy: 'user-1',
      createdByName: 'Alice',
      skillId: 'skill-1',
      skillVersion: 'v1',
      status: 'running',
      runtimeType: 'browser',
      riskLevel: 'L1',
      inputJson: { prompt: 'hello' },
      normalizedInputJson: {
        input: { prompt: 'hello' },
        __usage: { total_tokens: 10 },
        semantic: {
          mode: 'complex_document',
          previewReady: true,
          finalReady: false,
        },
      },
      resultJson: { ok: true },
      requiresApproval: false,
      takeoverRequired: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(dto.id).toBe('execution-1');
    expect(dto.capabilityId).toBe('skill-1');
    expect(dto.capabilityVersion).toBe('v1');
    expect(dto.input).toEqual({ prompt: 'hello' });
    expect(dto.normalizedInput).toEqual({
      input: { prompt: 'hello' },
      __usage: { total_tokens: 10 },
      semantic: {
        mode: 'complex_document',
        previewReady: true,
        finalReady: false,
      },
    });
    expect(dto.semantic).toEqual({
      mode: 'complex_document',
      previewReady: true,
      finalReady: false,
    });
    expect(dto.usage).toEqual({ total_tokens: 10 });
    expect(dto.result).toEqual({ ok: true });
    expect(dto.createdBy).toBe('user-1');
    expect(dto.createdByName).toBe('Alice');
  });

  it('maps execution step record to dto', () => {
    const dto = mapExecutionStepToDto({
      id: 'step-1',
      executionId: 'execution-1',
      stepIndex: 1,
      name: 'Open page',
      type: 'browser_action',
      status: 'running',
      action: 'goto',
      targetJson: { url: 'https://example.com' },
      inputJson: { url: 'https://example.com' },
      outputJson: { success: true },
      assertionJson: { expected: true },
      retryCount: 0,
      takeoverTriggered: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(dto.id).toBe('step-1');
    expect(dto.inputJson).toEqual({ url: 'https://example.com' });
    expect(dto.outputJson).toEqual({ success: true });
  });
});
