import type { SkillRegistryPrismaPort } from '../../registry/skill-registry.ports';

export async function authorizeMcpBinding(db: SkillRegistryPrismaPort, capabilityKey: string, userId?: string, orgId?: string) {
  if (!userId || !db.mcpToolBinding) return { authorized: false, reason: 'MCP_IDENTITY_REQUIRED' };
  const bindingId = capabilityKey.slice('platform.mcp.'.length);
  if (!/^[0-9a-f-]{36}$/i.test(bindingId)) return { authorized: false, reason: 'MCP_BINDING_INVALID' };
  const binding = await db.mcpToolBinding.findUnique({ where: { id: bindingId } });
  if (!binding || binding.status !== 'published') return { authorized: false, reason: 'MCP_BINDING_DISABLED' };
  const connection = await db.mcpConnection.findUnique({ where: { id: binding.connectionId } });
  const user = await db.user.findUnique({ where: { id: userId }, include: { orgMemberships: { where: { status: 'active' } } } });
  const effectiveOrg = orgId || user?.activeOrgId;
  const authorized = Boolean(user?.isActive && connection?.scope === 'organization' && connection.status === 'active'
    && connection.orgId === effectiveOrg && connection.activeRevisionId === binding.revisionId
    && user.orgMemberships.some((m: any) => m.orgId === effectiveOrg) && binding.allowedRoles.includes(user.role));
  return { authorized, reason: authorized ? 'MCP_ORGANIZATION_AUTHORIZED' : 'MCP_ORGANIZATION_DENIED' };
}
