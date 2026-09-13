import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IM_GATEWAY_PRISMA, ImGatewayPrismaPort } from './ports';
import { ImCredentialCipher } from './im-channel.crypto';
import { WechatIlinkClient, WechatLoginResult, WechatUploadMediaType } from './wechat-ilink.client';
import { WechatMediaAdapter } from './wechat-media.adapter';
import { WechatOutboundQueueService } from './wechat-outbound-queue.service';
import { formatForWeChat, splitTextPreservingLines } from './wechat-formatter.util';

type Credential = { token: string; baseUrl: string; ownerUserId: string };
type InteractionMode = 'auto' | 'chat' | 'task';
type Provisioning = {
  userId: string;
  qrcode: string;
  qrcodeUrl: string;
  state: string;
  expiresAt: number;
  controller: AbortController;
  error?: string;
};

export interface StagedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content?: string;
  extractedText?: string;
}

export interface OutboundFilePayload {
  filePath: string;
  fileName: string;
  comment?: string;
  mimeType?: string;
}

interface StagedMediaSession {
  files: StagedFile[];
  updatedAt: number;
}

export interface ImInteractionResolution {
  type: 'ai' | 'system_reply';
  mode: 'chat' | 'task';
  message: string;
  isNewSession?: boolean;
  systemReplyText?: string;
}

@Injectable()
export class ImChannelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImChannelService.name);
  private readonly provisioning = new Map<string, Provisioning>();
  private readonly runtimes = new Map<string, AbortController>();
  private readonly sessionTokens = new Map<string, string>();
  private readonly stagedMedia = new Map<string, StagedMediaSession>();
  private static readonly STAGED_MEDIA_TTL_MS = 15 * 60 * 1000;
  private readonly mediaAdapter: WechatMediaAdapter;
  private readonly outboundQueue: WechatOutboundQueueService;
  private readonly maxActiveConnections = Number(
    process.env.IM_CHANNEL_MAX_ACTIVE_CONNECTIONS ?? 100
  );

  constructor(
    @Inject(IM_GATEWAY_PRISMA) private readonly prisma: ImGatewayPrismaPort,
    private readonly cipher: ImCredentialCipher,
    private readonly wechat: WechatIlinkClient,
    @Optional() mediaAdapter?: WechatMediaAdapter,
    @Optional() outboundQueue?: WechatOutboundQueueService
  ) {
    this.mediaAdapter = mediaAdapter ?? new WechatMediaAdapter();
    this.outboundQueue = outboundQueue ?? new WechatOutboundQueueService();
  }

  async onModuleInit() {
    await this.prisma.imChannelConnection.updateMany({
      where: { channel: 'wechat', interactionMode: 'auto' },
      data: { interactionMode: 'chat' },
    });
    const enabled = await this.prisma.imChannelConnection.findMany({
      where: { enabled: true, channel: 'wechat' },
    });
    for (const connection of enabled) void this.startRuntime(connection.id);
  }

  onModuleDestroy() {
    for (const attempt of this.provisioning.values()) attempt.controller.abort();
    for (const runtime of this.runtimes.values()) runtime.abort();
    this.stagedMedia.clear();
  }

  async getWechat(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'wechat' } },
    });
    const attempt = this.provisioning.get(userId);
    const rawMode = connection?.interactionMode;
    const interactionMode = rawMode && rawMode !== 'auto' ? rawMode : 'chat';
    return {
      channel: 'wechat',
      configured: Boolean(connection?.encryptedCredential),
      enabled: connection?.enabled ?? false,
      status: attempt?.state ?? connection?.status ?? 'unconfigured',
      interactionMode,
      providerAccountId: connection?.providerAccountId ?? undefined,
      lastConnectedAt: connection?.lastConnectedAt?.toISOString(),
      lastMessageAt: connection?.lastMessageAt?.toISOString(),
      lastError: attempt?.error ?? connection?.lastError ?? undefined,
      provisioning: attempt
        ? { qrcodeUrl: attempt.qrcodeUrl, expiresAt: new Date(attempt.expiresAt).toISOString() }
        : undefined,
    };
  }

  async beginWechatProvisioning(userId: string) {
    this.provisioning.get(userId)?.controller.abort();
    const existing = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'wechat' } },
    });
    if (existing) await this.stopRuntime(existing.id);
    const controller = new AbortController();
    const login = await this.wechat.beginLogin(controller.signal);
    const attempt: Provisioning = {
      userId,
      qrcode: login.qrcode,
      qrcodeUrl: login.qrcodeUrl,
      state: 'provisioning',
      expiresAt: Date.now() + 5 * 60_000,
      controller,
    };
    this.provisioning.set(userId, attempt);
    await this.prisma.imChannelConnection.upsert({
      where: { userId_channel: { userId, channel: 'wechat' } },
      create: { userId, channel: 'wechat', enabled: false, status: 'provisioning', interactionMode: 'chat' },
      update: { enabled: false, status: 'provisioning', lastError: null },
    });
    void this.pollProvisioning(attempt);
    return this.getWechat(userId);
  }

  async setEnabled(userId: string, enabled: boolean) {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'wechat' } },
    });
    if (!connection?.encryptedCredential) throw new BadRequestException('请先扫码绑定微信');
    if (enabled && !connection.enabled) {
      const activeConnections = await this.prisma.imChannelConnection.count({
        where: { enabled: true },
      });
      if (activeConnections >= this.maxActiveConnections)
        throw new BadRequestException('当前 IM 连接容量已满，请联系管理员扩容');
    }
    await this.prisma.imChannelConnection.update({
      where: { id: connection.id },
      data: { enabled, status: enabled ? 'connecting' : 'disabled', lastError: null },
    });
    if (enabled) void this.startRuntime(connection.id);
    else await this.stopRuntime(connection.id, true);
    return this.getWechat(userId);
  }

  async setInteractionMode(userId: string, interactionMode: InteractionMode) {
    const connection = await this.prisma.imChannelConnection.upsert({
      where: { userId_channel: { userId, channel: 'wechat' } },
      create: { userId, channel: 'wechat', interactionMode },
      update: { interactionMode },
    });
    if (connection.enabled) {
      await this.stopRuntime(connection.id);
      void this.startRuntime(connection.id);
    }
    return this.getWechat(userId);
  }

  async removeWechat(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'wechat' } },
    });
    if (!connection) throw new NotFoundException('微信渠道尚未配置');
    await this.stopRuntime(connection.id, true);
    this.provisioning.get(userId)?.controller.abort();
    this.provisioning.delete(userId);
    await this.prisma.imChannelConnection.delete({ where: { id: connection.id } });
    return { success: true };
  }

  async sendTestFile(
    userId: string,
    fileName?: string,
    content?: string
  ): Promise<{ success: boolean; clientId: string }> {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'wechat' } },
    });
    if (!connection?.enabled || !connection.encryptedCredential) {
      throw new BadRequestException('微信渠道未启用或未绑定');
    }
    const credential = JSON.parse(
      this.cipher.decrypt(connection.encryptedCredential)
    ) as Credential;

    const fileBuf = Buffer.from(
      content ||
        `这是一份来自 OPS 智能运维平台的端对端微信多媒体测试文件。\n生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n连接ID: ${connection.id}\n状态: 微信文件通道双向通信正常！\n`
    );
    const name = fileName || 'ops-automation-test.txt';

    const clientId = await this.wechat.sendMediaMessage(
      credential.baseUrl,
      credential.token,
      credential.ownerUserId,
      WechatUploadMediaType.FILE,
      fileBuf,
      { fileName: name }
    );
    return { success: true, clientId };
  }

  private async pollProvisioning(attempt: Provisioning) {
    let baseUrl: string | undefined;
    try {
      while (!attempt.controller.signal.aborted && Date.now() < attempt.expiresAt) {
        const result = await this.wechat.pollLogin(
          attempt.qrcode,
          baseUrl,
          attempt.controller.signal
        );
        if (result.status === 'confirmed') {
          await this.finishProvisioning(attempt, result);
          return;
        }
        if (
          result.status === 'expired' ||
          result.status === 'verify_code_blocked' ||
          result.status === 'need_verifycode'
        )
          throw new Error(
            result.status === 'need_verifycode'
              ? '当前账号需要配对码验证，首版暂不支持，请重新生成二维码'
              : '二维码已过期或验证失败'
          );
        if (result.status === 'scaned_but_redirect' && result.redirect_host)
          baseUrl = this.resolveRedirect(result.redirect_host, baseUrl);
        attempt.state = result.status === 'scaned' ? 'connecting' : 'provisioning';
      }
      if (!attempt.controller.signal.aborted) throw new Error('二维码已过期');
    } catch (error) {
      if (attempt.controller.signal.aborted) return;
      attempt.state = 'error';
      attempt.error = error instanceof Error ? error.message : String(error);
      await this.prisma.imChannelConnection.updateMany({
        where: { userId: attempt.userId, channel: 'wechat' },
        data: { status: 'error', lastError: attempt.error },
      });
      this.provisioning.delete(attempt.userId);
    }
  }

  private async finishProvisioning(attempt: Provisioning, result: WechatLoginResult) {
    if (!result.bot_token || !result.ilink_bot_id || !result.ilink_user_id)
      throw new Error('微信授权结果不完整');
    const baseUrl = this.resolveRedirect(result.baseurl, undefined);
    const encryptedCredential = this.cipher.encrypt(
      JSON.stringify({
        token: result.bot_token,
        baseUrl,
        ownerUserId: result.ilink_user_id,
      } satisfies Credential)
    );
    await this.prisma.imChannelConnection.update({
      where: { userId_channel: { userId: attempt.userId, channel: 'wechat' } },
      data: {
        enabled: false,
        status: 'disabled',
        providerAccountId: result.ilink_bot_id,
        providerOwnerUserId: result.ilink_user_id,
        providerBaseUrl: baseUrl,
        encryptedCredential,
        lastError: null,
      },
    });
    attempt.state = 'disabled';
    attempt.controller.abort();
    this.provisioning.delete(attempt.userId);
  }

  private resolveRedirect(
    value: string | undefined,
    fallback = 'https://ilinkai.weixin.qq.com/'
  ): string {
    if (!value) return fallback;
    const candidate = value.includes('://') ? value : `https://${value}`;
    const url = new URL(candidate);
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
      throw new Error('微信返回了不受信任的连接地址');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  }

  private async stopRuntime(connectionId: string, notifyProvider = false) {
    this.runtimes.get(connectionId)?.abort();
    this.runtimes.delete(connectionId);
    this.stagedMedia.delete(connectionId);
    if (!notifyProvider) return;
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection?.encryptedCredential) return;
    try {
      const credential = JSON.parse(
        this.cipher.decrypt(connection.encryptedCredential)
      ) as Credential;
      await this.wechat.notifyStop(credential.baseUrl, credential.token);
    } catch (error) {
      this.logger.warn(
        `WeChat stop notification failed for ${connectionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async startRuntime(connectionId: string) {
    if (this.runtimes.has(connectionId)) return;
    const controller = new AbortController();
    this.runtimes.set(connectionId, controller);
    try {
      const connection = await this.prisma.imChannelConnection.findUnique({
        where: { id: connectionId },
      });
      if (!connection?.enabled || !connection.encryptedCredential) return;
      const credential = JSON.parse(
        this.cipher.decrypt(connection.encryptedCredential)
      ) as Credential;
      await this.wechat.notifyStart(credential.baseUrl, credential.token);
      await this.prisma.imChannelConnection.update({
        where: { id: connectionId },
        data: { status: 'online', lastConnectedAt: new Date(), lastError: null },
      });
      let cursor = connection.updateCursor ?? '';
      let consecutiveTimeouts = 0;
      while (!controller.signal.aborted) {
        const response = await this.wechat.getUpdates(
          credential.baseUrl,
          credential.token,
          cursor,
          controller.signal
        );
        if (response?.ret === -14 || response?.errcode === -14) {
          consecutiveTimeouts++;
          this.logger.warn(
            `WeChat session timeout (-14) for ${connectionId}, attempting recovery via notifyStart (attempt ${consecutiveTimeouts}/5)...`
          );
          try {
            await this.wechat.notifyStart(credential.baseUrl, credential.token);
            this.logger.log(`WeChat session recovered successfully for ${connectionId}`);
            consecutiveTimeouts = 0;
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          } catch (recoveryErr) {
            if (consecutiveTimeouts >= 5) {
              throw new Error('微信登录凭据已失效，多次自愈重试失败，请重新扫码');
            }
            const delay = Math.min(30000, 2000 * Math.pow(2, consecutiveTimeouts));
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        consecutiveTimeouts = 0;
        for (const message of Array.isArray(response?.msgs) ? response.msgs : [])
          await this.handleInbound(
            connection.userId,
            connectionId,
            connection.interactionMode,
            credential,
            message
          );
        if (response?.get_updates_buf && response.get_updates_buf !== cursor) {
          cursor = String(response.get_updates_buf);
          await this.prisma.imChannelConnection.update({
            where: { id: connectionId },
            data: { updateCursor: cursor },
          });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`WeChat runtime ${connectionId} stopped: ${message}`);
        await this.prisma.imChannelConnection.updateMany({
          where: { id: connectionId },
          data: {
            status: message.includes('失效') ? 'reauth_required' : 'error',
            lastError: message,
          },
        });
      }
    } finally {
      if (this.runtimes.get(connectionId) === controller) this.runtimes.delete(connectionId);
    }
  }

  private getSessionId(connectionId: string, isNewSession = false): string {
    if (isNewSession || !this.sessionTokens.has(connectionId)) {
      this.sessionTokens.set(connectionId, randomUUID());
    }
    return `wechat:${connectionId}:${this.sessionTokens.get(connectionId)}`;
  }

  private async handleInbound(
    userId: string,
    connectionId: string,
    configuredMode: InteractionMode,
    credential: Credential,
    message: any
  ) {
    if (String(message?.from_user_id ?? '') !== credential.ownerUserId) {
      this.logger.warn(`Rejected non-owner WeChat message for ${connectionId}`);
      return;
    }

    // 1. Reset budget on new user inbound interaction
    this.outboundQueue.resetBudget(connectionId);

    // 2. Parse text, quotes, and download/decrypt media items
    let text = '';
    const incomingFiles: Array<{
      fileId: string;
      fileName: string;
      mimeType: string;
      size: number;
      content?: string;
      extractedText?: string;
    }> = [];

    for (const item of Array.isArray(message?.item_list) ? message.item_list : []) {
      if (item?.type === 1 && item?.text_item?.text) {
        const itemText = String(item.text_item.text);
        const ref = item.ref_msg;
        let quoted = '';
        if (ref) {
          const parts = [ref.title, ref.message_item?.text_item?.text].filter(Boolean);
          if (parts.length > 0) quoted = `[引用: ${parts.join(' | ')}]\n`;
        }
        text += (text ? '\n' : '') + quoted + itemText;
      } else if (item?.type === 3 && item?.voice_item?.text) {
        text += (text ? '\n' : '') + String(item.voice_item.text);
      } else if (item?.type === 2 && item?.image_item?.media) {
        try {
          const media = item.image_item.media;
          const aesKey = this.mediaAdapter.parseAesKey(media);
          if (aesKey && media.encrypt_query_param) {
            const buffer = await this.mediaAdapter.downloadAndDecrypt(
              media.encrypt_query_param,
              aesKey
            );
            const ext = this.mediaAdapter.detectImageExtension(buffer);
            const fileName = `image_${Date.now()}.${ext}`;
            const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
            incomingFiles.push({
              fileId: randomUUID(),
              fileName,
              mimeType,
              size: buffer.length,
              content: buffer.toString('base64'),
            });
          }
        } catch (mediaErr) {
          this.logger.warn(`Failed to download WeChat image for ${connectionId}: ${mediaErr}`);
        }
      } else if (item?.type === 4 && item?.file_item?.media) {
        try {
          const media = item.file_item.media;
          const aesKey = this.mediaAdapter.parseAesKey(media);
          if (aesKey && media.encrypt_query_param) {
            const buffer = await this.mediaAdapter.downloadAndDecrypt(
              media.encrypt_query_param,
              aesKey
            );
            const fileName = item.file_item.file_name || `file_${Date.now()}`;
            const mimeType = this.mediaAdapter.detectMimeType(fileName, buffer);
            let extractedText: string | undefined;
            if (this.mediaAdapter.isTextFile(fileName)) {
              try {
                extractedText = buffer.toString('utf-8');
              } catch {
                // ignore text decode error
              }
            }
            incomingFiles.push({
              fileId: randomUUID(),
              fileName,
              mimeType,
              size: buffer.length,
              content: buffer.toString('base64'),
              extractedText,
            });
          }
        } catch (mediaErr) {
          this.logger.warn(`Failed to download WeChat file for ${connectionId}: ${mediaErr}`);
        }
      } else if (item?.type === 5 && item?.video_item?.media) {
        try {
          const media = item.video_item.media;
          const aesKey = this.mediaAdapter.parseAesKey(media);
          if (aesKey && media.encrypt_query_param) {
            const buffer = await this.mediaAdapter.downloadAndDecrypt(
              media.encrypt_query_param,
              aesKey
            );
            const fileName = `video_${Date.now()}.mp4`;
            incomingFiles.push({
              fileId: randomUUID(),
              fileName,
              mimeType: 'video/mp4',
              size: buffer.length,
              content: buffer.toString('base64'),
            });
          }
        } catch (mediaErr) {
          this.logger.warn(`Failed to download WeChat video for ${connectionId}: ${mediaErr}`);
        }
      }
    }

    const hasMediaInPayload = message?.item_list?.some(
      (item) => item?.type === 2 || item?.type === 4 || item?.type === 5
    );
    if (!text && incomingFiles.length === 0 && hasMediaInPayload) {
      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        '抱歉，接收多媒体文件失败，请稍后重试。',
        message?.context_token
      );
      return;
    }

    // 2.1 WeChat files/images staging:
    // In WeChat, media and text are typically sent separately.
    // When media arrives without text, stage it and prompt the user for their instruction.
    if (!text.trim() && incomingFiles.length > 0) {
      const now = Date.now();
      const existing = this.stagedMedia.get(connectionId);
      const isStillValid =
        existing && now - existing.updatedAt < ImChannelService.STAGED_MEDIA_TTL_MS;
      const mergedFiles = isStillValid
        ? [...existing.files, ...incomingFiles]
        : [...incomingFiles];
      this.stagedMedia.set(connectionId, { files: mergedFiles, updatedAt: now });

      let promptMessage = '';
      if (mergedFiles.length === 1) {
        const single = mergedFiles[0]!;
        if (single.mimeType.startsWith('image/')) {
          promptMessage =
            '已收到图片，请发送你的处理指令（例如：“提取图片文字”、“分析图中错误”或提出你想问的问题）。';
        } else {
          promptMessage = `已收到文件【${single.fileName}】，请发送你的处理指令（例如：“总结文档核心内容”或提出你想问的问题）。`;
        }
      } else {
        const imgCount = mergedFiles.filter((f) => f.mimeType.startsWith('image/')).length;
        const fileCount = mergedFiles.length - imgCount;
        const descParts: string[] = [];
        if (imgCount > 0) descParts.push(`${imgCount} 张图片`);
        if (fileCount > 0) descParts.push(`${fileCount} 个文件`);
        promptMessage = `已暂存 ${descParts.join('和 ')}，请发送你的处理指令。`;
      }

      // Persist this media receipt into the chat session so Session Management reflects it immediately
      const stagingSessionId = this.getSessionId(connectionId);
      const mediaLabel = incomingFiles.some((f) => f.mimeType.startsWith('image/')) ? '图片' : '文件';
      const fileNames = incomingFiles.map((f) => f.fileName).join(', ');
      this.askAi(
        userId,
        stagingSessionId,
        `[发送了${mediaLabel}: ${fileNames}]`,
        'chat',
        incomingFiles,
        promptMessage
      ).catch((err) => {
        this.logger.warn(`Failed to persist staged media into session: ${err}`);
      });

      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        promptMessage,
        message?.context_token
      );
      await this.prisma.imChannelConnection.update({
        where: { id: connectionId },
        data: { lastMessageAt: new Date() },
      });
      return;
    }

    if (!text.trim()) return;

    // Check /cancel or /取消 command specifically to discard staged media
    if (/^\s*\/(?:cancel|取消)(?:\s+|$)/i.test(text.trim())) {
      const hadStaged = this.stagedMedia.has(connectionId);
      this.stagedMedia.delete(connectionId);
      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        hadStaged ? '已清空暂存的图片和文件。' : '当前没有待处理的暂存文件。',
        message?.context_token
      );
      await this.prisma.imChannelConnection.update({
        where: { id: connectionId },
        data: { lastMessageAt: new Date() },
      });
      return;
    }

    // 3. Check /next or /继续 command specifically to flush queue
    if (/^\s*\/(?:next|继续)(?:\s+|$)/i.test(text.trim())) {
      const flushed = await this.flushPending(connectionId, credential);
      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        flushed > 0 ? `已为你补发 ${flushed} 条暂存消息。` : '当前没有暂存待发送的消息。',
        message?.context_token
      );
      await this.prisma.imChannelConnection.update({
        where: { id: connectionId },
        data: { lastMessageAt: new Date() },
      });
      return;
    }

    // Incorporate any previously staged media with the incoming user instruction
    const existingStaged = this.stagedMedia.get(connectionId);
    if (existingStaged) {
      if (Date.now() - existingStaged.updatedAt < ImChannelService.STAGED_MEDIA_TTL_MS) {
        incomingFiles.unshift(...existingStaged.files);
      }
      this.stagedMedia.delete(connectionId);
    }

    // 4. For regular messages, flush any backlog before answering
    await this.flushPending(connectionId, credential);

    const effectiveMode = configuredMode === 'task' ? 'task' : 'chat';
    const request = this.resolveInteraction(text, effectiveMode);

    if (request.isNewSession) {
      this.getSessionId(connectionId, true);
      this.stagedMedia.delete(connectionId);
    }

    if (request.type === 'system_reply') {
      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        request.systemReplyText || '已处理。',
        message?.context_token
      );
      await this.prisma.imChannelConnection.update({
        where: { id: connectionId },
        data: { lastMessageAt: new Date() },
      });
      return;
    }

    const sessionId = this.getSessionId(connectionId);

    // Trigger WeChat native typing status immediately
    await this.wechat.sendTyping(
      credential.baseUrl,
      credential.token,
      credential.ownerUserId,
      1
    );

    // Heartbeat typing interval (WeChat native typing expires in ~6s, refresh every 4.5s)
    const typingInterval = setInterval(() => {
      this.wechat
        .sendTyping(credential.baseUrl, credential.token, credential.ownerUserId, 1)
        .catch(() => {});
    }, 4500);

    let aiResult: { response: string; outboundFiles?: OutboundFilePayload[] } = {
      response: '',
    };
    try {
      aiResult = await this.askAi(userId, sessionId, request.message, request.mode, incomingFiles);
    } finally {
      clearInterval(typingInterval);
      this.wechat
        .sendTyping(credential.baseUrl, credential.token, credential.ownerUserId, 2)
        .catch(() => {});
    }

    const replyText =
      typeof aiResult === 'string'
        ? aiResult
        : (aiResult?.response ?? '');
    await this.deliverReply(connectionId, credential, replyText, message?.context_token);

    // Deliver outbound files if emitted by AI or matched via user direct send intent
    const filesToSend: OutboundFilePayload[] = [
      ...(typeof aiResult === 'object' && aiResult?.outboundFiles ? aiResult.outboundFiles : []),
    ];
    if (filesToSend.length === 0) {
      const explicitFileMatch = request.message.match(
        /(?:通过微信)?(?:发送|发|推送)(?:这个|个人空间|工作空间)?(?:文件|文档|报告)?(?:【?([^】\n，。！？ ]+)】?)(?:给我|到微信)?/i
      );
      if (explicitFileMatch && explicitFileMatch[1]) {
        const candidateName = explicitFileMatch[1].trim();
        const resolved = this.resolveUserFilePath(userId, candidateName);
        if (resolved) {
          filesToSend.push({
            filePath: resolved,
            fileName: path.basename(resolved),
          });
        }
      }
    }

    for (const f of filesToSend) {
      await this.deliverFile(connectionId, credential, userId, f, message?.context_token);
    }

    await this.prisma.imChannelConnection.update({
      where: { id: connectionId },
      data: { lastMessageAt: new Date() },
    });
  }

  resolveInteraction(
    text: string,
    configuredMode: InteractionMode = 'chat'
  ): ImInteractionResolution {
    const raw = text.trim();

    // 1. Help command: /help, /?, /帮助
    if (/^\s*\/(?:help|\?|帮助)(?:\s+|$)/i.test(raw)) {
      return {
        type: 'system_reply',
        mode: 'chat',
        message: '',
        systemReplyText:
          '💡 快捷指令帮助：\n' +
          '• `/c` 或 `/chat <问题>`：个人问答模式（默认，安全沙箱与自由问答）\n' +
          '• `/t` 或 `/task <指令>`：工作任务模式（多步技能编排、自动化任务）\n' +
          '• `/n` 或 `/new [指令]`：重置并开启全新会话\n' +
          '• `/cancel` 或 `/取消`：清空已暂存的待处理图片或文件\n' +
          '• `/next` 或 `/继续`：补发因频率限制暂存的消息\n' +
          '• `/help`：查看指令帮助',
      };
    }

    // 2. New session command: /n, /new, /reset, /clear, /新会话
    const newMatch = raw.match(/^\s*\/(?:n|new|reset|clear|新会话)(?:\s+|$)([\s\S]*)/i);
    if (newMatch) {
      const remaining = (newMatch[1] || '').trim();
      if (!remaining) {
        return {
          type: 'system_reply',
          mode: 'chat',
          message: '',
          isNewSession: true,
          systemReplyText: '✨ 已为你开启全新会话，历史上下文已重置。请问有什么我可以帮你的？',
        };
      }
      const sub = this.resolveInteraction(remaining, configuredMode);
      return {
        ...sub,
        isNewSession: true,
      };
    }

    // 3. Task mode command: /t, /task, /任务
    const taskMatch = raw.match(/^\s*\/(?:t|task|任务)(?:\s+|$)([\s\S]*)/i);
    if (taskMatch) {
      const remaining = (taskMatch[1] || '').trim();
      if (!remaining) {
        return {
          type: 'system_reply',
          mode: 'task',
          message: '',
          systemReplyText:
            '🤖 已切换至【工作任务模式】。\n你可以直接向我发送任务指令（例如：`/t 拆分PDF文件`、`/t 查询北京天气`）。',
        };
      }
      return {
        type: 'ai',
        mode: 'task',
        message: remaining,
      };
    }

    // 4. Chat mode command: /c, /chat, /聊天
    const chatMatch = raw.match(/^\s*\/(?:c|chat|聊天)(?:\s+|$)([\s\S]*)/i);
    if (chatMatch) {
      const remaining = (chatMatch[1] || '').trim();
      if (!remaining) {
        return {
          type: 'system_reply',
          mode: 'chat',
          message: '',
          systemReplyText: '💬 已切换至【个人问答模式】。\n接下来你可以向我提问、咨询或进行日常交互。',
        };
      }
      return {
        type: 'ai',
        mode: 'chat',
        message: remaining,
      };
    }

    // 5. Configured / Default mode (微信通信默认统一调用个人模式 chat)
    // 微信端所有未带前缀的常规消息，一律默认进入个人模式；工作任务需通过 /t 显式触发
    return {
      type: 'ai',
      mode: 'chat',
      message: raw,
    };
  }

  private async deliverReply(
    connectionId: string,
    credential: Credential,
    replyText: string,
    contextToken?: string
  ): Promise<void> {
    const formatted = formatForWeChat(replyText);
    const chunks = splitTextPreservingLines(formatted, 1800);
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      if (!this.outboundQueue.isBudgetAvailable(connectionId)) {
        this.outboundQueue.park(connectionId, {
          kind: 'text',
          text: chunk,
          contextToken,
        });
        continue;
      }
      const sentCount = this.outboundQueue.recordSent(connectionId);
      const warningSuffix = this.outboundQueue.buildQuotaWarningSuffix(sentCount);
      const payload = chunk + warningSuffix;
      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        payload,
        contextToken
      );
    }
    const pending = this.outboundQueue.getPendingCount(connectionId);
    if (pending > 0) {
      this.logger.warn(
        `Connection ${connectionId} has ${pending} outbound message(s) queued due to WeChat rate limit`
      );
    }
  }

  async flushPending(connectionId: string, credential: Credential): Promise<number> {
    const items = this.outboundQueue.drainBatch(connectionId);
    let count = 0;
    for (const item of items) {
      if (item.kind === 'text') {
        const sentCount = this.outboundQueue.recordSent(connectionId);
        const warning = this.outboundQueue.buildQuotaWarningSuffix(sentCount);
        await this.wechat.sendText(
          credential.baseUrl,
          credential.token,
          credential.ownerUserId,
          item.text + warning,
          item.contextToken
        );
        count++;
      } else if (item.kind === 'media') {
        this.outboundQueue.recordSent(connectionId);
        await this.wechat.sendMediaMessage(
          credential.baseUrl,
          credential.token,
          credential.ownerUserId,
          item.mediaType,
          item.buffer,
          {
            fileName: item.fileName,
            contextToken: item.contextToken,
          }
        );
        count++;
      }
    }
    return count;
  }

  private getWechatMediaType(fileName: string): (typeof WechatUploadMediaType)[keyof typeof WechatUploadMediaType] {
    const ext = path.extname(fileName).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
      return WechatUploadMediaType.IMAGE;
    }
    if (['.mp4', '.mov'].includes(ext)) {
      return WechatUploadMediaType.VIDEO;
    }
    return WechatUploadMediaType.FILE;
  }

  private resolveUserFilePath(userId: string, targetPathOrName: string): string | null {
    const sanitized = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const projectRoot =
      Boolean(process.env.DOCKER_ENV) && fs.existsSync('/workspace')
        ? '/workspace'
        : process.env.PROJECT_ROOT || process.cwd();

    const clean = targetPathOrName.trim().replace(/^['"]|['"]$/g, '');
    const userRoot = path.join(projectRoot, 'data', 'users', sanitized);
    const workspaceDir = path.join(userRoot, 'workspace');
    const knowledgeDir = path.join(userRoot, 'knowledge');

    if (clean.startsWith('/workspace/')) {
      const rel = clean.slice('/workspace/'.length);
      const full = path.join(workspaceDir, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    }
    if (clean.startsWith('/knowledge/')) {
      const rel = clean.slice('/knowledge/'.length);
      const full = path.join(knowledgeDir, rel);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    }

    const inWorkspace = path.join(workspaceDir, clean);
    if (fs.existsSync(inWorkspace) && fs.statSync(inWorkspace).isFile()) return inWorkspace;

    const inKnowledge = path.join(knowledgeDir, clean);
    if (fs.existsSync(inKnowledge) && fs.statSync(inKnowledge).isFile()) return inKnowledge;

    for (const dir of [knowledgeDir, workspaceDir]) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir);
        const found = files.find(
          (f) =>
            f === clean ||
            path.parse(f).name === clean ||
            f.toLowerCase() === clean.toLowerCase()
        );
        if (found) {
          const full = path.join(dir, found);
          if (fs.statSync(full).isFile()) return full;
        }
        const sub = files.find((f) => f.includes(clean) || clean.includes(path.parse(f).name));
        if (sub) {
          const full = path.join(dir, sub);
          if (fs.statSync(full).isFile()) return full;
        }
      } catch {
        // ignore read error
      }
    }

    return null;
  }

  private async deliverFile(
    connectionId: string,
    credential: Credential,
    userId: string,
    fileInfo: OutboundFilePayload,
    contextToken?: string
  ): Promise<void> {
    try {
      const realPath = this.resolveUserFilePath(userId, fileInfo.filePath);
      if (!realPath || !fs.existsSync(realPath)) {
        this.logger.warn(`Outbound file not found on disk: ${fileInfo.filePath} for user ${userId}`);
        await this.wechat.sendText(
          credential.baseUrl,
          credential.token,
          credential.ownerUserId,
          `⚠️ 未能找到待发送的文件【${fileInfo.fileName}】，请确认文件是否存在于个人空间中。`,
          contextToken
        );
        return;
      }

      const buffer = fs.readFileSync(realPath);
      const fileName = fileInfo.fileName || path.basename(realPath);
      const mediaType = this.getWechatMediaType(fileName);

      if (!this.outboundQueue.isBudgetAvailable(connectionId)) {
        this.outboundQueue.park(connectionId, {
          kind: 'media',
          mediaType,
          buffer,
          fileName,
          contextToken,
        });
        this.logger.log(`Queued outbound file ${fileName} for ${connectionId}`);
        return;
      }

      this.outboundQueue.recordSent(connectionId);
      await this.wechat.sendMediaMessage(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        mediaType,
        buffer,
        { fileName, contextToken }
      );
      this.logger.log(`Successfully delivered outbound file ${fileName} to user ${userId} via WeChat`);
    } catch (err: any) {
      this.logger.error(
        `Failed to deliver outbound file ${fileInfo.fileName}: ${err.message}`,
        err.stack
      );
      await this.wechat.sendText(
        credential.baseUrl,
        credential.token,
        credential.ownerUserId,
        `⚠️ 发送文件【${fileInfo.fileName}】失败: ${err.message}`,
        contextToken
      );
    }
  }

  private async askAi(
    userId: string,
    sessionId: string,
    message: string,
    mode: 'chat' | 'task',
    files?: any[],
    systemReply?: string
  ): Promise<{ response: string; outboundFiles?: OutboundFilePayload[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, activeOrgId: true },
    });
    const response = await fetch(
      `${process.env.AI_ORCHESTRATOR_URL ?? 'http://ai-orchestrator:3007'}/ai/internal/chat`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET ?? '',
          'x-user-id': userId,
          'x-user-roles': user?.role ?? 'employee',
          ...(user?.activeOrgId ? { 'x-organization-id': user.activeOrgId } : {}),
        },
        body: JSON.stringify({
          message,
          sessionId,
          config: { mode, ...(systemReply ? { systemReply } : {}) },
          ...(files && files.length > 0 ? { files } : {}),
        }),
      }
    );
    if (!response.ok) throw new Error(`AI 服务调用失败（HTTP ${response.status}）`);
    const payload = (await response.json()) as {
      response?: string;
      outboundFiles?: OutboundFilePayload[];
    };
    return {
      response: payload.response?.trim() || '任务已处理，但没有可返回的文本结果。',
      outboundFiles: payload.outboundFiles,
    };
  }
}
