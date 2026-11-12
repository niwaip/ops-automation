import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import axios from 'axios';
import { parseAndVerifySandboxToken } from '../../common/guards/ai-auth.guard';
import { getAuthServiceUrl } from '../../config/service-endpoints';
import { getInternalServiceHeaders } from '../../config/internal-service-auth';

@Controller('ai/proxy/v1/knowledge')
export class SandboxKnowledgeProxyController {
  private async forward(authHeader: string | undefined, operation: 'search' | 'read', body: Record<string, unknown>) {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    const userId = token ? parseAndVerifySandboxToken(token) : null;
    if (!userId) throw new HttpException('Invalid sandbox user token', HttpStatus.UNAUTHORIZED);
    const payload = operation === 'search'
      ? { query: body.query, browse: body.browse === true }
      : { workspaceId: body.workspaceId, documentId: body.documentId, startLine: body.startLine, endLine: body.endLine };
    try {
      const response = await axios.post(`${getAuthServiceUrl()}/workspaces/my/knowledge/${operation}`, payload, {
        timeout: 15000,
        headers: { ...getInternalServiceHeaders(), 'x-user-id': userId, 'x-user-role': 'employee' },
      });
      return response.data;
    } catch (error: any) {
      throw new HttpException(error?.response?.data?.message || 'Personal knowledge unavailable',
        Number(error?.response?.status) || HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('search')
  search(@Headers('authorization') auth: string | undefined, @Body() body: Record<string, unknown>) {
    return this.forward(auth, 'search', body);
  }

  @Post('read')
  read(@Headers('authorization') auth: string | undefined, @Body() body: Record<string, unknown>) {
    return this.forward(auth, 'read', body);
  }
}
