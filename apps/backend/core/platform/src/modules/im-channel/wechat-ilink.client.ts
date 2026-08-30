import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';

const QR_BASE_URL = 'https://ilinkai.weixin.qq.com/';
const PROTOCOL_VERSION = '2.4.6';
const CLIENT_VERSION = (2 << 16) | (4 << 8) | 6;

export interface WechatLoginResult {
  status:
    | 'wait'
    | 'scaned'
    | 'confirmed'
    | 'expired'
    | 'scaned_but_redirect'
    | 'need_verifycode'
    | 'verify_code_blocked'
    | 'binded_redirect';
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
  redirect_host?: string;
}

@Injectable()
export class WechatIlinkClient {
  async beginLogin(signal?: AbortSignal): Promise<{ qrcode: string; qrcodeUrl: string }> {
    const response = await this.request(
      'POST',
      QR_BASE_URL,
      'ilink/bot/get_bot_qrcode?bot_type=3',
      {
        body: { local_token_list: [] },
        signal,
        authenticated: false,
        timeoutMs: 10_000,
      }
    );
    if (!response.qrcode || !response.qrcode_img_content)
      throw new Error('微信服务没有返回扫码地址');
    return {
      qrcode: String(response.qrcode),
      qrcodeUrl: this.trustedUrl(response.qrcode_img_content),
    };
  }

  async pollLogin(
    qrcode: string,
    baseUrl = QR_BASE_URL,
    signal?: AbortSignal
  ): Promise<WechatLoginResult> {
    return this.request(
      'GET',
      baseUrl,
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      {
        signal,
        authenticated: false,
        timeoutMs: 35_000,
      }
    ) as Promise<WechatLoginResult>;
  }

  async getUpdates(
    baseUrl: string,
    token: string,
    cursor: string,
    signal: AbortSignal
  ): Promise<any> {
    try {
      return await this.request('POST', baseUrl, 'ilink/bot/getupdates', {
        token,
        signal,
        timeoutMs: 35_000,
        body: { get_updates_buf: cursor, base_info: this.baseInfo() },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout')
        return { ret: 0, msgs: [], get_updates_buf: cursor };
      throw error;
    }
  }

  async notifyStart(baseUrl: string, token: string): Promise<void> {
    const response = await this.request('POST', baseUrl, 'ilink/bot/msg/notifystart', {
      token,
      body: { base_info: this.baseInfo() },
    });
    if (response?.ret !== undefined && response.ret !== 0) {
      throw new Error('微信账号连接启动失败');
    }
  }

  async notifyStop(baseUrl: string, token: string): Promise<void> {
    await this.request('POST', baseUrl, 'ilink/bot/msg/notifystop', {
      token,
      body: { base_info: this.baseInfo() },
    });
  }

  private typingTicketCache = new Map<string, { ticket: string; expiresAt: number }>();

  async getTypingTicket(
    baseUrl: string,
    token: string,
    toUserId: string,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const cached = this.typingTicketCache.get(toUserId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ticket;
    }

    try {
      const response = await this.request('POST', baseUrl, 'ilink/bot/getconfig', {
        token,
        signal,
        timeoutMs: 6_000,
        body: {
          ilink_user_id: toUserId,
          base_info: this.baseInfo(),
        },
      });

      const ticket = response?.typing_ticket || response?.config?.typing_ticket;
      if (typeof ticket === 'string' && ticket.trim()) {
        // Cache for 12 hours (tickets valid for ~20h)
        this.typingTicketCache.set(toUserId, {
          ticket: ticket.trim(),
          expiresAt: Date.now() + 12 * 3600 * 1000,
        });
        return ticket.trim();
      }
    } catch {
      // Best-effort: failures to fetch typing ticket should not throw
    }
    return undefined;
  }

  async sendTyping(
    baseUrl: string,
    token: string,
    toUserId: string,
    command: 1 | 2 = 1,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const ticket = await this.getTypingTicket(baseUrl, token, toUserId, signal);
      await this.request('POST', baseUrl, 'ilink/bot/sendtyping', {
        token,
        signal,
        timeoutMs: 5_000,
        body: {
          ilink_user_id: toUserId,
          to_user_id: toUserId,
          ...(ticket ? { typing_ticket: ticket } : {}),
          command,
          base_info: this.baseInfo(),
        },
      });
    } catch {
      // Best-effort: ignore network/typing errors so messaging continues seamlessly
    }
  }

  async sendText(
    baseUrl: string,
    token: string,
    toUserId: string,
    text: string,
    contextToken?: string
  ): Promise<void> {
    for (let offset = 0; offset < text.length; offset += 1800) {
      await this.request('POST', baseUrl, 'ilink/bot/sendmessage', {
        token,
        body: {
          msg: {
            from_user_id: '',
            to_user_id: toUserId,
            client_id: `ops-wechat-${randomUUID()}`,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text: text.slice(offset, offset + 1800) } }],
            ...(contextToken ? { context_token: contextToken } : {}),
          },
          base_info: this.baseInfo(),
        },
      });
    }
  }

  private baseInfo() {
    return { channel_version: PROTOCOL_VERSION, bot_agent: 'OpsPilot/1.0.0' };
  }

  private trustedUrl(value: unknown): string {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      !(
        host === 'weixin.qq.com' ||
        host.endsWith('.weixin.qq.com') ||
        host === 'wechat.com' ||
        host.endsWith('.wechat.com')
      )
    )
      throw new Error('微信服务返回了不受信任的地址');
    return url.toString();
  }

  private async request(
    method: string,
    baseUrl: string,
    endpoint: string,
    options: {
      body?: unknown;
      token?: string;
      signal?: AbortSignal;
      timeoutMs?: number;
      authenticated?: boolean;
    } = {}
  ): Promise<any> {
    const base = this.trustedUrl(baseUrl);
    const url = new URL(endpoint, base);
    this.trustedUrl(url);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 15_000);
    try {
      const headers: Record<string, string> = {
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': String(CLIENT_VERSION),
      };
      if (options.authenticated !== false) {
        headers['content-type'] = 'application/json';
        headers.AuthorizationType = 'ilink_bot_token';
        headers['X-WECHAT-UIN'] = Buffer.from(String(randomBytes(4).readUInt32BE(0))).toString(
          'base64'
        );
        if (options.token) headers.Authorization = `Bearer ${options.token}`;
      }
      const response = await fetch(url, {
        method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`微信服务请求失败（HTTP ${response.status}）`);
      return await response.json();
    } catch (error) {
      if (timedOut) throw new Error('timeout');
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
