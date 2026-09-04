import { Logger } from '@nestjs/common';
import type {
  EmailConnectionConfig,
  EmailMessagesInput,
  EmailMessagesOutput,
  EmailProviderAdapter,
  EmailSendInput,
  EmailSendOutput,
  EmailUpdateInput,
  EmailUpdateOutput,
} from './email-engine.types';
import { ImapSmtpEmailProvider } from './providers/imap-smtp.provider';
import { MicrosoftGraphEmailProvider } from './providers/microsoft-graph.provider';

export class EmailOrchestrator {
  private readonly logger = new Logger(EmailOrchestrator.name);
  private readonly providers = new Map<string, EmailProviderAdapter>();

  constructor() {
    const imapSmtp = new ImapSmtpEmailProvider();
    const msGraph = new MicrosoftGraphEmailProvider();
    this.providers.set(imapSmtp.provider, imapSmtp);
    this.providers.set('default', imapSmtp);
    this.providers.set(msGraph.provider, msGraph);
    this.providers.set('outlook_oauth', msGraph);
  }

  resolveConfig(runtimeConfigs?: Record<string, string | undefined>): EmailConnectionConfig {
    const env = process.env;
    const config = runtimeConfigs || {};

    const emailAddress = config.EMAIL_ADDRESS || env.EMAIL_ADDRESS || '';
    const authPassword = config.EMAIL_AUTH_PASSWORD || env.EMAIL_AUTH_PASSWORD || '';
    const imapHost = config.EMAIL_IMAP_HOST || env.EMAIL_IMAP_HOST || '';
    const imapPort = parseInt(config.EMAIL_IMAP_PORT || env.EMAIL_IMAP_PORT || '993', 10);
    const imapSecure = config.EMAIL_IMAP_SECURE !== 'false' && env.EMAIL_IMAP_SECURE !== 'false';
    const smtpHost = config.EMAIL_SMTP_HOST || env.EMAIL_SMTP_HOST || '';
    const smtpPort = parseInt(config.EMAIL_SMTP_PORT || env.EMAIL_SMTP_PORT || '465', 10);
    const smtpSecure = config.EMAIL_SMTP_SECURE !== 'false' && env.EMAIL_SMTP_SECURE !== 'false';
    const senderName = config.EMAIL_SENDER_NAME || env.EMAIL_SENDER_NAME || '';
    const providerType = (config.EMAIL_PROVIDER_TYPE || env.EMAIL_PROVIDER_TYPE || 'smtp_imap') as
      | 'smtp_imap'
      | 'gmail_oauth'
      | 'outlook_oauth';

    return {
      providerType,
      emailAddress,
      authPassword,
      imapHost: imapHost || undefined,
      imapPort: isNaN(imapPort) ? 993 : imapPort,
      imapSecure,
      smtpHost: smtpHost || undefined,
      smtpPort: isNaN(smtpPort) ? 465 : smtpPort,
      smtpSecure,
      senderName: senderName || undefined,
    };
  }

  getProvider(providerType?: string): EmailProviderAdapter {
    const p = this.providers.get(providerType || 'smtp_imap') || this.providers.get('default');
    if (!p) {
      throw new Error(`未找到邮件服务商适配器: ${providerType}`);
    }
    return p;
  }

  async testConnection(
    runtimeConfigs?: Record<string, string | undefined>
  ): Promise<{ success: boolean; message: string }> {
    const config = this.resolveConfig(runtimeConfigs);
    const provider = this.getProvider(config.providerType);
    return provider.testConnection(config);
  }

  async listMessages(
    input: EmailMessagesInput,
    runtimeConfigs?: Record<string, string | undefined>
  ): Promise<EmailMessagesOutput> {
    const config = this.resolveConfig(runtimeConfigs);
    const provider = this.getProvider(config.providerType);

    if (!provider.isConfigured(config)) {
      throw new Error('未配置有效的邮箱服务连接参数（账号、授权码或主机地址），请在管理后台完成配置');
    }

    return provider.listMessages(input, config);
  }

  async sendMessage(
    input: EmailSendInput,
    runtimeConfigs?: Record<string, string | undefined>
  ): Promise<EmailSendOutput> {
    const config = this.resolveConfig(runtimeConfigs);
    const provider = this.getProvider(config.providerType);

    if (!provider.isConfigured(config)) {
      throw new Error('未配置有效的发信服务连接参数（账号、授权码或 SMTP 主机），请在管理后台完成配置');
    }

    return provider.sendMessage(input, config);
  }

  async updateMessages(
    input: EmailUpdateInput,
    runtimeConfigs?: Record<string, string | undefined>
  ): Promise<EmailUpdateOutput> {
    const config = this.resolveConfig(runtimeConfigs);
    const provider = this.getProvider(config.providerType);

    if (!provider.isConfigured(config)) {
      throw new Error('未配置有效的邮箱服务连接参数，请在管理后台完成配置');
    }

    if (typeof provider.updateMessages !== 'function') {
      throw new Error(`当前服务商 [${config.providerType}] 暂不支持邮件状态更新`);
    }

    return provider.updateMessages(input, config);
  }
}

export const defaultEmailOrchestrator = new EmailOrchestrator();
