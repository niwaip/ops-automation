import { ExecutionApprovalService } from '../src/modules/execution/human-control/execution-approval.service';
import { APPROVAL_STATUS } from '../src/modules/execution/contracts/approval-status';
import { EXECUTION_STATUS } from '../src/modules/execution/contracts/execution-status';
import { EXECUTION_EVENT_TYPE } from '../src/modules/execution/contracts/execution-event-type';

describe('ExecutionApprovalService', () => {
  let service: ExecutionApprovalService;
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
        findMany: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
    };

    ledgerMock = {
      approve: jest.fn().mockResolvedValue({ state: 'APPROVED' }),
      resolveUnknown: jest
        .fn()
        .mockResolvedValue({ id: 'eff-1', state: 'COMMITTED', providerMessageId: 'msg-123' }),
      authorizeRetry: jest.fn().mockResolvedValue({ id: 'eff-1', state: 'APPROVED' }),
    };

    outboxMock = {
      enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    hooksMock = {
      getExecutionDto: jest.fn().mockResolvedValue({ id: 'exec-1', status: 'queued' }),
      emitEvent: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      startExecution: jest.fn().mockResolvedValue(undefined),
    };

    service = new ExecutionApprovalService(prismaMock, outboxMock, ledgerMock);
  });

  it('approves execution and binds ledger approver to authenticated user (no spoofing)', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    prismaMock.outboundEffectLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-1:key',
        payloadHash: 'sha256:hash-abc',
        state: 'PREPARED',
      },
    ]);

    const result = await service.approve(
      'exec-1',
      'user-1',
      {
        comment: 'Looks good',
        decidedBy: 'spoofed-attacker',
        approvedPayloadHash: 'sha256:hash-abc',
      } as any,
      hooksMock
    );

    expect(ledgerMock.approve).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      capabilityKey: 'platform.email.send',
      idempotencyKey: 'exec-1:step-1:key',
      approvedPayloadHash: 'sha256:hash-abc',
      approver: 'user-1',
    });

    expect(prismaMock.execution.update).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: { approvalStatus: APPROVAL_STATUS.APPROVED },
    });

    expect(hooksMock.updateStatus).toHaveBeenCalledWith('exec-1', EXECUTION_STATUS.QUEUED);
    expect(hooksMock.emitEvent).toHaveBeenCalledWith(
      'exec-1',
      EXECUTION_EVENT_TYPE.EXECUTION_APPROVED,
      expect.objectContaining({
        userId: 'user-1',
        decidedBy: 'user-1',
        approvedPayloadHash: 'sha256:hash-abc',
      })
    );
    expect(result.id).toBe('exec-1');
  });

  it('approves execution and binds approver to requester id when provided', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    prismaMock.outboundEffectLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-1:key',
        payloadHash: 'sha256:hash-abc',
        state: 'PREPARED',
      },
    ]);

    await service.approve(
      'exec-1',
      'user-1',
      {
        comment: 'Approved by admin',
        decidedBy: 'spoofed-admin',
        approvedPayloadHash: 'sha256:hash-abc',
      } as any,
      hooksMock,
      { id: 'admin-42', role: 'admin' }
    );

    expect(ledgerMock.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        approver: 'admin-42',
      })
    );
  });

  it('rejects approval when prepared records exist but approvedPayloadHash is missing', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    prismaMock.outboundEffectLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-1:key',
        payloadHash: 'sha256:hash-original',
        state: 'PREPARED',
      },
    ]);

    await expect(
      service.approve('exec-1', 'user-1', { comment: 'Looks good' } as any, hooksMock)
    ).rejects.toThrow('APPROVED_PAYLOAD_HASH_REQUIRED');

    expect(ledgerMock.approve).not.toHaveBeenCalled();
  });

  it('rejects approval if approvedPayloadHash does not match prepared hash', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    prismaMock.outboundEffectLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-1:key',
        payloadHash: 'sha256:hash-original',
        state: 'PREPARED',
      },
    ]);

    await expect(
      service.approve(
        'exec-1',
        'user-1',
        { comment: 'Looks good', approvedPayloadHash: 'sha256:tampered' } as any,
        hooksMock
      )
    ).rejects.toThrow('PAYLOAD_HASH_MISMATCH');

    expect(ledgerMock.approve).not.toHaveBeenCalled();
  });

  it('rejects approval when specified effectId is not found among prepared records', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    prismaMock.outboundEffectLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-1:key',
        payloadHash: 'sha256:hash-abc',
        state: 'PREPARED',
      },
    ]);

    await expect(
      service.approve(
        'exec-1',
        'user-1',
        {
          comment: 'Approved',
          effectId: 'non-existent-effect',
          approvedPayloadHash: 'sha256:hash-abc',
        } as any,
        hooksMock
      )
    ).rejects.toThrow('EFFECT_NOT_FOUND');
  });

  it('rejects approval when multiple prepared records exist without explicit effectId', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    prismaMock.outboundEffectLedger.findMany.mockResolvedValue([
      {
        id: 'led-1',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-1:key',
        payloadHash: 'sha256:hash-abc',
        state: 'PREPARED',
      },
      {
        id: 'led-2',
        tenantId: 'tenant-1',
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'exec-1:step-2:key',
        payloadHash: 'sha256:hash-xyz',
        state: 'PREPARED',
      },
    ]);

    await expect(
      service.approve(
        'exec-1',
        'user-1',
        {
          comment: 'Approved',
          approvedPayloadHash: 'sha256:hash-abc',
        } as any,
        hooksMock
      )
    ).rejects.toThrow('EFFECT_ID_REQUIRED');
  });

  it('rejects execution and marks prepared outbound records as CANCELLED', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    await service.reject(
      'exec-1',
      'user-1',
      { comment: 'Denied', decidedBy: 'spoofed-id' } as any,
      hooksMock
    );

    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("SET state = 'CANCELLED'"),
      'exec-1',
      'Denied',
      'user-1'
    );

    expect(prismaMock.execution.update).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        approvalStatus: APPROVAL_STATUS.REJECTED,
        failureReason: 'Denied',
      }),
    });

    expect(hooksMock.updateStatus).toHaveBeenCalledWith('exec-1', EXECUTION_STATUS.CANCELLED);
  });

  it('resolves unknown outbound effect to COMMITTED, updates step, and resumes execution', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
    });
    prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
      id: 'eff-1',
      idempotencyKey: 'exec-1:step-1:v1',
      state: 'UNKNOWN',
    });
    prismaMock.executionStep.findMany.mockResolvedValue([
      {
        id: 'step-1',
        executionId: 'exec-1',
        stepIndex: 0,
        status: 'failed',
        takeoverTriggered: true,
        outputJson: {},
      },
    ]);

    const result = await service.resolveOutboundEffect(
      'exec-1',
      'eff-1',
      { targetState: 'COMMITTED', resolutionReason: 'Verified in SMTP server logs' },
      'user-1',
      undefined,
      hooksMock
    );

    expect(ledgerMock.resolveUnknown).toHaveBeenCalledWith({
      id: 'eff-1',
      targetState: 'COMMITTED',
      resolutionReason: 'Verified in SMTP server logs',
      resolvedBy: 'user-1',
    });
    expect(result.state).toBe('COMMITTED');

    // Step updated to succeeded
    expect(prismaMock.executionStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: expect.objectContaining({
        status: 'succeeded',
        takeoverTriggered: false,
        outputJson: expect.objectContaining({
          deliveryId: 'msg-123',
          reconciledState: 'COMMITTED',
        }),
      }),
    });

    // Execution cleared and queued
    expect(prismaMock.execution.update).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: EXECUTION_STATUS.QUEUED,
        takeoverRequired: false,
        takeoverReason: null,
      }),
    });
  });

  it('rejects resolveOutboundEffect when record does not belong to execution (cross-execution boundary)', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
    });
    prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
      id: 'eff-foreign',
      idempotencyKey: 'other-exec:step-9:v1',
      state: 'UNKNOWN',
    });

    await expect(
      service.resolveOutboundEffect(
        'exec-1',
        'eff-foreign',
        { targetState: 'COMMITTED', resolutionReason: 'Illegal reconciliation attempt' },
        'user-1',
        undefined,
        hooksMock
      )
    ).rejects.toThrow('OUTBOUND_EFFECT_MISMATCH');

    expect(ledgerMock.resolveUnknown).not.toHaveBeenCalled();
  });

  it('authorizes retry of failed outbound effect, resets step to pending, and re-queues execution', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
    });
    prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
      id: 'eff-1',
      idempotencyKey: 'exec-1:step-1:v1',
      state: 'FAILED',
    });
    prismaMock.executionStep.findMany.mockResolvedValue([
      {
        id: 'step-1',
        executionId: 'exec-1',
        stepIndex: 0,
        status: 'failed',
        takeoverTriggered: true,
      },
    ]);

    const result = await service.authorizeRetryOutboundEffect(
      'exec-1',
      'eff-1',
      { reason: 'Network glitch resolved' },
      'user-1',
      undefined,
      hooksMock
    );

    expect(ledgerMock.authorizeRetry).toHaveBeenCalledWith({
      id: 'eff-1',
      authorizedBy: 'user-1',
      reason: 'Network glitch resolved',
    });
    expect(result.state).toBe('APPROVED');

    // Step reset to pending
    expect(prismaMock.executionStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: expect.objectContaining({
        status: 'pending',
        takeoverTriggered: false,
        errorCode: null,
        errorMessage: null,
      }),
    });

    // Execution queued
    expect(prismaMock.execution.update).toHaveBeenCalledWith({
      where: { id: 'exec-1' },
      data: expect.objectContaining({
        status: EXECUTION_STATUS.QUEUED,
        takeoverRequired: false,
      }),
    });
  });
});
