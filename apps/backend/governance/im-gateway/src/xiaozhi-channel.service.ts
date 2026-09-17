import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ImCredentialCipher } from './im-channel.crypto';
import { IM_GATEWAY_PRISMA, ImGatewayPrismaPort } from './ports';
import { XiaozhiTaskService } from './xiaozhi-task.service';

@Injectable()
export class XiaozhiChannelService {
  constructor(
    @Inject(IM_GATEWAY_PRISMA) private readonly prisma: ImGatewayPrismaPort,
    private readonly cipher: ImCredentialCipher,
    private readonly tasks: XiaozhiTaskService,
  ) {}

  async get(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({ where: { userId_channel: { userId, channel: 'xiaozhi' } } });
    return {
      channel: 'xiaozhi', configured: Boolean(connection?.encryptedCredential), enabled: connection?.enabled ?? false,
      status: connection?.status ?? 'unconfigured', alias: connection?.xiaozhiAlias ?? '',
      lastConnectedAt: connection?.lastConnectedAt?.toISOString(), lastToolCallAt: connection?.lastMessageAt?.toISOString(),
      lastError: connection?.lastError ?? undefined,
    };
  }

  async save(userId: string, endpoint: string, alias?: string) {
    const url = this.validateEndpoint(endpoint);
    const fingerprint = createHmac('sha256', this.key()).update(url).digest('hex');
    const bound = await this.prisma.imChannelConnection.findUnique({ where: { credentialFingerprint: fingerprint } });
    if (bound && bound.userId !== userId) throw new ConflictException('该接入点已绑定其他用户');
    const existing = await this.prisma.imChannelConnection.findUnique({ where: { userId_channel: { userId, channel: 'xiaozhi' } } });
    if (existing?.enabled) throw new BadRequestException('请先停用小智连接，再替换接入点');
    await this.prisma.imChannelConnection.upsert({
      where: { userId_channel: { userId, channel: 'xiaozhi' } },
      create: { userId, channel: 'xiaozhi', enabled: false, status: 'disabled', encryptedCredential: this.cipher.encrypt(url), credentialFingerprint: fingerprint, xiaozhiAlias: this.cleanAlias(alias) },
      update: { status: 'disabled', encryptedCredential: this.cipher.encrypt(url), credentialFingerprint: fingerprint, xiaozhiAlias: this.cleanAlias(alias), lastError: null },
    });
    return this.get(userId);
  }

  async setEnabled(userId: string, enabled: boolean) {
    const connection = await this.owned(userId);
    if (enabled && !connection.enabled) {
      const active = await this.prisma.imChannelConnection.count({ where: { channel: 'xiaozhi', enabled: true } });
      if (active >= Number(process.env.IM_CHANNEL_MAX_ACTIVE_CONNECTIONS ?? 100)) throw new BadRequestException('小智连接容量已满');
    }
    await this.prisma.imChannelConnection.update({ where: { id: connection.id }, data: { enabled, status: enabled ? 'connecting' : 'disabled', lastError: null } });
    if (!enabled) await this.prisma.voiceTaskRequest.updateMany({ where: { channelConnectionId: connection.id, status: 'accepted' }, data: { status: 'cancelled', speechSummary: '连接已停用，任务未执行。' } });
    return this.get(userId);
  }

  async remove(userId: string) {
    const connection = await this.owned(userId);
    await this.prisma.imChannelConnection.update({ where: { id: connection.id }, data: { enabled: false, status: 'unconfigured', encryptedCredential: null, credentialFingerprint: null, xiaozhiAlias: null, lastError: null } });
    await this.prisma.voiceTaskRequest.updateMany({ where: { channelConnectionId: connection.id, status: 'accepted' }, data: { status: 'cancelled', speechSummary: '连接已解除，任务未执行。' } });
    return { success: true };
  }

  async test(userId: string) {
    const connection = await this.owned(userId);
    let internalTaskService = false;
    try {
      const response = await fetch(`${process.env.AI_ORCHESTRATOR_URL ?? 'http://ai-orchestrator:3007'}/health`, { signal: AbortSignal.timeout(3000) });
      internalTaskService = response.ok;
    } catch { /* The diagnostic reports an unreachable dependency without creating a task. */ }
    return {
      endpointValid: Boolean(connection.encryptedCredential),
      toolDiscovery: connection.status === 'online' && Boolean(connection.lastMessageAt && connection.lastConnectedAt && connection.lastMessageAt >= connection.lastConnectedAt),
      internalTaskService,
      status: connection.status,
    };
  }

  async listTasks(userId: string, limit: number) { return this.tasks.listForUser(userId, limit); }

  private async owned(userId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({ where: { userId_channel: { userId, channel: 'xiaozhi' } } });
    if (!connection?.encryptedCredential) throw new NotFoundException('尚未配置小智接入点');
    return connection;
  }

  private validateEndpoint(raw: string) {
    if (typeof raw !== 'string' || raw.length > 2048) throw new BadRequestException('接入点格式错误');
    let url: URL;
    try { url = new URL(raw.trim()); } catch { throw new BadRequestException('接入点格式错误'); }
    if (url.protocol !== 'wss:' || url.hostname !== 'api.xiaozhi.me' || !url.pathname.startsWith('/mcp/') || !url.searchParams.get('token') || url.username || url.password || url.hash) throw new BadRequestException('请使用小智官方 MCP 接入点');
    return url.toString();
  }

  private cleanAlias(alias?: string) {
    const value = (alias ?? '').trim();
    if (value.length > 100) throw new BadRequestException('别名不能超过 100 字');
    return value || null;
  }

  private key() {
    const raw = process.env.IM_CHANNEL_ENCRYPTION_KEY ?? '';
    return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  }
}
