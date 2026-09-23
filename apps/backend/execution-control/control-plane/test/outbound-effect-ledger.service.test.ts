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

  describe('acquireCommit', () => {
    it('returns row when atomic CAS succeeds', async () => {
      const row = { id: 'ledger-1', state: 'COMMITTING' };
      prismaMock.$queryRawUnsafe.mockResolvedValue([row]);

      const res = await service.acquireCommit({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-1',
        payloadHash: 'sha256:abc',
      });

      expect(res).toBe(row);
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('throws OUTBOUND_EFFECT_NOT_PREPARED when no record exists', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue(null);

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_NOT_PREPARED');
    });

    it('throws OUTBOUND_EFFECT_LOCKED when already in COMMITTING state', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'COMMITTING',
        payloadHash: 'sha256:abc',
      });

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_LOCKED');
    });

    it('throws OUTBOUND_EFFECT_ALREADY_COMMITTED when already in COMMITTED state', async () => {
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);
      prismaMock.outboundEffectLedger.findUnique.mockResolvedValue({
        id: 'ledger-1',
        state: 'COMMITTED',
        payloadHash: 'sha256:abc',
      });

      await expect(
        service.acquireCommit({
          capabilityKey: 'platform.email.send',
          idempotencyKey: 'idem-1',
          payloadHash: 'sha256:abc',
        })
      ).rejects.toThrow('OUTBOUND_EFFECT_ALREADY_COMMITTED');
    });
  });

  describe('outcomes', () => {
    it('markCommitted updates state to COMMITTED', async () => {
      prismaMock.outboundEffectLedger.update.mockResolvedValue({ id: 'ledger-1', state: 'COMMITTED' });
      await service.markCommitted({ id: 'ledger-1', provider: 'smtp', providerRequestId: 'req-1' });
      expect(prismaMock.outboundEffectLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ledger-1' },
          data: expect.objectContaining({ state: 'COMMITTED', provider: 'smtp', providerRequestId: 'req-1' }),
        })
      );
    });

    it('markUnknown updates state to UNKNOWN', async () => {
      prismaMock.outboundEffectLedger.update.mockResolvedValue({ id: 'ledger-1', state: 'UNKNOWN' });
      await service.markUnknown({ id: 'ledger-1', errorClassification: 'ETIMEDOUT' });
      expect(prismaMock.outboundEffectLedger.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ledger-1' },
          data: expect.objectContaining({ state: 'UNKNOWN', errorClassification: 'ETIMEDOUT' }),
        })
      );
    });
  });
});
