import {
  mapExecutionStepToDto,
  mapExecutionToDto,
} from '../src/modules/execution/state/execution.mapper';

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
    expect(dto.normalizedResult).toEqual(
      expect.objectContaining({
        hasBusinessResult: true,
        structuredData: { ok: true },
        envelope: expect.objectContaining({
          execution: expect.objectContaining({
            executionId: 'execution-1',
          }),
          result: expect.objectContaining({
            resultType: 'generic',
          }),
        }),
      })
    );
    expect(dto.createdBy).toBe('user-1');
    expect(dto.createdByName).toBe('Alice');
  });

  it('maps normalized result metadata from legacy execution outputs', () => {
    const dto = mapExecutionToDto({
      id: 'execution-legacy',
      skillId: 'skill-legacy',
      status: 'succeeded',
      runtimeType: 'workflow',
      requiresApproval: false,
      takeoverRequired: false,
      resultJson: {
        title: '日报生成',
        summary: '日报已生成',
        output: {
          total: 3,
        },
        downloadUrl: 'https://example.com/report.pdf',
        temporalLink: 'https://temporal.example/executions/legacy',
        detailText: '## 日报结果\n\n- 总数: 3',
        detailFormat: 'markdown',
      },
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(dto.normalizedResult).toEqual(
      expect.objectContaining({
        title: '日报生成',
        summary: '日报已生成',
        detailText: '## 日报结果\n\n- 总数: 3',
        detailFormat: 'markdown',
        downloadUrl: 'https://example.com/report.pdf',
        temporalLink: 'https://temporal.example/executions/legacy',
        structuredData: { total: 3 },
        artifacts: [
          expect.objectContaining({
            downloadUrl: 'https://example.com/report.pdf',
          }),
        ],
        envelope: expect.objectContaining({
          execution: expect.objectContaining({
            executionId: 'execution-legacy',
            status: 'success',
          }),
          result: expect.objectContaining({
            title: '日报生成',
            summary: '日报已生成',
          }),
        }),
      })
    );
  });

  it('promotes string result field into summary for workflow outputs', () => {
    const dto = mapExecutionToDto({
      id: 'execution-weather',
      skillId: 'skill-weather',
      status: 'succeeded',
      runtimeType: 'workflow',
      requiresApproval: false,
      takeoverRequired: false,
      resultJson: {
        result: 'Beijing 天气报告\n\n【今天概览】\n当前天气：Mist',
        temporalLink: 'https://temporal.example/executions/weather',
      },
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(dto.normalizedResult).toEqual(
      expect.objectContaining({
        summary: 'Beijing 天气报告\n\n【今天概览】\n当前天气：Mist',
        body: 'Beijing 天气报告\n\n【今天概览】\n当前天气：Mist',
        structuredData: undefined,
        temporalLink: 'https://temporal.example/executions/weather',
        envelope: expect.objectContaining({
          result: expect.objectContaining({
            summary: 'Beijing 天气报告\n\n【今天概览】\n当前天气：Mist',
          }),
        }),
      })
    );
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
      })
    );
    expect(dto.phases?.[0].artifacts?.[0]).toEqual(
      expect.objectContaining({
        artifactType: 'snapshot',
        snapshotId: 'snapshot-1',
      })
    );
    expect(dto.phases?.[0].takeovers?.[0]).toEqual(
      expect.objectContaining({
        status: 'requested',
        reason: 'Captcha detected',
      })
    );
  });

  it('derives phase steps from saved runtime output when persisted steps are missing', () => {
    const dto = mapExecutionToDto({
      id: 'execution-3',
      createdBy: 'user-3',
      skillId: 'skill-3',
      status: 'completed',
      runtimeType: 'browser',
      riskLevel: 'L0',
      requiresApproval: false,
      takeoverRequired: false,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:01:00.000Z'),
      phases: [
        {
          id: 'phase-legacy-1',
          executionId: 'execution-3',
          phaseKey: 'phase_01_execute_skill',
          phaseName: '执行技能',
          phaseType: 'system_skill',
          status: 'completed',
          attempt: 1,
          createdAt: new Date('2026-05-01T00:00:30.000Z'),
          updatedAt: new Date('2026-05-01T00:01:00.000Z'),
          outputJson: {
            rawResult: {
              output: {
                phaseResults: [
                  {
                    stepId: 'step_1',
                    stepName: '1. 页面打开',
                    result: {
                      results: [
                        {
                          status: 'success',
                          command: 'navigate',
                        },
                        {
                          status: 'success',
                          command: 'screenshot',
                          snapshot: {
                            id: 'snapshot-legacy-1',
                          },
                        },
                      ],
                    },
                  },
                  {
                    stepId: 'step_2',
                    stepName: '2. 页面处理',
                    result: {
                      results: [
                        {
                          status: 'success',
                          command: 'fill',
                          input: {
                            value: 'demo',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
          artifacts: [],
          takeovers: [],
        },
      ],
    });

    expect(dto.phases?.[0].steps).toEqual([
      expect.objectContaining({
        stepIndex: 1,
        action: 'navigate',
        status: 'completed',
      }),
      expect.objectContaining({
        stepIndex: 2,
        action: 'screenshot',
        status: 'completed',
        snapshotId: 'snapshot-legacy-1',
      }),
      expect.objectContaining({
        stepIndex: 3,
        action: 'fill',
        status: 'completed',
        input: {
          value: 'demo',
        },
      }),
    ]);
  });
});
