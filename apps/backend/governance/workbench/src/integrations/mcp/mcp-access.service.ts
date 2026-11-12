import { ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../../ports';
import { assertId, McpActor } from './mcp.types';

@Injectable()
export class McpAccessService {
  constructor(@Inject(WORKBENCH_PRISMA) readonly db: WorkbenchPrismaPort) {}

  async actor(request: any): Promise<McpActor> {
    const userId = request.user?.id || request.user?.userId;
    if (!userId) throw new UnauthorizedException();
    assertId(userId);
    const user = await this.db.user.findUnique({ where: { id: userId }, include: {
      orgMemberships: { where: { status: 'active' }, include: { roleBindings: { include: { role: true } } } },
    }});
    if (!user?.isActive) throw new UnauthorizedException();
    const orgId = request.user?.activeOrgId || user.activeOrgId || null;
    const membership = user.orgMemberships.find((m: any) => m.orgId === orgId);
    const orgAdmin = Boolean(membership && (user.role === 'admin' || membership.roleBindings.some(
      (b: any) => b.scopeType === 'organization' && ['admin', 'org_admin'].includes(b.role?.name),
    )));
    return { userId, orgId: membership ? orgId : null, role: user.role, orgAdmin };
  }

  async connection(actor: McpActor, id: string, manage = false) {
    assertId(id);
    const row = await this.db.mcpConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('连接不存在');
    if (row.scope === 'personal') {
      if (row.ownerUserId !== actor.userId) throw new ForbiddenException('连接属于其他用户');
    } else if (!actor.orgId || row.orgId !== actor.orgId || (manage && !actor.orgAdmin)) {
      throw new ForbiddenException('无权访问或配置该组织连接');
    }
    return row;
  }

  async binding(actor: McpActor, id: string, mode: 'personal' | 'work') {
    assertId(id);
    const binding = await this.db.mcpToolBinding.findUnique({ where: { id } });
    if (!binding || binding.status !== 'published') throw new NotFoundException('工具尚未发布或已停用');
    const connection = await this.connection(actor, binding.connectionId);
    if (connection.status !== 'active' || connection.activeRevisionId !== binding.revisionId) {
      throw new ForbiddenException('连接或工具版本已失效，请重新选择');
    }
    if ((mode === 'work') !== (connection.scope === 'organization')) throw new ForbiddenException('工具不属于当前模式');
    const roles = Array.isArray(binding.allowedRoles) ? binding.allowedRoles : [];
    if (connection.scope === 'organization' && !roles.includes(actor.role)) throw new ForbiddenException('当前角色未获工具授权');
    return { connection, binding };
  }
}
