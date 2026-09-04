import axios from 'axios';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  EmailAddress,
  EmailConnectionConfig,
  EmailMessagesInput,
  EmailMessagesOutput,
  EmailProviderAdapter,
  EmailSendInput,
  EmailSendOutput,
  EmailUpdateInput,
  EmailUpdateOutput,
  NormalizedEmailMessage,
} from '../email-engine.types';

export function htmlToCleanPlainText(html?: string): string {
  if (!html || typeof html !== 'string') return '';

  return html
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url, linkText) => {
      const cleanLinkText = linkText.replace(/<[^>]+>/g, '').trim();
      if (!cleanLinkText || cleanLinkText === url) return url;
      return `[${cleanLinkText}](${url})`;
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\r\n|\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export class MicrosoftGraphEmailProvider implements EmailProviderAdapter {
  readonly provider = 'microsoft_oauth';

  isConfigured(config: EmailConnectionConfig): boolean {
    return Boolean(config.accessToken || config.authPassword);
  }

  private getAccessToken(config: EmailConnectionConfig): string {
    const token = config.accessToken || config.authPassword || '';
    if (!token) {
      throw new Error('未提供有效的微软 OAuth 2.0 访问令牌');
    }
    return token.startsWith('Bearer ') ? token.slice(7) : token;
  }

  async testConnection(
    config: EmailConnectionConfig
  ): Promise<{ success: boolean; message: string }> {
    const token = this.getAccessToken(config);
    try {
      const response = await axios.get<any>('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });

      const user = response.data;
      return {
        success: true,
        message: `微软官方 Graph 连通成功 (账号: ${user.userPrincipalName || user.mail || config.emailAddress})`,
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message;
      return {
        success: false,
        message: `微软 Graph 认证失败: ${msg}`,
      };
    }
  }

  async listMessages(
    input: EmailMessagesInput,
    config: EmailConnectionConfig
  ): Promise<EmailMessagesOutput> {
    const token = this.getAccessToken(config);
    const isUnreadOnly =
      input.selector.kind === 'recent'
        ? input.selector.unreadOnly
        : input.selector.kind === 'search'
          ? input.selector.filters?.unreadOnly
          : false;

    let query = `$top=50&$orderby=receivedDateTime desc`;
    if (isUnreadOnly) {
      query += `&$filter=isRead eq false`;
    }

    try {
      const response = await axios.get<any>(
        `https://graph.microsoft.com/v1.0/me/messages?${query}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        }
      );

      const rawItems: any[] = response.data?.value || [];
      const items: NormalizedEmailMessage[] = rawItems.map((raw) => {
        const id = raw.id || '';
        const opaqueDigest = crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);
        const messageRef = raw.id || `emsg_v1_${opaqueDigest}`;

        const fromAddr: EmailAddress | undefined = raw.from?.emailAddress
          ? {
              name: raw.from.emailAddress.name,
              address: raw.from.emailAddress.address?.toLowerCase(),
            }
          : undefined;

        const toList: EmailAddress[] = (raw.toRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name,
          address: r.emailAddress?.address?.toLowerCase(),
        }));

        const ccList: EmailAddress[] = (raw.ccRecipients || []).map((r: any) => ({
          name: r.emailAddress?.name,
          address: r.emailAddress?.address?.toLowerCase(),
        }));

        const isHtml = raw.body?.contentType?.toLowerCase() === 'html';
        const rawContent = raw.body?.content || '';
        let cleanedContent = rawContent;
        if (isHtml) {
          cleanedContent = htmlToCleanPlainText(rawContent);
          if (!cleanedContent && raw.bodyPreview) {
            cleanedContent = raw.bodyPreview;
          }
        }

        const bodyContent = (cleanedContent || raw.bodyPreview || '').slice(0, 4000);

        return {
          messageRef,
          internetMessageId: raw.internetMessageId,
          folder: 'inbox',
          subject: raw.subject || '(无主题)',
          from: fromAddr,
          to: toList,
          cc: ccList,
          receivedAt: raw.receivedDateTime,
          sentAt: raw.sentDateTime,
          isRead: Boolean(raw.isRead),
          snippet: raw.bodyPreview?.slice(0, 200),
          body: {
            format: isHtml ? 'sanitized_html' : 'text',
            content: bodyContent,
            truncated: (cleanedContent || '').length > 4000,
          },
          attachments: (raw.hasAttachments ? [{ filename: 'attachment' }] : []) as any,
          contentTrust: 'untrusted_external',
        };
      });

      let filteredItems = items;
      if (input.selector.kind === 'search' && input.selector.text) {
        const needle = input.selector.text.toLowerCase().trim();
        filteredItems = items.filter(
          (m) =>
            m.subject?.toLowerCase().includes(needle) ||
            m.snippet?.toLowerCase().includes(needle) ||
            m.from?.address?.toLowerCase().includes(needle) ||
            m.from?.name?.toLowerCase().includes(needle)
        );
      }

      const isUnreadOnly =
        input.selector.kind === 'recent'
          ? input.selector.unreadOnly
          : input.selector.kind === 'search'
            ? input.selector.filters?.unreadOnly
            : false;

      if (isUnreadOnly) {
        filteredItems = filteredItems.filter((m) => !m.isRead);
      }

      const sinceStr =
        input.selector.kind === 'recent'
          ? input.selector.since
          : input.selector.kind === 'search'
            ? input.selector.filters?.since
            : undefined;

      const untilStr =
        input.selector.kind === 'recent'
          ? input.selector.until
          : input.selector.kind === 'search'
            ? input.selector.filters?.until
            : undefined;

      if (sinceStr) {
        const sinceTime = new Date(sinceStr).getTime();
        if (!isNaN(sinceTime)) {
          filteredItems = filteredItems.filter((m) => {
            const received = m.receivedAt ? new Date(m.receivedAt).getTime() : 0;
            return received >= sinceTime;
          });
        }
      }

      if (untilStr) {
        const untilTime = new Date(untilStr).getTime();
        if (!isNaN(untilTime)) {
          filteredItems = filteredItems.filter((m) => {
            const received = m.receivedAt ? new Date(m.receivedAt).getTime() : 0;
            return received <= untilTime;
          });
        }
      }

      const limit = typeof input.limit === 'number' && input.limit > 0 ? input.limit : 10;
      const slicedItems = filteredItems.slice(0, limit);

      return {
        mailboxKey: input.mailboxKey || config.emailAddress || 'default',
        items: slicedItems,
        resultCount: slicedItems.length,
        fetchedAt: new Date().toISOString(),
        warnings: [],
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message;
      throw new Error(`获取微软邮件列表失败: ${msg}`);
    }
  }

  async sendMessage(
    input: EmailSendInput,
    config: EmailConnectionConfig
  ): Promise<EmailSendOutput> {
    const token = this.getAccessToken(config);
    const deliveryId = `del_${uuidv4()}`;

    const toRecipients = input.to.map((item) => ({
      emailAddress: {
        name: item.name,
        address: item.address,
      },
    }));

    const ccRecipients = (input.cc || []).map((item) => ({
      emailAddress: {
        name: item.name,
        address: item.address,
      },
    }));

    const bccRecipients = (input.bcc || []).map((item) => ({
      emailAddress: {
        name: item.name,
        address: item.address,
      },
    }));

    const payload = {
      message: {
        subject: input.subject || '(无主题)',
        body: {
          contentType: 'Text',
          content: input.textBody,
        },
        toRecipients,
        ccRecipients,
        bccRecipients,
      },
      saveToSentItems: true,
    };

    try {
      await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      return {
        deliveryId,
        state: 'accepted',
        acceptedAt: new Date().toISOString(),
        warnings: [],
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message;
      throw new Error(`微软邮件发送失败: ${msg}`);
    }
  }

  async updateMessages(
    input: EmailUpdateInput,
    config: EmailConnectionConfig
  ): Promise<EmailUpdateOutput> {
    const token = this.getAccessToken(config);
    const isRead = input.isRead !== false;
    let targetRefs = input.messageRefs || [];
    let updatedTitles: string[] = [];

    // If messageRefs not explicitly provided, query matching messages using selector
    if (targetRefs.length === 0 && input.selector) {
      const messagesRes = await this.listMessages(
        {
          mailboxKey: input.mailboxKey,
          selector: input.selector,
          detail: 'summary',
          limit: 50,
        },
        config
      );
      targetRefs = messagesRes.items.map((m) => m.messageRef);
      updatedTitles = messagesRes.items.map((m) => m.subject);
    }

    if (targetRefs.length === 0) {
      return {
        mailboxKey: input.mailboxKey || config.emailAddress || 'default',
        updatedCount: 0,
        messageRefs: [],
        isRead,
        success: true,
        updatedAt: new Date().toISOString(),
        updatedTitles: [],
      };
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const ref of targetRefs) {
      try {
        await axios.patch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(ref)}`,
          { isRead },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          }
        );
        successCount++;
      } catch (err: any) {
        errors.push(err?.response?.data?.error?.message || err.message);
      }
    }

    return {
      mailboxKey: input.mailboxKey || config.emailAddress || 'default',
      updatedCount: successCount,
      messageRefs: targetRefs.slice(0, successCount),
      isRead,
      success: successCount > 0 || targetRefs.length === 0,
      updatedAt: new Date().toISOString(),
      updatedTitles,
      warnings: errors.length > 0 ? errors : undefined,
    };
  }
}
