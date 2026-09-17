import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IM_GATEWAY_PRISMA, ImGatewayPrismaPort } from './ports';

@Injectable()
export class ChannelTaskGatewayService {
  constructor(@Inject(IM_GATEWAY_PRISMA) private readonly prisma: ImGatewayPrismaPort) {}

  async dispatch(
    userId: string,
    sessionId: string,
    message: string,
    mode: 'chat' | 'task',
    options?: { files?: unknown[]; systemReply?: string; traceId?: string; idempotencyKey?: string },
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, role: true, activeOrgId: true },
    });
    if (!user?.isActive) throw new BadRequestException('渠道绑定用户已停用');
    const response = await fetch(`${process.env.AI_ORCHESTRATOR_URL ?? 'http://ai-orchestrator:3007'}/ai/internal/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-auth': process.env.INTERNAL_API_SHARED_SECRET ?? '',
        'x-user-id': user.id,
        'x-user-roles': user.role,
        ...(user.activeOrgId ? { 'x-organization-id': user.activeOrgId } : {}),
      },
      body: JSON.stringify({
        message, sessionId,
        ...(options?.traceId ? { traceId: options.traceId } : {}),
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        config: { mode, ...(options?.systemReply ? { systemReply: options.systemReply } : {}) },
        ...(options?.files?.length ? { files: options.files } : {}),
      }),
    });
    if (!response.ok) throw new Error(`AI 服务调用失败（HTTP ${response.status}）`);
    return response.json();
  }
}
