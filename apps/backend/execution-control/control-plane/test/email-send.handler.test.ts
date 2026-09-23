import { executeEmailSend } from '../src/modules/execution/adapters/email/email-send.handler';
import { SmtpClient } from '../src/modules/execution/adapters/email/providers/smtp-client';
import { computeOutboundPayloadHash } from '@ops/backend-execution-core';

describe('executeEmailSend', () => {
  const originalEnv = process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE;

  beforeEach(() => {
    delete process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv !== undefined) {
      process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE = originalEnv;
    } else {
      delete process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE;
    }
  });

  it('rejects direct execution by default with DIRECT_EXTERNAL_WRITE_FORBIDDEN (fail-closed)', async () => {
    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        to: [{ address: 'test@example.com' }],
        subject: 'Hello',
        textBody: 'World',
      },
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('DIRECT_EXTERNAL_WRITE_FORBIDDEN');
  });

  it('rejects request when recipients are missing (when direct mode is allowed)', async () => {
    process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE = 'true';
    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        subject: 'Hello',
        textBody: 'World',
      },
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMAIL_RECIPIENT_REQUIRED');
  });

  it('rejects request when content is missing (when direct mode is allowed)', async () => {
    process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE = 'true';
    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        to: [{ address: 'test@example.com' }],
      },
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMAIL_CONTENT_REQUIRED');
  });

  it('reports EMAIL_NOT_CONFIGURED when no credentials exist (when direct mode is allowed)', async () => {
    process.env.ALLOW_LEGACY_DIRECT_EXTERNAL_WRITE = 'true';
    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        to: [{ address: 'test@example.com' }],
        subject: 'Test',
        textBody: 'Hello World',
      },
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMAIL_NOT_CONFIGURED');
  });

  it('rejects invalid phase with INVALID_EFFECT_PHASE', async () => {
    const sendSpy = jest.spyOn(SmtpClient, 'send');

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        phase: 'invalid_phase' as any,
        to: [{ address: 'recipient@example.com' }],
        subject: '部署上线通知',
        textBody: '准备发布 v2.0',
      },
    } as any, 'idem-key-123');

    expect(sendSpy).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('INVALID_EFFECT_PHASE');
  });

  it('supports prepare phase: returns canonicalPayload, payloadHash, and persists to ledger', async () => {
    const sendSpy = jest.spyOn(SmtpClient, 'send');
    const ledgerMock = {
      prepare: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'PREPARED' }),
      acquireCommit: jest.fn(),
      markCommitted: jest.fn(),
      markUnknown: jest.fn(),
      markFailed: jest.fn(),
    } as any;

    const res = await executeEmailSend(
      {
        executionId: 'exe-1',
        stepId: 'step-1',
        skillId: 'platform.email.send',
        input: {
          phase: 'prepare',
          to: [{ address: 'recipient@example.com' }],
          subject: '部署上线通知',
          textBody: '准备发布 v2.0',
        },
      } as any,
      'idem-key-123',
      ledgerMock
    );

    expect(sendSpy).not.toHaveBeenCalled();
    expect(ledgerMock.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-key-123',
        payloadHash: res.payloadHash,
      })
    );
    expect(res.success).toBe(true);
    expect(res.status).toBe('prepared');
    expect(res.payloadHash).toBeDefined();
    expect(res.output).toMatchObject({
      phase: 'prepare',
      idempotencyKey: 'idem-key-123',
      payloadHash: res.payloadHash,
      ledgerId: 'ledger-entry-1',
    });
  });

  it('supports commit phase: rejects if payloadHash does not match computed hash', async () => {
    const sendSpy = jest.spyOn(SmtpClient, 'send');

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        phase: 'commit',
        payloadHash: 'sha256:tampered_hash_value',
        to: [{ address: 'recipient@example.com' }],
        subject: '部署上线通知',
        textBody: '准备发布 v2.0',
      },
    } as any, 'idem-key-123');

    expect(sendSpy).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('PAYLOAD_HASH_MISMATCH');
  });

  it('rejects commit phase without payloadHash with PAYLOAD_HASH_REQUIRED', async () => {
    const sendSpy = jest.spyOn(SmtpClient, 'send');

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        phase: 'commit',
        to: [{ address: 'recipient@example.com' }],
        subject: '部署上线通知',
        textBody: '准备发布 v2.0',
      },
    } as any, 'idem-key-123');

    expect(sendSpy).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('PAYLOAD_HASH_REQUIRED');
  });

  it('supports commit phase: acquires commit from ledger, sends email, and marks committed', async () => {
    const canonicalPayload = {
      mailboxKey: null,
      mode: 'new',
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      subject: '部署上线通知',
      textBody: '准备发布 v2.0',
      replyToMessageRef: null,
    };
    const validHash = computeOutboundPayloadHash(canonicalPayload);

    const sendSpy = jest.spyOn(SmtpClient, 'send').mockResolvedValue({
      deliveryId: 'del_commit_12345',
      acceptedAt: '2026-09-23T12:00:00.000Z',
    });

    const ledgerMock = {
      prepare: jest.fn(),
      acquireCommit: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'COMMITTING' }),
      markCommitted: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'COMMITTED' }),
      markUnknown: jest.fn(),
      markFailed: jest.fn(),
    } as any;

    const res = await executeEmailSend(
      {
        executionId: 'exe-1',
        stepId: 'step-1',
        skillId: 'platform.email.send',
        input: {
          phase: 'commit',
          payloadHash: validHash,
          to: [{ address: 'recipient@example.com' }],
          subject: '部署上线通知',
          textBody: '准备发布 v2.0',
        },
        metadata: {
          runtimeConfigs: {
            EMAIL_ADDRESS: 'sender@example.com',
            EMAIL_AUTH_PASSWORD: 'mock-password',
            EMAIL_SMTP_HOST: 'smtp.example.com',
          },
        },
      } as any,
      'idem-key-123',
      ledgerMock
    );

    expect(ledgerMock.acquireCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'platform.email.send',
        idempotencyKey: 'idem-key-123',
        payloadHash: validHash,
      })
    );
    expect(sendSpy).toHaveBeenCalled();
    expect(ledgerMock.markCommitted).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ledger-entry-1',
        providerMessageId: 'del_commit_12345',
      })
    );
    expect(res.success).toBe(true);
    expect(res.status).toBe('completed');
    expect(res.payloadHash).toBe(validHash);
    expect(res.output).toMatchObject({
      deliveryId: 'del_commit_12345',
      state: 'accepted',
    });
  });

  it('classifies real SmtpClient timeout error (Chinese message) as OUTBOUND_EFFECT_UNKNOWN and marks ledger unknown', async () => {
    // Exact error shape thrown by SmtpClient on socket timeout
    const realSmtpTimeout = new Error('SMTP 发信请求超时 (15000ms): connection or write timed out [ETIMEDOUT]') as Error & { code?: string; isTimeout?: boolean };
    realSmtpTimeout.code = 'ETIMEDOUT';
    realSmtpTimeout.isTimeout = true;
    jest.spyOn(SmtpClient, 'send').mockRejectedValue(realSmtpTimeout);

    const canonicalPayload = {
      mailboxKey: null,
      mode: 'new',
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      subject: '发布上线确认',
      textBody: '系统版本已成功发布至生产环境。',
      replyToMessageRef: null,
    };
    const validHash = computeOutboundPayloadHash(canonicalPayload);

    const ledgerMock = {
      prepare: jest.fn(),
      acquireCommit: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'COMMITTING' }),
      markCommitted: jest.fn(),
      markUnknown: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'UNKNOWN' }),
      markFailed: jest.fn(),
    } as any;

    const res = await executeEmailSend(
      {
        executionId: 'exe-1',
        stepId: 'step-1',
        skillId: 'platform.email.send',
        input: {
          phase: 'commit',
          payloadHash: validHash,
          to: [{ address: 'recipient@example.com' }],
          subject: '发布上线确认',
          textBody: '系统版本已成功发布至生产环境。',
        },
        metadata: {
          runtimeConfigs: {
            EMAIL_ADDRESS: 'sender@example.com',
            EMAIL_AUTH_PASSWORD: 'mock-password',
            EMAIL_SMTP_HOST: 'smtp.example.com',
          },
        },
      } as any,
      'idem-key-123',
      ledgerMock
    );

    expect(ledgerMock.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ledger-entry-1',
        errorClassification: 'OUTBOUND_EFFECT_UNKNOWN',
      })
    );
    expect(res.success).toBe(false);
    expect(res.status).toBe('unknown');
    expect(res.errorCode).toBe('OUTBOUND_EFFECT_UNKNOWN');
    expect(res.payloadHash).toBe(validHash);
  });

  it('also classifies error with only Chinese 超时 as UNKNOWN even if code is missing', async () => {
    const rawChineseTimeout = new Error('SMTP 发信请求超时 (15000ms)');
    jest.spyOn(SmtpClient, 'send').mockRejectedValue(rawChineseTimeout);

    const canonicalPayload = {
      mailboxKey: null,
      mode: 'new',
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      subject: '发布上线确认',
      textBody: '系统版本已成功发布至生产环境。',
      replyToMessageRef: null,
    };
    const validHash = computeOutboundPayloadHash(canonicalPayload);

    const ledgerMock = {
      prepare: jest.fn(),
      acquireCommit: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'COMMITTING' }),
      markCommitted: jest.fn(),
      markUnknown: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'UNKNOWN' }),
      markFailed: jest.fn(),
    } as any;

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        phase: 'commit',
        payloadHash: validHash,
        to: [{ address: 'recipient@example.com' }],
        subject: '发布上线确认',
        textBody: '系统版本已成功发布至生产环境。',
      },
      metadata: {
        runtimeConfigs: {
          EMAIL_ADDRESS: 'sender@example.com',
          EMAIL_AUTH_PASSWORD: 'mock-password',
          EMAIL_SMTP_HOST: 'smtp.example.com',
        },
      },
    } as any, 'idem-key-123', ledgerMock);

    expect(res.success).toBe(false);
    expect(res.status).toBe('unknown');
    expect(res.errorCode).toBe('OUTBOUND_EFFECT_UNKNOWN');
  });

  it('rejects commit phase with OUTBOUND_EFFECT_LEDGER_UNAVAILABLE when ledger is missing', async () => {
    const canonicalPayload = {
      mailboxKey: null,
      mode: 'new',
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Test',
      textBody: 'Body',
      replyToMessageRef: null,
    };
    const validHash = computeOutboundPayloadHash(canonicalPayload);

    const res = await executeEmailSend(
      {
        executionId: 'exe-1',
        stepId: 'step-1',
        skillId: 'platform.email.send',
        input: {
          phase: 'commit',
          payloadHash: validHash,
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test',
          textBody: 'Body',
        },
      } as any,
      'idem-key-123'
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('OUTBOUND_EFFECT_LEDGER_UNAVAILABLE');
  });

  it('rejects prepare phase with OUTBOUND_EFFECT_LEDGER_UNAVAILABLE when ledger is missing', async () => {
    const res = await executeEmailSend(
      {
        executionId: 'exe-1',
        stepId: 'step-1',
        skillId: 'platform.email.send',
        input: {
          phase: 'prepare',
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test',
          textBody: 'Body',
        },
      } as any,
      'idem-key-123'
    );

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('OUTBOUND_EFFECT_LEDGER_UNAVAILABLE');
  });

  it('converts markCommitted database exception to status unknown and OUTBOUND_EFFECT_UNKNOWN', async () => {
    const canonicalPayload = {
      mailboxKey: null,
      mode: 'new',
      to: [{ address: 'recipient@example.com' }],
      cc: [],
      bcc: [],
      subject: '部署上线通知',
      textBody: '准备发布 v2.0',
      replyToMessageRef: null,
    };
    const validHash = computeOutboundPayloadHash(canonicalPayload);

    jest.spyOn(SmtpClient, 'send').mockResolvedValue({
      deliveryId: 'del_commit_12345',
      acceptedAt: '2026-09-23T12:00:00.000Z',
    });

    const ledgerMock = {
      prepare: jest.fn(),
      acquireCommit: jest.fn().mockResolvedValue({ id: 'ledger-entry-1', state: 'COMMITTING' }),
      markCommitted: jest.fn().mockRejectedValue(new Error('Connection terminated unexpectedly')),
      markUnknown: jest.fn(),
      markFailed: jest.fn(),
    } as any;

    const res = await executeEmailSend(
      {
        executionId: 'exe-1',
        stepId: 'step-1',
        skillId: 'platform.email.send',
        input: {
          phase: 'commit',
          payloadHash: validHash,
          to: [{ address: 'recipient@example.com' }],
          subject: '部署上线通知',
          textBody: '准备发布 v2.0',
        },
        metadata: {
          runtimeConfigs: {
            EMAIL_ADDRESS: 'sender@example.com',
            EMAIL_AUTH_PASSWORD: 'mock-password',
            EMAIL_SMTP_HOST: 'smtp.example.com',
          },
        },
      } as any,
      'idem-key-123',
      ledgerMock
    );

    expect(res.success).toBe(false);
    expect(res.status).toBe('unknown');
    expect(res.errorCode).toBe('OUTBOUND_EFFECT_UNKNOWN');
    expect(res.errorMessage).toContain('效果账本提交落库失败');
  });
});
