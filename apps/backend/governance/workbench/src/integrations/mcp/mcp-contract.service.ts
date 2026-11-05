import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { McpAccessService } from './mcp-access.service';
import { McpActor } from './mcp.types';

@Injectable()
export class McpContractService {
  constructor(private readonly access: McpAccessService) {}
  issue(actor: McpActor, binding: any, mode: 'personal' | 'work') {
    const payload = Buffer.from(JSON.stringify({ userId: actor.userId, bindingId: binding.id,
      revisionId: binding.revisionId, schemaDigest: binding.schemaDigest, mode, exp: Date.now() + 10 * 60000 })).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }
  async verify(actor: McpActor, bindingId: string, mode: 'personal' | 'work', token: string) {
    try {
      if (typeof token !== 'string' || token.length > 4096) throw new Error();
      const parts = token.split('.');
      if (parts.length !== 2) throw new Error();
      const [payload, signature] = parts;
      const expected = this.sign(payload);
      if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
      const claim = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const { binding } = await this.access.binding(actor, bindingId, mode);
      if (claim.userId !== actor.userId || claim.bindingId !== bindingId || claim.mode !== mode ||
          claim.revisionId !== binding.revisionId || claim.schemaDigest !== binding.schemaDigest || claim.exp <= Date.now()) throw new Error();
    } catch { throw new UnauthorizedException({ code: 'MCP_CONTRACT_REQUIRED', message: '请先读取该工具的当前参数契约，再发起调用' }); }
  }
  private sign(payload: string) {
    const secret = process.env.INTERNAL_API_SHARED_SECRET;
    if (!secret) throw new UnauthorizedException('MCP 契约签名未配置');
    return createHmac('sha256', secret).update(`mcp-contract:${payload}`).digest('base64url');
  }
}
