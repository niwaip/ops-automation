import { McpContractService } from './mcp-contract.service';
import { McpSkillCatalogService } from './mcp-skill-catalog.service';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { McpAccessService } from './mcp-access.service';
import { McpAuthorizationService } from './mcp-authorization.service';
import { McpConnectionService } from './mcp-connection.service';
import { McpInvocationService } from './mcp-invocation.service';
import { McpSummaryService } from './mcp-summary.service';

@Controller(['mcp-integrations', 'api/mcp-integrations'])
export class McpIntegrationController {
  constructor(private readonly access: McpAccessService, private readonly connections: McpConnectionService,
    private readonly authorization: McpAuthorizationService, private readonly invocations: McpInvocationService, private readonly skills: McpSkillCatalogService, private readonly contracts: McpContractService,
    private readonly summaries: McpSummaryService) {}

  @Get('connections') async list(@Req() req: any) { return this.connections.list(await this.access.actor(req)); }
  @Post('connections') async create(@Req() req: any, @Body() body: any) { return this.connections.save(await this.access.actor(req), body); }
  @Put('connections/:id') async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.connections.save(await this.access.actor(req), body, id);
  }
  @Post('connections/:id/status') async status(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.connections.disable(await this.access.actor(req), id, body.disabled === true);
  }
  @Put('connections/:id/authorization') async bind(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.authorization.bind(await this.access.actor(req), id, body);
  }
  @Delete('connections/:id/authorization') async revoke(@Req() req: any, @Param('id') id: string) {
    return this.authorization.revoke(await this.access.actor(req), id);
  }
  @Post('connections/:id/discover') async discover(@Req() req: any, @Param('id') id: string) {
    return this.connections.discover(await this.access.actor(req), id);
  }
  @Post('connections/:id/publish') async publish(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.connections.publish(await this.access.actor(req), id, body);
  }
  @Post('connections/:id/summary/generate') async generateSummary(@Req() req: any, @Param('id') id: string) {
    return this.summaries.generate(await this.access.actor(req), id);
  }
  @Put('connections/:id/summary') async saveSummary(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.summaries.save(await this.access.actor(req), id, body);
  }
  @Delete('connections/:id/summary') async clearSummary(@Req() req: any, @Param('id') id: string) {
    return this.summaries.clear(await this.access.actor(req), id);
  }
  @Get('skills') async skillList(@Req() req: any, @Query('mode') mode?: string) {
    return this.skills.list(await this.access.actor(req), mode === 'work' ? 'work' : 'personal');
  }
  @Get('skills/:id') async skillDetail(@Req() req: any, @Param('id') id: string, @Query('mode') mode?: string) {
    return this.skills.detail(await this.access.actor(req), mode === 'work' ? 'work' : 'personal', id);
  }
  @Get('skills/:id/tools/:toolName') async previewTool(@Req() req: any, @Param('id') id: string,
    @Param('toolName') toolName: string, @Query('mode') mode?: string) {
    return this.skills.previewTool(await this.access.actor(req), mode === 'work' ? 'work' : 'personal', id, toolName);
  }
  @Get('disclosure') async disclose(@Req() req: any, @Query('mode') mode?: string, @Query('skill_id') skillId?: string, @Query('tool_name') toolName?: string) {
    return this.skills.disclose(await this.access.actor(req), mode === 'work' ? 'work' : 'personal', skillId, toolName);
  }
  @Get('tools') async tools(@Req() req: any, @Query('mode') mode?: string, @Query('view') view?: string) {
    const actor = await this.access.actor(req);
    return view === 'index' ? this.connections.toolIndex(actor, mode === 'work' ? 'work' : 'personal')
      : this.connections.tools(actor, mode === 'work' ? 'work' : 'personal');
  }
  @Post('sandbox/tools/:id/invoke') async sandboxInvoke(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const actor = await this.access.actor(req);
    await this.contracts.verify(actor, id, 'personal', body.contractToken);
    return this.invocations.invoke(actor, id, body.arguments, body.requestKey, 'personal');
  }
  @Post('tools/:id/invoke') async invoke(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.invocations.invoke(await this.access.actor(req), id, body.arguments, body.requestKey, body.mode === 'work' ? 'work' : 'personal');
  }
  @Get('invocations') async pending(@Req() req: any) { return this.invocations.pending(await this.access.actor(req)); }
  @Get('invocations/:id') async result(@Req() req: any, @Param('id') id: string) {
    return this.invocations.status(await this.access.actor(req), id);
  }
  @Post('invocations/:id/confirm') async confirm(@Req() req: any, @Param('id') id: string) {
    return this.invocations.confirm(await this.access.actor(req), id);
  }
}
