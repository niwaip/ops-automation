import type {
  EmailConnectionConfig,
  EmailMessagesInput,
  EmailMessagesOutput,
  EmailProviderAdapter,
  EmailSendInput,
  EmailSendOutput,
} from '../email-engine.types';
import { ImapClient } from './imap-client';
import { SmtpClient } from './smtp-client';

export class ImapSmtpEmailProvider implements EmailProviderAdapter {
  readonly provider = 'smtp_imap';

  isConfigured(config: EmailConnectionConfig): boolean {
    return Boolean(config.emailAddress && config.authPassword && (config.smtpHost || config.imapHost));
  }

  async testConnection(
    config: EmailConnectionConfig
  ): Promise<{ success: boolean; message: string }> {
    if (!this.isConfigured(config)) {
      return { success: false, message: '请配置完整的邮箱账号、密码/授权码及服务器地址' };
    }

    const checks: string[] = [];

    if (config.smtpHost) {
      const smtpRes = await SmtpClient.verify(config);
      if (!smtpRes.success) {
        return { success: false, message: `SMTP 发信验证失败: ${smtpRes.message}` };
      }
      checks.push('SMTP 发信可用');
    }

    if (config.imapHost) {
      const imapRes = await ImapClient.verify(config);
      if (!imapRes.success) {
        return { success: false, message: `IMAP 收信验证失败: ${imapRes.message}` };
      }
      checks.push('IMAP 收信可用');
    }

    return { success: true, message: `连接成功 (${checks.join('，')})` };
  }

  async listMessages(
    input: EmailMessagesInput,
    config: EmailConnectionConfig
  ): Promise<EmailMessagesOutput> {
    const items = await ImapClient.fetchMessages(input, config);
    return {
      mailboxKey: input.mailboxKey || config.emailAddress || 'default',
      items,
      resultCount: items.length,
      fetchedAt: new Date().toISOString(),
      warnings: [],
    };
  }

  async sendMessage(
    input: EmailSendInput,
    config: EmailConnectionConfig
  ): Promise<EmailSendOutput> {
    const fromAddress = config.emailAddress || '';
    if (!fromAddress) {
      throw new Error('未配置发信邮箱账号');
    }

    const sendRes = await SmtpClient.send(
      {
        from: fromAddress,
        senderName: config.senderName,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject || '(无主题)',
        textBody: input.textBody,
        inReplyTo: input.replyToMessageRef,
      },
      config
    );

    return {
      deliveryId: sendRes.deliveryId,
      state: 'accepted',
      acceptedAt: sendRes.acceptedAt,
      warnings: [],
    };
  }
}
