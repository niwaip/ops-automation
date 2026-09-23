import { OutboundEffectReconciliationService } from '../src/modules/execution/human-control/outbound-effect-reconciliation.service';
import { EXECUTION_STATUS } from '../src/modules/execution/contracts/execution-status';
import { EXECUTION_EVENT_TYPE } from '../src/modules/execution/contracts/execution-event-type';

describe('OutboundEffectReconciliationService', () => {
  let service: OutboundEffectReconciliationService;
  let prismaMock: any;
  let ledgerMock: any;
  let outboxMock: any;
  let hooksMock: any;

  beforeEach(() => {
    prismaMock = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundEffectLedger: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };

    ledgerMock = {
      resolveUnknown: jest
        .fn()
        .mockResolvedValue({ id: 'eff-1', state: 'COMMITTED', providerMessageId: 'msg-123' }),
      authorizeRetry: jest.fn().mockResolvedValue({ id: 'eff-1', state: 'APPROVED' }),
    };

    outboxMock = {
      enqueue: jest.fn().mockResolvedValue('outbox-1'),
    };

    hooksMock = {
      updateStatus: jest.fn().mockResolvedValue(undefined),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      startExecution: jest.fn().mockResolvedValue(undefined),
    };

    service = new OutboundEffectReconciliationService(prismaMock, outboxMock, ledgerMock);
  });

  describe('resolveOutboundEffect', () => {
    it('resolves unknown outbound effect to COMMITTED, updates step without contract violation, and transitions status via hooks', async () => {
      prismaMock.execution.findUnique.mockResolvedValue({
        id: 'exec-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      });
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'eff-1',
        idempotencyKey: 'exec-1:step-1:key',
        state: 'UNKNOWN',
      });
      prismaMock.executionStep.findMany.mockResolvedValue([
        {
          id: 'step-1',
          executionId: 'exec-1',
          stepIndex: 0,
          idempotencyKey: 'exec-1:step-1:key',
          status: 'failed',
          takeoverTriggered: true,
          outputJson: { ledgerId: 'eff-1' },
        },
      ]);

      const result = await service.resolveOutboundEffect(
        'exec-1',
        'eff-1',
        { targetState: 'COMMITTED', resolutionReason: 'Verified in SMTP logs' },
        'user-1',
        undefined,
        hooksMock
      );

      // Passed tx client to ledger
      expect(ledgerMock.resolveUnknown).toHaveBeenCalledWith(
        {
          id: 'eff-1',
          targetState: 'COMMITTED',
          resolutionReason: 'Verified in SMTP logs',
          resolvedBy: 'user-1',
        },
        prismaMock
      );
      expect(result.state).toBe('COMMITTED');

      // Output adheres strictly to capability contract: deliveryId, state, acceptedAt; NO extra undeclared fields
      expect(prismaMock.executionStep.update).toHaveBeenCalledWith({
        where: { id: 'step-1' },
        data: expect.objectContaining({
          status: 'succeeded',
          takeoverTriggered: false,
          outputJson: expect.objectContaining({
            deliveryId: 'msg-123',
            state: 'accepted',
            acceptedAt: expect.any(String),
          }),
        }),
      });

      const updatedOutput = prismaMock.executionStep.update.mock.calls[0][0].data.outputJson;
      expect(updatedOutput.reconciledState).toBeUndefined();
      expect(updatedOutput.reconciliationReason).toBeUndefined();

      // Non-status fields updated in DB
      expect(prismaMock.execution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          takeoverRequired: false,
          takeoverReason: null,
          failureCode: null,
          failureReason: null,
        }),
      });
      // DB update did NOT set status directly to queued (preventing queued -> queued 400 error)
      expect(prismaMock.execution.update.mock.calls[0][0].data.status).toBeUndefined();

      // Hook invoked to do legal state machine transition human_control -> queued
      expect(hooksMock.updateStatus).toHaveBeenCalledWith('exec-1', EXECUTION_STATUS.QUEUED);

      // Resumed event contains audit details
      expect(hooksMock.emitEvent).toHaveBeenCalledWith(
        'exec-1',
        EXECUTION_EVENT_TYPE.EXECUTION_RESUMED,
        expect.objectContaining({
          action: 'reconcile_outbound_effect',
          effectId: 'eff-1',
          targetState: 'COMMITTED',
          resolvedBy: 'user-1',
          reason: 'Verified in SMTP logs',
        }),
        { stepId: 'step-1' }
      );
    });

    it('fails closed with NotFoundException when no step matches effect', async () => {
      prismaMock.execution.findUnique.mockResolvedValue({
        id: 'exec-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      });
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'eff-1',
        idempotencyKey: 'exec-1:step-1:key',
        state: 'UNKNOWN',
      });
      prismaMock.executionStep.findMany.mockResolvedValue([
        {
          id: 'unrelated-step',
          executionId: 'exec-1',
          stepIndex: 0,
          idempotencyKey: 'exec-1:other-step:key',
          status: 'failed',
          takeoverTriggered: true,
          outputJson: {},
        },
      ]);

      await expect(
        service.resolveOutboundEffect(
          'exec-1',
          'eff-1',
          { targetState: 'COMMITTED', resolutionReason: 'Test' },
          'user-1',
          undefined,
          hooksMock
        )
      ).rejects.toThrow('TARGET_STEP_NOT_FOUND');

      expect(ledgerMock.resolveUnknown).not.toHaveBeenCalled();
      expect(prismaMock.executionStep.update).not.toHaveBeenCalled();
    });

    it('fails closed with BadRequestException when multiple steps match effect', async () => {
      prismaMock.execution.findUnique.mockResolvedValue({
        id: 'exec-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      });
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'eff-1',
        idempotencyKey: 'exec-1:step-1:key',
        state: 'UNKNOWN',
      });
      prismaMock.executionStep.findMany.mockResolvedValue([
        {
          id: 'step-1',
          executionId: 'exec-1',
          idempotencyKey: 'exec-1:step-1:key',
          outputJson: { ledgerId: 'eff-1' },
        },
        {
          id: 'step-2',
          executionId: 'exec-1',
          idempotencyKey: 'exec-1:step-1:key',
          outputJson: { ledgerId: 'eff-1' },
        },
      ]);

      await expect(
        service.resolveOutboundEffect(
          'exec-1',
          'eff-1',
          { targetState: 'COMMITTED', resolutionReason: 'Test' },
          'user-1',
          undefined,
          hooksMock
        )
      ).rejects.toThrow('AMBIGUOUS_TARGET_STEP');

      expect(ledgerMock.resolveUnknown).not.toHaveBeenCalled();
      expect(prismaMock.executionStep.update).not.toHaveBeenCalled();
    });

    it('rejects cross-execution reconciliation attempts', async () => {
      prismaMock.execution.findUnique.mockResolvedValue({
        id: 'exec-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      });
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'eff-foreign',
        idempotencyKey: 'other-exec:step-1:key',
        state: 'UNKNOWN',
      });

      await expect(
        service.resolveOutboundEffect(
          'exec-1',
          'eff-foreign',
          { targetState: 'COMMITTED', resolutionReason: 'Malicious' },
          'user-1',
          undefined,
          hooksMock
        )
      ).rejects.toThrow('OUTBOUND_EFFECT_MISMATCH');

      expect(ledgerMock.resolveUnknown).not.toHaveBeenCalled();
    });
  });

  describe('authorizeRetryOutboundEffect', () => {
    it('authorizes retry, resets matched step to pending, and transitions status via hooks', async () => {
      prismaMock.execution.findUnique.mockResolvedValue({
        id: 'exec-1',
        createdBy: 'user-1',
        status: EXECUTION_STATUS.HUMAN_CONTROL,
      });
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'eff-1',
        idempotencyKey: 'exec-1:step-1:key',
        state: 'FAILED',
      });
      prismaMock.executionStep.findMany.mockResolvedValue([
        {
          id: 'step-1',
          executionId: 'exec-1',
          stepIndex: 0,
          idempotencyKey: 'exec-1:step-1:key',
          status: 'failed',
          takeoverTriggered: true,
        },
      ]);

      const result = await service.authorizeRetryOutboundEffect(
        'exec-1',
        'eff-1',
        { reason: 'Network fixed' },
        'user-1',
        undefined,
        hooksMock
      );

      expect(ledgerMock.authorizeRetry).toHaveBeenCalledWith(
        {
          id: 'eff-1',
          authorizedBy: 'user-1',
          reason: 'Network fixed',
        },
        prismaMock
      );
      expect(result.state).toBe('APPROVED');

      expect(prismaMock.executionStep.update).toHaveBeenCalledWith({
        where: { id: 'step-1' },
        data: expect.objectContaining({
          status: 'pending',
          takeoverTriggered: false,
          errorCode: null,
          errorMessage: null,
        }),
      });

      // No direct status update in DB update
      expect(prismaMock.execution.update.mock.calls[0][0].data.status).toBeUndefined();
      expect(hooksMock.updateStatus).toHaveBeenCalledWith('exec-1', EXECUTION_STATUS.QUEUED);
    });
  });
});
