import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../../ports';
import { McpAccessService } from './mcp-access.service';
import { McpAuthorizationService } from './mcp-authorization.service';
import { McpRunnerClient } from './mcp-runner.client';
import { assertId, digest, McpActor } from './mcp.types';
import { redactTransportSecret } from './mcp-secret-redaction';
export { redactTransportSecret } from './mcp-secret-redaction';

@Injectable()
export class McpInvocationService {
  private readonly ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  constructor(@Inject(WORKBENCH_PRISMA) private readonly db: WorkbenchPrismaPort,
    private readonly access: McpAccessService, private readonly auth: McpAuthorizationService,
    private readonly runner: McpRunnerClient) {}

  async invoke(actor: McpActor, bindingId: string, args: any, requestKey: string, mode: 'personal' | 'work') {
    const { connection, binding } = await this.access.binding(actor, bindingId, mode);
    await this.auth.token(actor, connection); // Check before idempotent result lookup, including revoked credentials.
    if (!args || typeof args !== 'object' || Array.isArray(args) || Buffer.byteLength(JSON.stringify(args)) > 128 * 1024) {
      throw new BadRequestException('工具参数必须是有效对象且不超过 128KB');
    }
    this.validate(binding.inputSchema, args);
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(requestKey || '')) throw new BadRequestException('缺少有效调用标识');
    const inputHash = digest({ bindingId, args, mode });
    let invocation: any;
    try {
      invocation = await this.db.mcpInvocation.create({ data: { userId: actor.userId, connectionId: connection.id,
        bindingId, requestKey, inputHash, status: binding.effect === 'read' ? 'dispatched' : 'awaiting_confirmation',
        result: binding.effect === 'read' ? undefined : { arguments: args, mode },
      }});
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const existing = await this.db.mcpInvocation.findUnique({ where: { userId_requestKey: { userId: actor.userId, requestKey } } });
      if (!existing || existing.inputHash !== inputHash) throw new ConflictException('调用标识已绑定其他参数');
      return this.response(existing);
    }
    if (binding.effect !== 'read') return { invocationId: invocation.id, status: 'awaiting_confirmation',
      message: '该操作可能修改外部数据，请在连接页面核对并确认', toolName: binding.remoteName, arguments: args };
    return this.execute(actor, connection, binding, invocation.id, args);
  }

  async confirm(actor: McpActor, id: string) {
    assertId(id);
    const invocation = await this.db.mcpInvocation.findFirst({ where: { id, userId: actor.userId } });
    if (!invocation) throw new ForbiddenException('无权确认此操作');
    if (invocation.status !== 'awaiting_confirmation') return this.response(invocation);
    if (Date.now() - new Date(invocation.createdAt).getTime() > 10 * 60000) throw new BadRequestException('确认已过期，请重新发起');
    const saved = invocation.result;
    const { connection, binding } = await this.access.binding(actor, invocation.bindingId, saved.mode);
    await this.auth.token(actor, connection);
    const claimed = await this.db.mcpInvocation.updateMany({ where: { id, userId: actor.userId, status: 'awaiting_confirmation' }, data: { status: 'dispatched', result: { approvedBy: actor.userId } } });
    if (!claimed.count) throw new ConflictException('该操作已确认，请查看执行状态');
    return this.execute(actor, connection, binding, id, saved.arguments);
  }

  async status(actor: McpActor, id: string) {
    assertId(id);
    const row = await this.db.mcpInvocation.findFirst({ where: { id, userId: actor.userId } });
    if (!row) throw new ForbiddenException();
    await this.access.connection(actor, row.connectionId);
    return this.response(row);
  }

  async pending(actor: McpActor) {
    const rows = await this.db.mcpInvocation.findMany({ where: { userId: actor.userId, status: 'awaiting_confirmation' }, orderBy: { createdAt: 'desc' }, take: 50 });
    const visible: any[] = [];
    for (const row of rows) {
      try {
        const connection = await this.access.connection(actor, row.connectionId);
        const binding = await this.db.mcpToolBinding.findUnique({ where: { id: row.bindingId } });
        visible.push({ ...this.response(row), connectionName: connection.name, toolName: binding?.remoteName });
      } catch { /* no cross-org history */ }
    }
    return visible;
  }

  private async execute(actor: McpActor, connection: any, binding: any, id: string, args: Record<string, unknown>) {
    try {
      const token = await this.auth.token(actor, connection);
      const revision = await this.db.mcpConnectionRevision.findUnique({ where: { id: connection.activeRevisionId } });
      const mode = connection.scope === 'personal' ? 'personal' : 'work';
      let raw: any;
      // Read retries are bounded; writes and unknown effects always dispatch at most once.
      const attempts = binding.effect === 'read' ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        await this.access.binding(actor, binding.id, mode);
        const currentToken = await this.auth.token(actor, connection);
        if (currentToken !== token) throw new Error('MCP_AUTHORIZATION_CHANGED');
        try {
          const config = binding.effect === 'read' ? { ...revision.config, timeoutMs: Math.min(revision.config.timeoutMs, 15000) } : revision.config;
          raw = await this.runner.call(config, token, 'invoke', binding.remoteName, args, binding.schemaDigest);
          break;
        } catch (error: any) {
          if (attempt + 1 >= attempts || !['timeout', 'network'].includes(error.category)) throw error;
        }
      }
      const result = redactTransportSecret(raw, token);
      if (!result.isError && binding.outputSchema) this.validate(binding.outputSchema, result.structuredContent);
      const status = result.isError ? 'tool_error' : 'completed';
      await this.db.mcpInvocation.update({ where: { id }, data: { status, result } });
      return { invocationId: id, status, result };
    } catch (error: any) {
      // Conservative for writes, including a crash/timeout after remote commit. Never automatically replay.
      const status = error.category === 'contract' ? 'contract_changed' : binding.effect === 'read' ? 'failed' : 'outcome_unknown';
      const failure = { code: 'MCP_CALL_UNVERIFIED', category: error.category || 'gateway', phase: error.phase || 'validation' };
      await this.db.mcpInvocation.update({ where: { id }, data: { status, result: failure } });
      return { invocationId: id, status, ...failure };
    }
  }

  private validate(schema: any, value: any) {
    try { if (!this.ajv.validate(schema, value)) throw new Error(); }
    catch { throw new BadRequestException('工具参数或返回值不符合冻结契约'); }
  }

  private response(row: any) {
    return { invocationId: row.id, connectionId: row.connectionId, bindingId: row.bindingId,
      status: row.status === 'dispatched' ? 'outcome_unknown' : row.status, result: row.result };
  }
}
