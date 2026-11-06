import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../../ports';
import { McpAccessService } from './mcp-access.service';
import { McpAuthorizationService } from './mcp-authorization.service';
import { McpRunnerClient } from './mcp-runner.client';
import { configFrom, digest, McpActor } from './mcp.types';
import { McpPublicationService } from './mcp-publication.service';

@Injectable()
export class McpConnectionService {
  constructor(@Inject(WORKBENCH_PRISMA) private readonly db: WorkbenchPrismaPort,
    private readonly access: McpAccessService, private readonly authorization: McpAuthorizationService,
    private readonly runner: McpRunnerClient, private readonly publication: McpPublicationService) {}

  async list(actor: McpActor, includeSummary = false) {
    const connections = await this.db.mcpConnection.findMany({ where: { OR: [
      { scope: 'personal', ownerUserId: actor.userId },
      ...(actor.orgId ? [{ scope: 'organization', orgId: actor.orgId }] : []),
    ] }, orderBy: { createdAt: 'desc' } });
    return Promise.all(connections.map(async (row: any) => {
      const revision = await this.db.mcpConnectionRevision.findUnique({ where: { id: row.activeRevisionId } });
      let configured = false;
      try { await this.authorization.token(actor, row); configured = true; } catch { /* state only */ }
      // Raw editorial metadata can mention tools hidden from a work role. Catalog filters it by tool set.
      const { capabilitySummary, ...publicRow } = row;
      return { ...publicRow, ...(includeSummary ? { capabilitySummary } : {}), config: revision?.config, revision: revision?.revision, configured,
        canManage: row.scope === 'personal' || actor.orgAdmin };
    }));
  }

  async save(actor: McpActor, body: any, id?: string) {
    const existing = id ? await this.access.connection(actor, id, true) : null;
    const scope = existing?.scope || body.scope;
    if (!['personal', 'organization'].includes(scope)) throw new BadRequestException('请选择连接范围');
    if (scope === 'organization' && (!actor.orgAdmin || !actor.orgId)) throw new ForbiddenException('仅组织管理员可配置工作连接');
    const name = String(body.name || '').trim();
    if (!name || name.length > 128) throw new BadRequestException('连接名称应为 1–128 个字符');
    const config = configFrom(body, scope === 'organization');
    return this.db.$transaction!(async (tx: any) => {
      const connection = existing || await tx.mcpConnection.create({ data: { scope, ownerUserId: actor.userId,
        orgId: scope === 'organization' ? actor.orgId : null, name } });
      const last = await tx.mcpConnectionRevision.findFirst({ where: { connectionId: connection.id }, orderBy: { revision: 'desc' } });
      const revision = await tx.mcpConnectionRevision.create({ data: { connectionId: connection.id,
        revision: (last?.revision || 0) + 1, config, digest: digest(config) } });
      await tx.mcpConnection.update({ where: { id: connection.id }, data: { name, activeRevisionId: revision.id } });
      return { id: connection.id, revisionId: revision.id, revision: revision.revision, requiresAuthorization: config.authType !== 'none' };
    });
  }

  async disable(actor: McpActor, id: string, disabled: boolean) {
    await this.access.connection(actor, id, true);
    return this.db.mcpConnection.update({ where: { id }, data: { status: disabled ? 'disabled' : 'active' } });
  }

  async discover(actor: McpActor, id: string) {
    const connection = await this.access.connection(actor, id, true);
    if (connection.status !== 'active') throw new BadRequestException('连接已停用');
    const revision = await this.db.mcpConnectionRevision.findUnique({ where: { id: connection.activeRevisionId } });
    const token = await this.authorization.token(actor, connection);
    const result = await this.runner.call(revision.config, token, 'discover');
    return { tools: this.redact(result.tools || [], token), revisionId: revision.id, identityVerified: false };
  }

  async publish(actor: McpActor, id: string, body: any) {
    const selected = Array.isArray(body.tools) ? body.tools : [];
    if (!selected.length || selected.length > 100) throw new BadRequestException('请选择 1–100 个工具');
    const discovered = await this.discover(actor, id);
    const tools = discovered.tools;
    const created: any[] = [];
    for (const choice of selected) {
      const tool = tools.find((t: any) => t.name === choice.name);
      if (!tool || typeof tool.inputSchema !== 'object') throw new BadRequestException('工具不在当前远端目录中');
      const effect = ['read', 'write'].includes(choice.effect) ? choice.effect : 'unknown';
      const roles = Array.isArray(choice.allowedRoles) ? choice.allowedRoles : ['employee', 'manager', 'admin'];
      if (roles.some((r: any) => !['employee', 'manager', 'admin'].includes(r))) throw new BadRequestException('不支持的角色');
      const data = { connectionId: id, revisionId: discovered.revisionId, remoteName: tool.name,
        description: String(tool.description || tool.name).slice(0, 8000), inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}), schemaDigest: digest({ input: tool.inputSchema, output: tool.outputSchema || null }),
        effect, allowedRoles: roles, status: 'published' };
      // Published contracts are immutable; policy changes require a new connection revision.
      const old = await this.db.mcpToolBinding.findUnique({ where: { revisionId_remoteName: { revisionId: discovered.revisionId, remoteName: tool.name } } });
      if (old) {
        if (old.schemaDigest !== data.schemaDigest || old.effect !== effect || digest(old.allowedRoles) !== digest(roles)) {
          throw new BadRequestException('工具已发布；修改契约或策略前请先保存新连接修订');
        }
        created.push(old);
      } else created.push(await this.db.mcpToolBinding.create({ data }));
    }
    for (const binding of created) await this.publication.publish(binding, actor);
    return { tools: created };
  }

  async tools(actor: McpActor, mode: 'personal' | 'work') {
    const connections = await this.list(actor);
    const rows = await this.db.mcpToolBinding.findMany({ where: { connectionId: { in: connections.filter((c: any) =>
      c.status === 'active' && ((mode === 'work') === (c.scope === 'organization'))).map((c: any) => c.id) }, status: 'published' } });
    return rows.filter((b: any) => {
      const c = connections.find((v: any) => v.id === b.connectionId);
      return c.activeRevisionId === b.revisionId && (mode === 'personal' || b.allowedRoles.includes(actor.role));
    }).map((b: any) => ({ ...b, configured: connections.find((c: any) => c.id === b.connectionId).configured }));
  }

  async toolIndex(actor: McpActor, mode: 'personal' | 'work') {
    return (await this.tools(actor, mode)).map((tool: any) => ({ id: tool.id, connectionId: tool.connectionId,
      remoteName: tool.remoteName, description: tool.description, effect: tool.effect, configured: tool.configured }));
  }

  redact(value: any, token: string) {
    if (!token) return value;
    const walk = (item: any): any => typeof item === 'string' ? item.split(token).join('[REDACTED]') : Array.isArray(item) ? item.map(walk) : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).map(([key, val]) => [key.split(token).join('[REDACTED]'), walk(val)])) : item;
    return walk(value);
  }
}
