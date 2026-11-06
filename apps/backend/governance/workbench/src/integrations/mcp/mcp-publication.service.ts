import { Inject, Injectable } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../../ports';
import { digest, McpActor } from './mcp.types';

/** Reuse the existing versioned manifest/handler runtime. Organization scope is enforced at discover and invoke. */
@Injectable()
export class McpPublicationService {
  constructor(@Inject(WORKBENCH_PRISMA) private readonly db: WorkbenchPrismaPort) {}
  async publish(binding: any, actor: McpActor) {
    const connection = await this.db.mcpConnection.findUnique({ where: { id: binding.connectionId } });
    if (connection.scope !== 'organization') return;
    const capabilityKey = `platform.mcp.${binding.id}`;
    const manifest = {
      apiVersion: 'ops/v1', kind: 'BuiltinSkill', metadata: { name: capabilityKey, version: '1.0.0' },
      spec: {
        planner: { runtimeType: 'workflow', triggerKeywords: [connection.name, binding.remoteName], supportsArtifact: false },
        runtime: { handlerKey: 'integration.mcp.invoke', adapterRoute: 'workflow:builtin', bindingId: binding.id },
        contracts: {
          input: { schema: binding.inputSchema },
          output: { schema: { type: 'object', properties: { invocationId: { type: 'string' }, status: { type: 'string' }, result: {} }, required: ['invocationId', 'status'] } },
        },
        risk: { level: binding.effect === 'read' ? 'L0' : 'L2', requiresApproval: binding.effect !== 'read' },
      },
    };
    await this.db.$transaction!(async (tx: any) => {
      const skill = await tx.builtinSkill.upsert({ where: { capabilityKey }, create: {
        capabilityKey, displayName: `${connection.name} / ${binding.remoteName}`.slice(0, 255),
        description: binding.description.slice(0, 1000), owner: `organization:${connection.orgId}`,
        category: 'integration', isEnabled: true, lifecycle: 'experimental', defaultAccess: 'authenticated',
      }, update: {} });
      const version = await tx.builtinSkillVersion.upsert({ where: { builtinSkillId_definitionVersion: { builtinSkillId: skill.id, definitionVersion: '1.0.0' } },
        create: { builtinSkillId: skill.id, definitionVersion: '1.0.0', apiVersion: 'ops/v1', definitionDigest: `sha256:${digest(manifest)}`,
          manifestJson: manifest, workflowJson: { steps: [{ type: 'builtin', handlerKey: 'integration.mcp.invoke' }] }, runtimeBuild: 'mcp-client-v1' }, update: {} });
      await tx.builtinSkill.update({ where: { id: skill.id }, data: { activeVersionId: version.id } });
      await tx.builtinSkillDeployment.upsert({ where: { builtinSkillVersionId_environment: { builtinSkillVersionId: version.id, environment: 'default' } },
        create: { builtinSkillVersionId: version.id, environment: 'default', status: 'deployed', runtimeBuild: 'mcp-client-v1', smokeTestStatus: 'catalog_verified' }, update: {} });
      await tx.builtinSkillAuditEvent.create({ data: { builtinSkillId: skill.id, action: 'mcp_tool_published', operator: actor.userId, versionId: version.id,
        payload: { bindingId: binding.id, orgId: connection.orgId, verification: 'authenticated_tool_discovery_only' } } });
    });
  }
}
