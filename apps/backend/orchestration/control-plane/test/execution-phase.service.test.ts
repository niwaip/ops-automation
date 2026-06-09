import { ExecutionPhaseService } from '../src/modules/execution/execution-phase.service';

describe('ExecutionPhaseService', () => {
  it('upserts phase records and syncs execution phase summary', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };

    const service = new ExecutionPhaseService(prisma as never);
    await service.markRunning('execution-1', 'phase_login', {
      phaseName: '登录阶段',
      phaseType: 'browser_login',
      attempt: 1,
      runtimeSessionId: 'runtime-1',
      input: { username: 'test' },
      precheck: { matched: false },
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe.mock.calls[0][1]).toBe('execution-1');
    expect(prisma.$executeRawUnsafe.mock.calls[0][2]).toBe('phase_login');
    expect(prisma.$executeRawUnsafe.mock.calls[0][5]).toBe('running');
    expect(prisma.$executeRawUnsafe.mock.calls[1][1]).toBe('execution-1');
    expect(prisma.$executeRawUnsafe.mock.calls[1][2]).toBe('phase_login');
    expect(prisma.$executeRawUnsafe.mock.calls[1][3]).toBe('running');
  });

  it('returns phases with nested artifacts and takeovers when phase tables exist', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([
          {
            id: 'phase-1',
            execution_id: 'execution-1',
            phase_key: 'phase_login',
            phase_name: '登录阶段',
            phase_type: 'browser_login',
            status: 'running',
            attempt: 1,
            runtime_session_id: 'runtime-1',
            input_json: { username: 'test' },
            output_json: null,
            precheck_json: { matched: false },
            postcheck_json: null,
            recovery_decision_json: null,
            error_code: null,
            error_message: null,
            started_at: new Date('2026-05-01T00:00:00.000Z'),
            completed_at: null,
            created_at: new Date('2026-05-01T00:00:00.000Z'),
            updated_at: new Date('2026-05-01T00:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'artifact-1',
            phase_id: 'phase-1',
            artifact_type: 'snapshot',
            snapshot_id: 'snapshot-1',
            page_url: 'https://example.com/login',
            page_fingerprint: 'fp-1',
            payload_json: { title: 'Login' },
            created_at: new Date('2026-05-01T00:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'takeover-1',
            execution_id: 'execution-1',
            phase_id: 'phase-1',
            runtime_session_id: 'runtime-1',
            status: 'requested',
            reason: 'Captcha detected',
            requested_by: 'user-1',
            resolved_by: null,
            resolution_note: null,
            created_at: new Date('2026-05-01T00:00:00.000Z'),
            resolved_at: null,
          },
        ]),
    };

    const service = new ExecutionPhaseService(prisma as never);
    const phases = await service.listByExecutionId('execution-1');

    expect(phases).toHaveLength(1);
    expect(phases[0].artifacts).toEqual([
      expect.objectContaining({
        artifact_type: 'snapshot',
        snapshot_id: 'snapshot-1',
      }),
    ]);
    expect(phases[0].takeovers).toEqual([
      expect.objectContaining({
        status: 'requested',
        reason: 'Captcha detected',
      }),
    ]);
  });

  it('returns empty list when phase tables are not migrated yet', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('relation "execution_phases" does not exist')),
    };

    const service = new ExecutionPhaseService(prisma as never);
    await expect(service.listByExecutionId('execution-1')).resolves.toEqual([]);
  });

  it('creates and resolves takeover records while syncing execution takeover status', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn(),
    };

    const service = new ExecutionPhaseService(prisma as never);
    await service.createTakeoverRecord({
      executionId: 'execution-1',
      phaseId: 'phase-1',
      runtimeSessionId: 'runtime-1',
      reason: 'Captcha detected',
      requestedBy: 'user-1',
    });
    await service.resolveTakeoverRecord({
      executionId: 'execution-1',
      phaseId: 'phase-1',
      resolvedBy: 'user-2',
      resolutionNote: 'Handled manually',
      status: 'resolved',
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO execution_takeovers'),
      'execution-1',
      'phase-1',
      'runtime-1',
      'Captcha detected',
      'user-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE execution_takeovers'),
      'execution-1',
      'phase-1',
      'resolved',
      'user-2',
      'Handled manually',
    );
  });

  it('replaces phase artifacts for an existing phase record', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          id: 'phase-1',
          execution_id: 'execution-1',
          phase_key: 'phase_login',
          phase_name: '登录阶段',
          phase_type: 'browser_login',
          status: 'completed',
          attempt: 1,
          created_at: new Date('2026-05-01T00:00:00.000Z'),
          updated_at: new Date('2026-05-01T00:00:00.000Z'),
        },
      ]),
    };

    const service = new ExecutionPhaseService(prisma as never);
    await service.replaceArtifacts('execution-1', 'phase_login', [
      {
        artifactType: 'snapshot',
        snapshotId: 'snapshot-1',
        pageUrl: 'https://example.com/login',
        pageFingerprint: 'fp-1',
        payload: { title: 'Login' },
      },
    ]);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM execution_phase_artifacts'),
      'phase-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO execution_phase_artifacts'),
      'phase-1',
      'snapshot',
      'snapshot-1',
      'https://example.com/login',
      'fp-1',
      JSON.stringify({ title: 'Login' }),
    );
  });
});
