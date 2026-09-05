import { executeEmailMessages } from '../src/modules/execution/adapters/email/email-messages.handler';
import { ImapClient } from '../src/modules/execution/adapters/email/providers/imap-client';

describe('executeEmailMessages', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects request when selector is missing', async () => {
    const res = await executeEmailMessages({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.messages',
      input: {},
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMAIL_SELECTOR_REQUIRED');
  });

  it('reports EMAIL_NOT_CONFIGURED when no credentials exist', async () => {
    const res = await executeEmailMessages({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.messages',
      input: {
        selector: {
          kind: 'recent',
          folder: 'inbox',
        },
      },
    } as any);

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('EMAIL_NOT_CONFIGURED');
  });

  it('successfully fetches and normalizes messages when configured', async () => {
    jest.spyOn(ImapClient, 'fetchMessages').mockResolvedValue([
      {
        messageRef: 'emsg_v1_mock1234',
        folder: 'inbox',
        subject: '项目周报通知',
        from: { name: '张经理', address: 'manager@example.com' },
        to: [{ address: 'user@example.com' }],
        cc: [],
        receivedAt: '2026-09-02T10:00:00.000Z',
        isRead: false,
        snippet: '本周交付进展顺利，请查收附件。',
        body: {
          format: 'text',
          content: '本周交付进展顺利，请查收附件。',
          truncated: false,
        },
        attachments: [],
        contentTrust: 'untrusted_external',
      },
    ]);

    const res = await executeEmailMessages({
      executionId: 'exe-1',
      stepId: 'step-1',
      skillId: 'platform.email.messages',
      input: {
        selector: {
          kind: 'recent',
          unreadOnly: true,
        },
        limit: 5,
      },
      metadata: {
        runtimeConfigs: {
          EMAIL_ADDRESS: 'user@example.com',
          EMAIL_AUTH_PASSWORD: 'mock-password',
          EMAIL_IMAP_HOST: 'imap.example.com',
        },
      },
    } as any);

    expect(res.success).toBe(true);
    expect(res.output).toMatchObject({
      mailboxKey: 'user@example.com',
      resultCount: 1,
      items: [
        expect.objectContaining({
          messageRef: 'emsg_v1_mock1234',
          subject: '项目周报通知',
          isRead: false,
        }),
      ],
    });
  });
});
