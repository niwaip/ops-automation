import { executeEmailSend } from '../src/modules/execution/adapters/email/email-send.handler';
import { SmtpClient } from '../src/modules/execution/adapters/email/providers/smtp-client';
import { computeOutboundPayloadHash } from '@ops/backend-execution-core';

describe('executeEmailSend', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects request when recipients are missing', async () => {
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

  it('rejects request when content is missing', async () => {
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

  it('reports EMAIL_NOT_CONFIGURED when no credentials exist', async () => {
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

  it('supports prepare phase: returns canonicalPayload and payloadHash without network call', async () => {
    const sendSpy = jest.spyOn(SmtpClient, 'send');

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
        phase: 'prepare',
        to: [{ address: 'recipient@example.com' }],
        subject: '部署上线通知',
        textBody: '准备发布 v2.0',
      },
    } as any, 'idem-key-123');

    expect(sendSpy).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.status).toBe('prepared');
    expect(res.payloadHash).toBeDefined();
    expect(res.payloadHash?.startsWith('sha256:')).toBe(true);
    expect(res.output).toMatchObject({
      phase: 'prepare',
      idempotencyKey: 'idem-key-123',
      payloadHash: res.payloadHash,
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

  it('supports commit phase: sends email when payloadHash matches', async () => {
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

    const res = await executeEmailSend({
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
    } as any, 'idem-key-123');

    expect(sendSpy).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.status).toBe('completed');
    expect(res.payloadHash).toBe(validHash);
    expect(res.output).toMatchObject({
      deliveryId: 'del_commit_12345',
      state: 'accepted',
    });
  });

  it('classifies network timeout errors as UNKNOWN (outbound effect uncertain)', async () => {
    const timeoutError = new Error('connect ETIMEDOUT 192.168.1.1:465');
    (timeoutError as any).code = 'ETIMEDOUT';
    jest.spyOn(SmtpClient, 'send').mockRejectedValue(timeoutError);

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
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
    } as any);

    expect(res.success).toBe(false);
    expect(res.status).toBe('unknown');
    expect(res.errorCode).toBe('OUTBOUND_EFFECT_UNKNOWN');
    expect(res.payloadHash).toBeDefined();
  });

  it('successfully sends email and returns deliveryId when configured (direct mode)', async () => {
    jest.spyOn(SmtpClient, 'send').mockResolvedValue({
      deliveryId: 'del_mock_12345',
      acceptedAt: '2026-09-02T10:00:00.000Z',
    });

    const res = await executeEmailSend({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.send',
      input: {
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
    } as any);

    expect(res.success).toBe(true);
    expect(res.status).toBe('completed');
    expect(res.payloadHash).toBeDefined();
    expect(res.output).toMatchObject({
      deliveryId: 'del_mock_12345',
      state: 'accepted',
    });
  });
});
