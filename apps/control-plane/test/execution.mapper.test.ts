import { mapExecutionStepToDto, mapExecutionToDto } from '../src/modules/execution/execution.mapper';

describe('execution.mapper', () => {
  it('maps execution record to dto and prefers embedded usage from normalized input', () => {
    const dto = mapExecutionToDto({
      id: 'execution-1',
      createdBy: 'user-1',
      skillId: 'skill-1',
      skillVersion: 'v1',
      status: 'running',
      runtimeType: 'browser',
      riskLevel: 'L1',
      inputJson: { prompt: 'hello' },
      normalizedInputJson: {
        input: { prompt: 'hello' },
        __usage: { total_tokens: 10 },
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
    expect(dto.usage).toEqual({ total_tokens: 10 });
    expect(dto.result).toEqual({ ok: true });
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
    expect(dto.target).toEqual({ url: 'https://example.com' });
    expect(dto.output).toEqual({ success: true });
    expect(dto.assertion).toEqual({ expected: true });
  });
});
