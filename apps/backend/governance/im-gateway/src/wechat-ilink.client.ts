import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { WechatMediaAdapter } from './wechat-media.adapter';
import { sanitizeWeChatText, splitTextPreservingLines } from './wechat-formatter.util';

const QR_BASE_URL = 'https://ilinkai.weixin.qq.com/';
const PROTOCOL_VERSION = '2.4.6';
const CLIENT_VERSION = (2 << 16) | (4 << 8) | 6;

export const WechatUploadMediaType = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;

export const WechatMessageItemType = {
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

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
  private readonly mediaAdapter: WechatMediaAdapter;

  constructor(@Optional() mediaAdapter?: WechatMediaAdapter) {
    this.mediaAdapter = mediaAdapter ?? new WechatMediaAdapter();
  }

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

  async getUploadUrl(
    baseUrl: string,
    token: string,
    req: {
      filekey: string;
      mediaType: number;
      toUserId: string;
      rawSize: number;
      rawFileMd5: string;
      fileSize: number;
      aesKeyHex: string;
      noNeedThumb?: boolean;
    }
  ): Promise<{ upload_param?: string; thumb_upload_param?: string; upload_full_url?: string }> {
    return this.request('POST', baseUrl, 'ilink/bot/getuploadurl', {
      token,
      body: {
        filekey: req.filekey,
        media_type: req.mediaType,
        to_user_id: req.toUserId,
        rawsize: req.rawSize,
        rawfilemd5: req.rawFileMd5,
        filesize: req.fileSize,
        no_need_thumb: req.noNeedThumb ?? true,
        aeskey: req.aesKeyHex,
        base_info: this.baseInfo(),
      },
    });
  }

  async sendMediaMessage(
    baseUrl: string,
    token: string,
    toUserId: string,
    mediaType: 1 | 2 | 3 | 4,
    buffer: Buffer,
    options: {
      fileName?: string;
      cdnBaseUrl?: string;
      contextToken?: string;
    } = {}
  ): Promise<string> {
    const clientId = randomBytes(16).toString('hex');
    const rawSize = buffer.length;
    const rawMd5 = createHash('md5').update(buffer).digest('hex');

    // 1. Generate 16-byte random AES key
    const aesKey = randomBytes(16);
    const aesKeyHex = aesKey.toString('hex');
    const encryptedSize = Math.ceil((rawSize + 1) / 16) * 16;

    // 2. Request upload parameters from iLink
    const uploadResp = await this.getUploadUrl(baseUrl, token, {
      filekey: clientId,
      mediaType,
      toUserId,
      rawSize,
      rawFileMd5: rawMd5,
      fileSize: encryptedSize,
      aesKeyHex,
      noNeedThumb: true,
    });

    const uploadUrl = uploadResp.upload_full_url;
    let uploadParam = uploadResp.upload_param;
    if (!uploadParam && uploadUrl) {
      try {
        uploadParam = new URL(uploadUrl).searchParams.get('encrypted_query_param') ?? undefined;
      } catch {
        // ignore URL parsing error
      }
    }

    if (!uploadParam && !uploadUrl) {
      throw new Error('微信服务端未返回有效上传凭证');
    }

    // 3. Upload encrypted buffer to WeChat CDN
    const encryptQueryParam = await this.mediaAdapter.uploadToCdn({
      buffer,
      uploadParam: uploadParam || '',
      aesKey,
      filekey: clientId,
      cdnBaseUrl: options.cdnBaseUrl,
      uploadUrl,
    });

    // 4. Construct CDNMedia reference (Base64 of the 32-character hex key)
    const aesKeyBase64 = Buffer.from(aesKeyHex).toString('base64');
    const cdnMedia = {
      encrypt_query_param: encryptQueryParam,
      aes_key: aesKeyBase64,
      encrypt_type: 1,
    };

    // 5. Construct item_list based on media type
    let itemList: any[];
    switch (mediaType) {
      case WechatUploadMediaType.IMAGE:
        itemList = [
          {
            type: WechatMessageItemType.IMAGE,
            image_item: {
              media: cdnMedia,
              aeskey: cdnMedia.aes_key,
              url: cdnMedia.encrypt_query_param,
              mid_size: encryptedSize,
            },
          },
        ];
        break;
      case WechatUploadMediaType.VIDEO:
        itemList = [
          {
            type: WechatMessageItemType.VIDEO,
            video_item: {
              media: cdnMedia,
              video_size: encryptedSize,
            },
          },
        ];
        break;
      case WechatUploadMediaType.FILE:
        itemList = [
          {
            type: WechatMessageItemType.FILE,
            file_item: {
              media: cdnMedia,
              file_name: options.fileName ?? 'file',
              len: String(rawSize),
            },
          },
        ];
        break;
      case WechatUploadMediaType.VOICE:
        itemList = [
          {
            type: WechatMessageItemType.VOICE,
            voice_item: {
              media: cdnMedia,
            },
          },
        ];
        break;
      default:
        throw new Error(`不支持的微信媒体类型: ${mediaType}`);
    }

    // 6. Send message through iLink gateway
    await this.request('POST', baseUrl, 'ilink/bot/sendmessage', {
      token,
      body: {
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: clientId,
          message_type: 2,
          message_state: 2,
          item_list: itemList,
          ...(options.contextToken ? { context_token: options.contextToken } : {}),
        },
        base_info: this.baseInfo(),
      },
    });

    return clientId;
  }

  async sendText(
    baseUrl: string,
    token: string,
    toUserId: string,
    text: string,
    contextToken?: string,
    clientIdPrefix?: string
  ): Promise<void> {
    const sanitized = sanitizeWeChatText(text);
    const chunks = splitTextPreservingLines(sanitized, 1800);
    for (const [index, chunk] of chunks.entries()) {
      if (!chunk.trim()) continue;
      await this.request('POST', baseUrl, 'ilink/bot/sendmessage', {
        token,
        body: {
          msg: {
            from_user_id: '',
            to_user_id: toUserId,
            client_id: clientIdPrefix ? `ops-reminder-${clientIdPrefix}-${index}` : `ops-wechat-${randomUUID()}`,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text: chunk } }],
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
