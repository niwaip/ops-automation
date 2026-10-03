import { ExecutionPhaseService } from '../src/modules/execution/state/execution-phase.service';

describe('ExecutionPhaseService (Audit Improvements)', () => {
  let service: ExecutionPhaseService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };
    service = new ExecutionPhaseService(mockPrisma as any);
  });

  describe('appendSteps idempotency & concurrency safety', () => {
    it('uses row-level lock on phase and updates existing steps to prevent step record bloating', async () => {
      // Mock finding phase
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: '11111111-1111-1111-1111-111111111111' },
      ]);

      // Call 0: SELECT FOR UPDATE row lock
      // Call 1: Step 1 UPDATE returns 1 (exists)
      // Call 2: Step 2 UPDATE returns 0 (does not exist)
      // Call 3: Step 2 INSERT returns 1
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1) // Row lock
        .mockResolvedValueOnce(1) // Step 1 UPDATE
        .mockResolvedValueOnce(0) // Step 2 UPDATE
        .mockResolvedValueOnce(1); // Step 2 INSERT

      const steps = [
        {
          stepIndex: 1,
          stepId: 'step_1',
          action: 'click',
          status: 'completed',
        },
        {
          stepIndex: 2,
          stepId: 'step_2',
          action: 'type',
          status: 'completed',
        },
      ];

      await service.appendSteps('exec-1', 'phase-1', steps);

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(4);

      // Verify row lock was acquired first
      const lockSql = mockPrisma.$executeRawUnsafe.mock.calls[0][0];
      expect(lockSql).toContain('SELECT id FROM execution_phases WHERE id = $1::uuid FOR UPDATE');

      // Verify the step 1 was an UPDATE
      const step1Sql = mockPrisma.$executeRawUnsafe.mock.calls[1][0];
      expect(step1Sql).toContain('UPDATE execution_phase_steps');
      expect(step1Sql).toContain('WHERE phase_id = $1::uuid');
      expect(step1Sql).toContain('AND step_index = $2');

      // Verify the step 2 had an UPDATE that returned 0, then an INSERT
      const step2UpdateSql = mockPrisma.$executeRawUnsafe.mock.calls[2][0];
      expect(step2UpdateSql).toContain('UPDATE execution_phase_steps');

      const step2InsertSql = mockPrisma.$executeRawUnsafe.mock.calls[3][0];
      expect(step2InsertSql).toContain('INSERT INTO execution_phase_steps');
    });
  });

  describe('resolveTakeoverRecord', () => {
    it('strictly confines takeover resolution to target phaseId and derives execution summary from remaining count', async () => {
      // UPDATE execution_takeovers for Phase A returns 1
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1) // UPDATE execution_takeovers
        .mockResolvedValueOnce(1); // updateExecutionTakeoverStatus

      // Query remaining takeovers: 0 remaining
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]);

      await service.resolveTakeoverRecord({
        executionId: '22222222-2222-2222-2222-222222222222',
        phaseId: '33333333-3333-3333-3333-333333333333',
        resolvedBy: '44444444-4444-4444-4444-444444444444',
        resolutionNote: 'Approved low margin case by auditor',
        status: 'resolved',
      });

      const updateSql = mockPrisma.$executeRawUnsafe.mock.calls[0][0];
      expect(updateSql).toContain('AND et.phase_id = $2::uuid');
      expect(updateSql).toContain("AND et.status IN ('requested', 'pending')");

      // Verify summary updated to resolved since remaining is 0
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      const summarySql = mockPrisma.$executeRawUnsafe.mock.calls[1][0];
      expect(summarySql).toContain('UPDATE executions');
      expect(summarySql).toContain('takeover_status');
    });

    it('does NOT hijack or close takeovers of other phases when target phaseId has no pending records', async () => {
      // Reconcile already resolved Phase A, now resume calls resolveTakeoverRecord for Phase A again:
      // UPDATE returns 0 (no requested/pending takeover left for Phase A)
      mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(0);

      // Remaining query shows Phase B still has 1 pending takeover
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 1 }]);

      await service.resolveTakeoverRecord({
        executionId: '22222222-2222-2222-2222-222222222222',
        phaseId: 'phase-A-uuid',
        resolvedBy: '44444444-4444-4444-4444-444444444444',
        resolutionNote: 'Duplicate resolve on Phase A',
        status: 'resolved',
      });

      // Crucial: There should ONLY be 1 UPDATE on execution_takeovers, strictly restricted to Phase A!
      // It must NOT make a second query removing phase_id filter to steal Phase B!
      const updateCalls = mockPrisma.$executeRawUnsafe.mock.calls.filter((c: any[]) =>
        c[0].includes('UPDATE execution_takeovers')
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0]).toContain('AND et.phase_id = $2::uuid');

      // Crucial: Since Phase B is still pending, executions.takeover_status must NOT be set to resolved!
      const resolvedSummaryCalls = mockPrisma.$executeRawUnsafe.mock.calls.filter(
        (c: any[]) => c[0].includes('UPDATE executions') && c[1] === 'resolved'
      );
      expect(resolvedSummaryCalls).toHaveLength(0);
    });

    it('resolves specific takeover by takeoverId when provided', async () => {
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1) // UPDATE by takeoverId
        .mockResolvedValueOnce(1); // updateExecutionTakeoverStatus

      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 0 }]);

      await service.resolveTakeoverRecord({
        executionId: '22222222-2222-2222-2222-222222222222',
        takeoverId: 'takeover-uuid-1',
        resolvedBy: '44444444-4444-4444-4444-444444444444',
        resolutionNote: 'Resolved exact takeover',
        status: 'resolved',
      });

      const updateSql = mockPrisma.$executeRawUnsafe.mock.calls[0][0];
      expect(updateSql).toContain('WHERE id = $1::uuid');
      expect(updateSql).toContain("AND status IN ('requested', 'pending')");
    });
  });

  describe('createOrUpdatePhase lifecycle integrity', () => {
    it('preserves initial started_at using COALESCE and monotonically preserves attempt using GREATEST', async () => {
      mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1); // INSERT ... ON CONFLICT DO UPDATE
      mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1); // syncExecutionPhaseSummary

      await service.markCompleted('exec-1', 'phase-1', {
        phaseName: 'Phase 1',
        phaseType: 'browser_replay',
        attempt: 1,
        runtimeSessionId: null,
        output: { success: true },
        postcheck: null,
      });

      const upsertSql = mockPrisma.$executeRawUnsafe.mock.calls[0][0];
      expect(upsertSql).toContain('started_at = COALESCE(execution_phases.started_at, EXCLUDED.started_at)');
      expect(upsertSql).toContain('attempt = GREATEST(execution_phases.attempt, EXCLUDED.attempt)');
    });
  });
});
