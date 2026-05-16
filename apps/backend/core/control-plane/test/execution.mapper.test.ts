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
          enabled: true,
          mode: 'complex_document',
          previewReady: true,
          finalReady: false,
          fallbackToFieldLevel: false,
          groupedMissing: [],
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
        enabled: true,
        mode: 'complex_document',
        previewReady: true,
        finalReady: false,
        fallbackToFieldLevel: false,
        groupedMissing: [],
      },
    });
    expect(dto.semantic).toEqual({
      enabled: true,
      mode: 'complex_document',
      previewReady: true,
      finalReady: false,
      fallbackToFieldLevel: false,
      groupedMissing: [],
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

  it('maps execution phase records to dto', () => {
    const dto = mapExecutionToDto({
      id: 'execution-2',
      createdBy: 'user-2',
      skillId: 'skill-2',
      status: 'running',
      runtimeType: 'browser',
      riskLevel: 'L0',
      currentPhaseKey: 'phase_login',
      currentPhaseStatus: 'running',
      takeoverStatus: null,
      requiresApproval: false,
      takeoverRequired: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      phases: [
        {
          id: 'phase-1',
          executionId: 'execution-2',
          phaseKey: 'phase_login',
          phaseName: '登录阶段',
          phaseType: 'browser_login',
          status: 'running',
          attempt: 1,
          runtimeSessionId: 'runtime-1',
          inputJson: { username: 'test' },
          outputJson: null,
          precheckJson: { matched: false },
          postcheckJson: null,
          recoveryDecisionJson: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          artifacts: [
            {
              id: 'artifact-1',
              artifactType: 'snapshot',
              snapshotId: 'snapshot-1',
              pageUrl: 'https://example.com/login',
              pageFingerprint: 'fingerprint-1',
              payloadJson: { title: 'Login' },
              createdAt: new Date('2026-05-01T00:00:00.000Z'),
            },
          ],
          takeovers: [
            {
              id: 'takeover-1',
              status: 'requested',
              reason: 'Captcha detected',
              requestedBy: 'user-2',
              resolvedBy: null,
              resolutionNote: null,
              createdAt: new Date('2026-05-01T00:00:00.000Z'),
              resolvedAt: null,
            },
          ],
        },
      ],
    });

    expect(dto.currentPhaseKey).toBe('phase_login');
    expect(dto.currentPhaseStatus).toBe('running');
    expect(dto.phases).toHaveLength(1);
    expect(dto.phases?.[0]).toEqual(
      expect.objectContaining({
        phaseKey: 'phase_login',
        phaseName: '登录阶段',
        phaseType: 'browser_login',
        status: 'running',
        attempt: 1,
      }),
    );
    expect(dto.phases?.[0].artifacts?.[0]).toEqual(
      expect.objectContaining({
        artifactType: 'snapshot',
        snapshotId: 'snapshot-1',
      }),
    );
    expect(dto.phases?.[0].takeovers?.[0]).toEqual(
      expect.objectContaining({
        status: 'requested',
        reason: 'Captcha detected',
      }),
    );
  });
});
