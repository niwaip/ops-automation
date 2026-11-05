import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../../ports';
import { UserCredentialCrypto } from '../../credentials/user-credential.crypto';
import { McpAccessService } from './mcp-access.service';
import { McpActor, MCP_PURPOSE } from './mcp.types';

@Injectable()
export class McpAuthorizationService {
  constructor(@Inject(WORKBENCH_PRISMA) private readonly db: WorkbenchPrismaPort,
    private readonly access: McpAccessService, private readonly crypto: UserCredentialCrypto) {}

  async bind(actor: McpActor, connectionId: string, input: any) {
    const connection = await this.access.connection(actor, connectionId);
    const revision = await this.db.mcpConnectionRevision.findUnique({ where: { id: connection.activeRevisionId } });
    if (revision?.config?.authType === 'none') throw new BadRequestException('公开连接无需保存凭证');
    const token = String(input.token || '').trim();
    if (!token || token.length > 16384 || /[\r\n]/.test(token)) throw new BadRequestException('请输入有效凭证');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) throw new BadRequestException('凭证有效期必须在未来');
    const result = await this.db.$transaction!(async (tx: any) => {
      const credential = await tx.userCredential.create({ data: {
        userId: actor.userId, orgId: connection.orgId, name: `MCP: ${connection.name}`.slice(0, 128),
        category: 'bearer_token', purpose: MCP_PURPOSE,
        encryptedData: this.crypto.encrypt({ token }), maskedPreview: { summary: '已设置连接凭证', fields: { token: '••••••••' } }, expiresAt,
      }});
      const old = await tx.userMcpAuthorization.findUnique({ where: { userId_connectionId: { userId: actor.userId, connectionId } } });
      const auth = await tx.userMcpAuthorization.upsert({
        where: { userId_connectionId: { userId: actor.userId, connectionId } },
        create: { userId: actor.userId, connectionId, revisionId: connection.activeRevisionId, credentialId: credential.id },
        update: { revisionId: connection.activeRevisionId, credentialId: credential.id, status: 'active' },
      });
      if (old) await tx.userCredential.update({ where: { id: old.credentialId }, data: { status: 'revoked', revision: { increment: 1 } } });
      return auth;
    });
    return { configured: true, authorizationId: result.id, identityVerified: false };
  }

  async revoke(actor: McpActor, connectionId: string) {
    await this.access.connection(actor, connectionId);
    await this.db.userMcpAuthorization.updateMany({ where: { userId: actor.userId, connectionId }, data: { status: 'revoked' } });
    return { configured: false };
  }

  async token(actor: McpActor, connection: any): Promise<string> {
    const revision = await this.db.mcpConnectionRevision.findUnique({ where: { id: connection.activeRevisionId } });
    if (revision?.config?.authType === 'none') return '';
    const auth = await this.db.userMcpAuthorization.findUnique({ where: { userId_connectionId: { userId: actor.userId, connectionId: connection.id } } });
    if (!auth || auth.status !== 'active' || auth.revisionId !== connection.activeRevisionId) {
      throw new UnauthorizedException({ code: 'MCP_NEEDS_AUTHORIZATION', message: '请为该连接设置自己的凭证；服务地址变更后需要重新授权' });
    }
    const credential = await this.db.userCredential.findFirst({ where: {
      id: auth.credentialId, userId: actor.userId, purpose: MCP_PURPOSE, status: 'active',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    }});
    if (!credential) throw new UnauthorizedException({ code: 'MCP_NEEDS_AUTHORIZATION', message: '连接凭证已失效，请重新授权' });
    const token = this.crypto.decrypt(credential.encryptedData).token;
    if (typeof token !== 'string') throw new UnauthorizedException('连接凭证无效');
    return token;
  }
}
