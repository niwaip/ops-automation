import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { ImCredentialCipher } from './im-channel.crypto';
import { IM_GATEWAY_PRISMA, ImGatewayPrismaPort } from './ports';

interface DingtalkCredential {
  webhookUrl: string;
  secret?: string;
}

@Injectable()
export class DingtalkChannelService {
  constructor(
    @Inject(IM_GATEWAY_PRISMA) private readonly prisma: ImGatewayPrismaPort,
    private readonly cipher: ImCredentialCipher,
  ) {}

  async get(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'dingtalk' } },
    });

    let maskedWebhookUrl = '';
    let hasSecret = false;

    if (connection?.encryptedCredential) {
      try {
        const decrypted = JSON.parse(
          this.cipher.decrypt(connection.encryptedCredential)
        ) as DingtalkCredential;
        maskedWebhookUrl = this.maskWebhookUrl(decrypted.webhookUrl);
        hasSecret = Boolean(decrypted.secret);
      } catch {
        maskedWebhookUrl = '***';
      }
    }

    return {
      channel: 'dingtalk',
      configured: Boolean(connection?.encryptedCredential),
      enabled: connection?.enabled ?? false,
      status: connection?.status ?? 'unconfigured',
      alias: connection?.xiaozhiAlias ?? '',
      webhookUrl: maskedWebhookUrl,
      hasSecret,
      lastConnectedAt: connection?.lastConnectedAt?.toISOString(),
      lastMessageAt: connection?.lastMessageAt?.toISOString(),
      lastError: connection?.lastError ?? undefined,
    };
  }

  async save(userId: string, rawWebhookUrl: string, rawSecret?: string, rawAlias?: string) {
    const webhookUrl = this.validateWebhookUrl(rawWebhookUrl);
    const secret = this.cleanSecret(rawSecret);
    const alias = this.cleanAlias(rawAlias);

    const fingerprint = createHmac('sha256', this.cipher.getFingerprintKey())
      .update(webhookUrl)
      .digest('hex');

    const bound = await this.prisma.imChannelConnection.findUnique({
      where: { credentialFingerprint: fingerprint },
    });
    if (bound && bound.userId !== userId) {
      throw new ConflictException('该钉钉机器人 Webhook 已绑定其他用户');
    }

    const payload: DingtalkCredential = {
      webhookUrl,
      ...(secret ? { secret } : {}),
    };
    const encrypted = this.cipher.encrypt(JSON.stringify(payload));

    await this.prisma.imChannelConnection.upsert({
      where: { userId_channel: { userId, channel: 'dingtalk' } },
      create: {
        userId,
        channel: 'dingtalk',
        enabled: false,
        status: 'disabled',
        encryptedCredential: encrypted,
        credentialFingerprint: fingerprint,
        xiaozhiAlias: alias,
      },
      update: {
        encryptedCredential: encrypted,
        credentialFingerprint: fingerprint,
        xiaozhiAlias: alias,
        lastError: null,
      },
    });

    return this.get(userId);
  }

  async setEnabled(userId: string, enabled: boolean) {
    const connection = await this.owned(userId);

    await this.prisma.imChannelConnection.update({
      where: { id: connection.id },
      data: {
        enabled,
        status: enabled ? 'online' : 'disabled',
        lastError: null,
      },
    });

    return this.get(userId);
  }

  async remove(userId: string) {
    const connection = await this.owned(userId);
    await this.prisma.imChannelConnection.update({
      where: { id: connection.id },
      data: {
        enabled: false,
        status: 'unconfigured',
        encryptedCredential: null,
        credentialFingerprint: null,
        xiaozhiAlias: null,
        lastError: null,
      },
    });
    return { success: true };
  }

  async test(userId: string, customMessage?: string) {
    const connection = await this.owned(userId);
    let credential: DingtalkCredential;
    try {
      credential = JSON.parse(
        this.cipher.decrypt(connection.encryptedCredential)
      ) as DingtalkCredential;
    } catch {
      throw new BadRequestException('凭据解密失败，请重新配置');
    }

    const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const markdownText =
      customMessage ||
      [
        '### 🚀 OpsPilot 钉钉机器人已成功连接',
        '',
        '> 钉钉群机器人通道已成功连通！OpsPilot 自动化任务与协同消息推送服务已就绪。',
        '',
        '- **通知渠道**：钉钉群机器人 (DingTalk Bot)',
        '- **连接状态**：正常在线 (Online)',
        `- **安全签名**：${credential.secret ? '加签安全校验通过 (HMAC-SHA256)' : '未开启加签'}`,
        `- **测试时间**：${timeStr}`,
        '',
        '本消息由 OpsPilot 即时通讯集成中心发起的连通性健康检查。',
      ].join('\n');

    let targetUrl = credential.webhookUrl;
    if (credential.secret && credential.secret.trim()) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${credential.secret.trim()}`;
      const sign = createHmac('sha256', credential.secret.trim())
        .update(stringToSign)
        .digest('base64');
      const delimiter = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${delimiter}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            title: 'OpsPilot 钉钉机器人连接成功',
            text: markdownText,
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      const data = (await response.json().catch(() => ({}))) as {
        errcode?: number;
        errmsg?: string;
      };

      if (response.ok && data.errcode === 0) {
        await this.prisma.imChannelConnection.update({
          where: { id: connection.id },
          data: {
            status: 'online',
            lastConnectedAt: new Date(),
            lastMessageAt: new Date(),
            lastError: null,
          },
        });
        return {
          success: true,
          message: '连通性测试成功，测试消息已推送到钉钉群！',
          status: 'online',
        };
      } else {
        const errorMsg = data.errmsg || `HTTP ${response.status}: ${response.statusText}`;
        await this.prisma.imChannelConnection.update({
          where: { id: connection.id },
          data: {
            lastError: errorMsg,
          },
        });
        return {
          success: false,
          error: errorMsg,
          status: connection.status,
        };
      }
    } catch (err: any) {
      const errorMsg = err?.message || '网络连接超时或无法访问钉钉网关';
      await this.prisma.imChannelConnection.update({
        where: { id: connection.id },
        data: {
          lastError: errorMsg,
        },
      });
      return {
        success: false,
        error: errorMsg,
        status: connection.status,
      };
    }
  }

  private async owned(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({
      where: { userId_channel: { userId, channel: 'dingtalk' } },
    });
    if (!connection?.encryptedCredential) {
      throw new NotFoundException('尚未配置钉钉机器人接入点');
    }
    return connection;
  }

  private validateWebhookUrl(raw: string): string {
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new BadRequestException('Webhook 地址不能为空');
    }
    const trimmed = raw.trim();
    if (trimmed.length > 2048) {
      throw new BadRequestException('Webhook 地址长度超出限制');
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('Webhook 地址格式无效');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('钉钉 Webhook 必须使用 https 协议');
    }
    if (
      parsed.hostname !== 'oapi.dingtalk.com' ||
      !parsed.pathname.startsWith('/robot/send')
    ) {
      throw new BadRequestException('请使用钉钉官方自定义机器人 Webhook 地址 (https://oapi.dingtalk.com/robot/send)');
    }
    if (!parsed.searchParams.get('access_token')) {
      throw new BadRequestException('钉钉 Webhook 地址必须包含 access_token 参数');
    }
    return parsed.toString();
  }

  private cleanSecret(secret?: string): string | undefined {
    if (!secret || typeof secret !== 'string') return undefined;
    const trimmed = secret.trim();
    if (!trimmed) return undefined;
    if (trimmed.length > 256) {
      throw new BadRequestException('加签 Secret 长度超出限制');
    }
    return trimmed;
  }

  private cleanAlias(alias?: string): string | null {
    if (!alias || typeof alias !== 'string') return null;
    const trimmed = alias.trim();
    if (trimmed.length > 100) {
      throw new BadRequestException('别名不能超过 100 字');
    }
    return trimmed || null;
  }

  private maskWebhookUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const token = parsed.searchParams.get('access_token');
      if (token && token.length > 8) {
        const masked = `${token.slice(0, 4)}****${token.slice(-4)}`;
        parsed.searchParams.set('access_token', masked);
      }
      return parsed.toString();
    } catch {
      return url.slice(0, 30) + '...';
    }
  }
}
