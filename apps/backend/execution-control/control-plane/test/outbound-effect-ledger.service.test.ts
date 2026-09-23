import { OutboundEffectLedgerService } from '../src/modules/execution/outbox/outbound-effect-ledger.service';

describe('OutboundEffectLedgerService', () => {
  let prismaMock: any;
  let service: OutboundEffectLedgerService;

  beforeEach(() => {
    prismaMock = {
      outboundEffectLedger: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
    };
    service = new OutboundEffectLedgerService(prismaMock);
  });

  describe('prepare', () => {
    it('creates a new ledger entry if not existing', async () => {
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue(null);
      prismaMock.outboundEffectLedger.create.mockResolvedValue({
        id: 'ledger-1',
        state: 'PREPARED',
        payloadHash: 'sha256:abc',
      });

      const res = await service.prepare({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-1',
        canonicalPayload: { to: 'test@example.com' },
        payloadHash: 'sha256:abc',
      });

      expect(res.id).toBe('ledger-1');
      expect(prismaMock.outboundEffectLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            capabilityKey: 'platform.email.send',
            idempotencyKey: 'idem-1',
            payloadHash: 'sha256:abc',
            state: 'PREPARED',
          }),
        })
      );
    });

    it('returns existing entry if payloadHash matches', async () => {
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'PREPARED',
        payloadHash: 'sha256:abc',
      });

      const res = await service.prepare({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-1',
        canonicalPayload: { to: 'test@example.com' },
        payloadHash: 'sha256:abc',
      });

      expect(res.id).toBe('ledger-1');
      expect(prismaMock.outboundEffectLedger.create).not.toHaveBeenCalled();
    });

    it('throws IDEMPOTENCY_PAYLOAD_CONFLICT if payloadHash does not match existing', async () => {
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'PREPARED',
        payloadHash: 'sha256:original',
      });

      await expect(
        service.prepare({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          canonicalPayload: { to: 'test@example.com' },
          payloadHash: 'sha256:tampered',
        })
      ).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');
    });
  });

  describe('approve', () => {
    it('approves a prepared effect when payloadHash matches', async () => {
      const row = { id: 'ledger-1', state: 'APPROVED', payloadHash: 'sha256:abc' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([row]);

      const res = await service.approve({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-1',
        approvedPayloadHash: 'sha256:abc',
        approver: 'admin-1',
      });

      expect(res.state).toBe('APPROVED');
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("SET state = 'APPROVED'"),
        'default',
        'platform.email.send',
        'idem-1',
        'sha256:abc',
        'admin-1'
      );
    });

    it('throws IDEMPOTENCY_PAYLOAD_CONFLICT if approved hash does not match record', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'PREPARED',
        payloadHash: 'sha256:original',
      });

      await expect(
        service.approve({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          approvedPayloadHash: 'sha256:tampered',
        })
      ).rejects.toThrow('IDEMPOTENCY_PAYLOAD_CONFLICT');
    });
  });

  describe('acquireCommit', () => {
    it('returns row when atomic CAS from APPROVED succeeds', async () => {
      const row = { id: 'ledger-1', state: 'COMMITTING' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([row]);

      const res = await service.acquireCommit({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-1',
        payloadHash: 'sha256:abc',
      });

      expect(res).toBe(row);
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("state = 'APPROVED'");
    });

    it('strictly rejects PREPARED state (bypass approval attempt)', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'PREPARED',
        payloadHash: 'sha256:abc',
      });

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_NOT_APPROVED');
    });

    it('strictly rejects UNKNOWN state (must be reconciled by human first)', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'UNKNOWN',
        payloadHash: 'sha256:abc',
      });

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_IN_UNKNOWN_STATE');
    });

    it('strictly rejects FAILED state without explicit retry authorization', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'FAILED',
        payloadHash: 'sha256:abc',
      });

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_FAILED');
    });
  });

  describe('terminal outcomes & CAS protection', () => {
    it('markCommitted enforces state = COMMITTING CAS', async () => {
      const committedRow = { id: 'ledger-1', state: 'COMMITTED' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([committedRow]);

      const res = await service.markCommitted({ id: 'ledger-1', provider: 'smtp', providerRequestId: 'req-1' });
      expect(res).toBe(committedRow);
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("state = 'COMMITTING'");
    });

    it('markCommitted fails if stale worker attempts to commit record already resolved or non-committing', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({ id: 'ledger-1', state: 'UNKNOWN' });

      await expect(
        service.markCommitted({ id: 'ledger-1', provider: 'smtp' })
      ).rejects.toThrow('STATE_CONFLICT');
    });

    it('markUnknown enforces state = COMMITTING CAS', async () => {
      const unknownRow = { id: 'ledger-1', state: 'UNKNOWN' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([unknownRow]);

      const res = await service.markUnknown({ id: 'ledger-1', errorClassification: 'ETIMEDOUT' });
      expect(res).toBe(unknownRow);
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("state = 'COMMITTING'");
    });

    it('resolveUnknown allows human operator to reconcile UNKNOWN to COMMITTED', async () => {
      const resolvedRow = { id: 'ledger-1', state: 'COMMITTED', resolutionReason: 'Verified delivered via logs' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([resolvedRow]);

      const res = await service.resolveUnknown({
        id: 'ledger-1',
        targetState: 'COMMITTED',
        resolutionReason: 'Verified delivered via logs',
        resolvedBy: 'operator-1',
      });
      expect(res).toBe(resolvedRow);
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("state = 'UNKNOWN'");
    });

    it('authorizeRetry allows explicit transition from FAILED to APPROVED', async () => {
      const retriedRow = { id: 'ledger-1', state: 'APPROVED' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([retriedRow]);

      const res = await service.authorizeRetry({
        id: 'ledger-1',
        authorizedBy: 'admin-1',
        reason: 'Temporary network glitch cleared',
      });
      expect(res).toBe(retriedRow);
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("state = 'FAILED'");
    });

    it('reapStaleCommits transitions expired COMMITTING records to UNKNOWN', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([{ id: 'ledger-1' }, { id: 'ledger-2' }]);

      const count = await service.reapStaleCommits(60_000);
      expect(count).toBe(2);
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("SET state = 'UNKNOWN'");
      expect(prismaMock.$queryRawUnsafe.mock.calls[0][0]).toContain("WHERE state = 'COMMITTING'");
    });

    it('acquireCommit automatically transitions stale COMMITTING record to UNKNOWN and throws', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      const staleDate = new Date(Date.now() - 400_000);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'COMMITTING',
        payloadHash: 'sha256:abc',
        updatedAt: staleDate,
      });

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
          staleTimeoutMs: 300_000,
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_IN_UNKNOWN_STATE');

      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("SET state = 'UNKNOWN'"),
        'ledger-1'
      );
    });
  });
});
