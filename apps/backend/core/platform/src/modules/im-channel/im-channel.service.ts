import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ImCredentialCipher } from './im-channel.crypto';
import { WechatIlinkClient, WechatLoginResult } from './wechat-ilink.client';

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
  private readonly maxActiveConnections = Number(
    process.env.IM_CHANNEL_MAX_ACTIVE_CONNECTIONS ?? 100
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ImCredentialCipher,
    private readonly wechat: WechatIlinkClient
  ) {}

  async onModuleInit() {
    const enabled = await this.prisma.imChannelConnection.findMany({
      where: { enabled: true, channel: 'wechat' },
    });
    for (const connection of enabled) void this.startRuntime(connection.id);
  }

  onModuleDestroy() {
    for (const attempt of this.provisioning.values()) attempt.controller.abort();
    for (const runtime of this.runtimes.values()) runtime.abort();
  }

  async getWechat(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'wechat' } },
    });
    const attempt = this.provisioning.get(userId);
    return {
      channel: 'wechat',
      configured: Boolean(connection?.encryptedCredential),
      enabled: connection?.enabled ?? false,
      status: attempt?.state ?? connection?.status ?? 'unconfigured',
      interactionMode: connection?.interactionMode ?? 'auto',
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
      create: { userId, channel: 'wechat', enabled: false, status: 'provisioning' },
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
      while (!controller.signal.aborted) {
        const response = await this.wechat.getUpdates(
          credential.baseUrl,
          credential.token,
          cursor,
          controller.signal
        );
        if (response?.ret === -14 || response?.errcode === -14)
          throw new Error('微信登录凭据已失效');
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
    const text = (Array.isArray(message?.item_list) ? message.item_list : [])
      .map((item: any) => (item?.type === 1 ? item?.text_item?.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!text) return;

    const request = this.resolveInteraction(text, configuredMode);

    if (request.isNewSession) {
      this.getSessionId(connectionId, true);
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

    let reply = '';
    try {
      reply = await this.askAi(userId, sessionId, request.message, request.mode);
    } finally {
      clearInterval(typingInterval);
      this.wechat
        .sendTyping(credential.baseUrl, credential.token, credential.ownerUserId, 2)
        .catch(() => {});
    }

    await this.wechat.sendText(
      credential.baseUrl,
      credential.token,
      credential.ownerUserId,
      reply,
      message?.context_token
    );
    await this.prisma.imChannelConnection.update({
      where: { id: connectionId },
      data: { lastMessageAt: new Date() },
    });
  }

  resolveInteraction(
    text: string,
    configuredMode: InteractionMode
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
          '• `/t` 或 `/task <指令>`：任务执行模式（执行文件处理、搜索、自动化等）\n' +
          '• `/c` 或 `/chat <问题>`：直接聊天模式（知识问答、自由闲聊）\n' +
          '• `/n` 或 `/new [指令]`：重置并开启全新会话\n' +
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
            '🤖 已切换至【任务执行模式】。\n你可以直接向我发送任务指令（例如：`/t 拆分PDF文件`、`/t 查询北京天气`）。',
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
          systemReplyText: '💬 已切换至【日常聊天模式】。\n接下来你可以和我自由对话、咨询问题。',
        };
      }
      return {
        type: 'ai',
        mode: 'chat',
        message: remaining,
      };
    }

    // 5. Configured / Default mode
    if (configuredMode !== 'auto') {
      return {
        type: 'ai',
        mode: configuredMode,
        message: raw,
      };
    }

    const taskIntent =
      /(天气|气温|预报|搜索|查询|查一下|打开网页|浏览|下载|生成|创建|导出|发送|整理|总结|翻译|执行|运行|审批|文件|报告|表格|PDF|PPT|计划|提醒)/i;
    return {
      type: 'ai',
      mode: taskIntent.test(raw) ? 'task' : 'chat',
      message: raw,
    };
  }

  private async askAi(
    userId: string,
    sessionId: string,
    message: string,
    mode: 'chat' | 'task'
  ): Promise<string> {
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
        body: JSON.stringify({ message, sessionId, config: { mode } }),
      }
    );
    if (!response.ok) throw new Error(`AI 服务调用失败（HTTP ${response.status}）`);
    const payload = (await response.json()) as { response?: string };
    return payload.response?.trim() || '任务已处理，但没有可返回的文本结果。';
  }
}
