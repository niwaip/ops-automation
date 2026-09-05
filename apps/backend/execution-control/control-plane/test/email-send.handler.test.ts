import { executeEmailSend } from '../src/modules/execution/adapters/email/email-send.handler';
import { SmtpClient } from '../src/modules/execution/adapters/email/providers/smtp-client';

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

  it('successfully sends email and returns deliveryId when configured', async () => {
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
    expect(res.output).toMatchObject({
      deliveryId: 'del_mock_12345',
      state: 'accepted',
    });
  });
});
