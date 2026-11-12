import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../../ports';
import { McpAccessService } from './mcp-access.service';
import { McpConnectionService } from './mcp-connection.service';
import { McpSummaryGeneratorService } from './mcp-summary-generator.service';
import { McpActor } from './mcp.types';
import { mcpToolsetDigest, validateMcpSummary } from './mcp-summary';

@Injectable()
export class McpSummaryService {
  constructor(@Inject(WORKBENCH_PRISMA) private readonly db: WorkbenchPrismaPort,
    private readonly access: McpAccessService, private readonly connections: McpConnectionService,
    private readonly generator: McpSummaryGeneratorService) {}

  private async context(actor: McpActor, id: string) {
    const connection = await this.access.connection(actor, id, true);
    if (connection.status !== 'active') throw new BadRequestException('请先启用连接');
    const tools = (await this.connections.tools(actor, connection.scope === 'personal' ? 'personal' : 'work'))
      .filter((tool: any) => tool.connectionId === id);
    if (!tools.length) throw new BadRequestException('请先发布本人可见的工具');
    return { connection, tools, revisionId: connection.activeRevisionId, toolsetDigest: mcpToolsetDigest(tools) };
  }

  async generate(actor: McpActor, id: string) {
    const context = await this.context(actor, id);
    const draft = await this.generator.generate(actor, context.connection.name, context.tools);
    const current = await this.context(actor, id);
    if (current.revisionId !== context.revisionId || current.toolsetDigest !== context.toolsetDigest) {
      throw new ConflictException('生成期间工具或权限已变化，请重新生成');
    }
    return { ...draft, revisionId: context.revisionId, toolsetDigest: context.toolsetDigest, toolCount: context.tools.length };
  }

  async save(actor: McpActor, id: string, body: any) {
    const context = await this.context(actor, id);
    if (body?.revisionId !== context.revisionId || body?.toolsetDigest !== context.toolsetDigest) {
      throw new ConflictException('工具或权限已变化，请重新生成后保存');
    }
    const description = body.description === '' ? '' : validateMcpSummary(body.description);
    const capabilitySummary = description ? { version: 1, description, revisionId: context.revisionId,
      toolsetDigest: context.toolsetDigest, updatedAt: new Date().toISOString(), updatedBy: actor.userId } : {};
    const result = await this.db.mcpConnection.updateMany({ where: { id, activeRevisionId: context.revisionId, status: 'active' }, data: { capabilitySummary } });
    if (result.count !== 1) throw new ConflictException('连接已变化，请刷新后重试');
    return { description, source: description ? 'curated' : 'automatic' };
  }

  async clear(actor: McpActor, id: string) {
    const connection = await this.access.connection(actor, id, true);
    const result = await this.db.mcpConnection.updateMany({ where: { id, activeRevisionId: connection.activeRevisionId }, data: { capabilitySummary: {} } });
    if (result.count !== 1) throw new ConflictException('连接已变化，请刷新后重试');
    return { source: 'automatic' };
  }
}
