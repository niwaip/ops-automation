import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IM_GATEWAY_PRISMA, ImGatewayPrismaPort } from './ports';
import { ChannelTaskGatewayService } from './channel-task-gateway.service';

const MAX_INSTRUCTION = 1000;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'unknown', 'waiting_input', 'pending_approval']);

@Injectable()
export class XiaozhiTaskService {
  private readonly active = new Set<string>();
  constructor(
    @Inject(IM_GATEWAY_PRISMA) private readonly prisma: ImGatewayPrismaPort,
    private readonly gateway: ChannelTaskGatewayService,
  ) {}

  async submit(connectionId: string, instruction: string, idempotencyKey?: string) {
    const text = instruction?.trim();
    if (!text || text.length > MAX_INSTRUCTION) throw new BadRequestException('任务指令长度须为 1 到 1000 字');
    const connection = await this.enabledConnection(connectionId);
    const user = await this.prisma.user.findUnique({ where: { id: connection.userId }, select: { id: true, isActive: true, role: true, activeOrgId: true } });
    if (!user?.isActive) throw new BadRequestException('绑定用户已停用');
    const key = idempotencyKey && /^[\w:-]{8,128}$/.test(idempotencyKey) ? idempotencyKey : randomUUID();
    const existing = await this.prisma.voiceTaskRequest.findUnique({ where: { channelConnectionId_idempotencyKey: { channelConnectionId: connectionId, idempotencyKey: key } } });
    if (existing) {
      if (existing.instruction !== text) throw new BadRequestException('幂等键对应另一条任务');
      return this.publicTask(existing);
    }
    const recent = await this.prisma.voiceTaskRequest.findFirst({ where: { channelConnectionId: connectionId, instruction: text, createdAt: { gte: new Date(Date.now() - 10_000) } }, orderBy: { createdAt: 'desc' } });
    if (recent) return this.publicTask(recent);
    const perMinute = await this.prisma.voiceTaskRequest.count({ where: { channelConnectionId: connectionId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
    if (perMinute >= 6) throw new BadRequestException('语音任务过于频繁，请稍后再试');
    const task = await this.prisma.voiceTaskRequest.create({ data: { channelConnectionId: connectionId, ownerUserId: user.id, organizationId: user.activeOrgId, idempotencyKey: key, instruction: text } });
    return this.publicTask(task);
  }

  async get(connectionId: string, requestId?: string) {
    await this.enabledConnection(connectionId);
    const where = requestId ? { id: requestId, channelConnectionId: connectionId } : { channelConnectionId: connectionId };
    const task = requestId
      ? await this.prisma.voiceTaskRequest.findFirst({ where })
      : await this.prisma.voiceTaskRequest.findFirst({ where, orderBy: { createdAt: 'desc' } });
    if (!task) throw new NotFoundException('没有找到该连接的任务');
    return this.publicTask(task);
  }

  async listForUser(userId: string, limit: number) {
    const rows = await this.prisma.voiceTaskRequest.findMany({ where: { ownerUserId: userId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit || 20, 1), 50) });
    return rows.map((row: any) => ({ ...this.publicTask(row), instruction: row.instruction, createdAt: row.createdAt.toISOString() }));
  }

  async recoverInterrupted(connectionId: string) {
    await this.prisma.voiceTaskRequest.updateMany({
      where: { channelConnectionId: connectionId, status: { in: ['planning', 'running'] }, ...(this.active.size ? { id: { notIn: [...this.active] } } : {}) },
      data: { status: 'unknown', speechSummary: '服务重启后尚未确认任务结果，请在网页核对。', lastErrorCode: 'WORKER_RESTARTED' },
    });
  }

  async drain(connectionIds: string[]) {
    if (!connectionIds.length || this.active.size >= 4) return;
    const pending = await this.prisma.voiceTaskRequest.findMany({
      where: { channelConnectionId: { in: connectionIds }, status: 'accepted' },
      orderBy: { createdAt: 'asc' }, take: 4 - this.active.size,
    });
    for (const task of pending) {
      const claim = await this.prisma.voiceTaskRequest.updateMany({
        where: { id: task.id, status: 'accepted' },
        data: { status: 'planning', speechSummary: '任务已受理，正在准备执行。' },
      });
      if (claim.count !== 1) continue;
      this.active.add(task.id);
      void this.execute(task.id).catch(() => undefined).finally(() => this.active.delete(task.id));
    }
  }

  private async enabledConnection(connectionId: string) {
    const connection = await this.prisma.imChannelConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.channel !== 'xiaozhi' || !connection.enabled || !connection.encryptedCredential) throw new BadRequestException('小智连接不可用');
    return connection;
  }

  private publicTask(task: any) {
    return {
      request_id: task.id,
      status: task.status,
      speech: task.speechSummary,
      ...(task.executionId ? { execution_id: task.executionId, detail_path: `/executions/${task.executionId}` } : {}),
    };
  }

  private async execute(taskId: string) {
    const task = await this.prisma.voiceTaskRequest.findUnique({ where: { id: taskId } });
    if (!task) return;
    const connection = await this.prisma.imChannelConnection.findUnique({ where: { id: task.channelConnectionId } });
    const user = await this.prisma.user.findUnique({ where: { id: task.ownerUserId }, select: { id: true, isActive: true, role: true, activeOrgId: true } });
    if (!connection?.enabled || !user?.isActive) {
      await this.prisma.voiceTaskRequest.update({ where: { id: taskId }, data: { status: 'cancelled', speechSummary: '连接或用户已停用，任务未执行。' } });
      return;
    }
    await this.prisma.voiceTaskRequest.update({ where: { id: taskId }, data: { status: 'running', speechSummary: '任务正在处理。' } });
    try {
      const answer = await this.gateway.dispatch(
        user.id,
        `xiaozhi:${task.channelConnectionId}:${task.id}`,
        task.instruction,
        'task',
        { traceId: task.id, idempotencyKey: task.id },
      );
      const events = Array.isArray(answer.events) ? answer.events : [];
      const executionId = events.map((event: any) => event?.data?.executionId).find((value: any) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value));
      const result = [...events].reverse().find((event: any) => TERMINAL.has(event?.data?.status) || event?.data?.status === 'success' || ['result', 'error', 'waiting_input', 'pending_approval'].includes(event?.type));
      const status = result?.type === 'error' ? 'failed' : result?.data?.status === 'success' ? 'succeeded' : TERMINAL.has(result?.data?.status) ? result.data.status : ['waiting_input', 'pending_approval'].includes(result?.type) ? result.type : 'unknown';
      const simulated = !executionId && /模拟|示例|离线\/受控|未实际执行/.test(String(result?.content || answer.response || ''));
      const speech = simulated
        ? '本次只收到模拟文本，没有真实执行记录，不能作为巡检结果。'
        : status === 'succeeded' ? String(result?.content || '任务已完成。')
          : status === 'pending_approval' || status === 'waiting_input' ? '任务需要在网页处理，请打开任务详情。'
            : status === 'failed' ? '任务执行失败，请在网页查看详情。'
              : !executionId ? '没有生成可验证的执行记录，无法确认任务结果。'
                : '已收到任务返回，但无法确认最终状态，请在网页核对。';
      const authorizedExecutionId = executionId && await this.canReadExecution(executionId, user);
      await this.prisma.voiceTaskRequest.update({ where: { id: taskId }, data: { status: simulated ? 'unknown' : status, speechSummary: speech.slice(0, 180), executionId: authorizedExecutionId ? executionId : null, lastErrorCode: simulated ? 'UNVERIFIED_MODEL_OUTPUT' : null } });
    } catch {
      await this.prisma.voiceTaskRequest.update({ where: { id: taskId }, data: { status: 'unknown', speechSummary: '无法确认执行结果，请在网页核对。', lastErrorCode: 'EXECUTION_UNCONFIRMED' } });
    }
  }

  private async canReadExecution(executionId: string, user: { id: string; role: string; activeOrgId?: string | null }) {
    try {
      const response = await fetch(`${process.env.CONTROL_PLANE_URL ?? 'http://control-plane:3003'}/api/executions/${executionId}`, {
        headers: {
          'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET ?? '',
          'x-user-id': user.id,
          'x-user-role': user.role,
          ...(user.activeOrgId ? { 'x-organization-id': user.activeOrgId } : {}),
        },
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch { return false; }
  }
}
