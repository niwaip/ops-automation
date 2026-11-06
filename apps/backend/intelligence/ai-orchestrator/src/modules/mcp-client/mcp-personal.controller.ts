import { Body, Controller, Get, Post, Query, Param, Req, UnauthorizedException, HttpException } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../config/service-endpoints';

@Controller('ai/proxy/v1/mcp')
export class McpPersonalController {
  private async forward(req: any, method: 'get' | 'post', path: string, data?: any) {
    const userId = req.user?.id;
    const secret = process.env.INTERNAL_API_SHARED_SECRET;
    if (!userId || !secret) throw new UnauthorizedException();
    try {
      const response = await axios.request({ url: `${getAuthServiceUrl()}/mcp-integrations/${path}`, method, data,
        headers: { 'x-internal-auth': secret, 'x-user-id': userId, 'x-user-role': 'employee' }, timeout: 70000,
      });
      return response.data;
    } catch (error: any) {
      // Preserve safe status semantics; never log/forward Axios config, credentials or remote text.
      const upstream = Number(error?.response?.status);
      const status = [400, 401, 403, 404, 409, 422, 429].includes(upstream) ? upstream : 502;
      throw new HttpException({ status: 'error', code: 'MCP_GATEWAY_REJECTED',
        message: 'MCP gateway did not accept or complete this request' }, status);
    }
  }
  @Get('skills') skills(@Req() req: any) { return this.forward(req, 'get', 'skills?mode=personal'); }
  @Get('skills/:id') skill(@Req() req: any, @Param('id') id: string) {
    return this.forward(req, 'get', `skills/${encodeURIComponent(id)}?mode=personal`);
  }
  @Get('tools') tools(@Req() req: any, @Query('skill_id') skillId?: string, @Query('tool_name') toolName?: string) {
    const query = new URLSearchParams({ mode: 'personal', ...(skillId ? { skill_id: skillId } : {}), ...(toolName ? { tool_name: toolName } : {}) });
    return this.forward(req, 'get', `disclosure?${query}`);
  }
  @Post('invoke') invoke(@Req() req: any, @Body() body: any) {
    if (!/^[0-9a-f-]{36}$/i.test(body.bindingId || '')) throw new UnauthorizedException();
    // Mode, actor, target and credential cannot be overridden by the sandbox or model.
    return this.forward(req, 'post', `sandbox/tools/${body.bindingId}/invoke`, {
      mode: 'personal', arguments: body.arguments, requestKey: body.requestKey, contractToken: body.contractToken,
    });
  }
}
