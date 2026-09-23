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
      outboundEffectLedger: {
        findMany: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
    };

    ledgerMock = {
      approve: jest.fn().mockResolvedValue({ state: 'APPROVED' }),
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

  it('approves execution and calls ledger.approve for matching prepared records', async () => {
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
      { comment: 'Looks good', decidedBy: 'approver-1', approvedPayloadHash: 'sha256:hash-abc' } as any,
      hooksMock
    );

    expect(ledgerMock.approve).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      capabilityKey: 'platform.email.send',
      idempotencyKey: 'exec-1:step-1:key',
      approvedPayloadHash: 'sha256:hash-abc',
      approver: 'approver-1',
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
        decidedBy: 'approver-1',
        approvedPayloadHash: 'sha256:hash-abc',
      })
    );
    expect(result.id).toBe('exec-1');
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
      service.approve(
        'exec-1',
        'user-1',
        { comment: 'Looks good' } as any,
        hooksMock
      )
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

  it('rejects execution and marks prepared outbound records as CANCELLED', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.PENDING_APPROVAL,
    });

    await service.reject(
      'exec-1',
      'user-1',
      { comment: 'Denied', decidedBy: 'approver-1' } as any,
      hooksMock
    );

    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("SET state = 'CANCELLED'"),
      'exec-1',
      'Denied',
      'approver-1'
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

  it('resolves unknown outbound effect via ledger', async () => {
    prismaMock.execution.findUnique.mockResolvedValue({
      id: 'exec-1',
      createdBy: 'user-1',
      status: EXECUTION_STATUS.HUMAN_CONTROL,
    });
    ledgerMock.resolveUnknown = jest.fn().mockResolvedValue({
      id: 'eff-1',
      state: 'COMMITTED',
    });

    const result = await service.resolveOutboundEffect(
      'exec-1',
      'eff-1',
      { targetState: 'COMMITTED', resolutionReason: 'Verified in SMTP server logs' },
      'user-1'
    );

    expect(ledgerMock.resolveUnknown).toHaveBeenCalledWith({
      id: 'eff-1',
      targetState: 'COMMITTED',
      resolutionReason: 'Verified in SMTP server logs',
      resolvedBy: 'user-1',
    });
    expect(result.state).toBe('COMMITTED');
  });
});
