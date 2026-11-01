import { Body, Controller, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import type { AuthenticatedRequest } from '../../auth/auth.middleware';
import { executeWebSearch } from './search-web.handler';
import { getAuthServiceUrl } from '../../../config/service-endpoints';

/** Internal structured-search entry point. Credentials remain inside the control plane. */
@Controller('internal/search')
export class SearchWebController {
  private readonly logger = new Logger(SearchWebController.name);

  @Post('web')
  async search(@Body() input: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    if (!req.user?.id) throw new UnauthorizedException('Authentication required');

    // 双重保底：如果请求体未显式附带 customApiKeys，自动根据已认证的 req.user.id 尝试加载用户专属凭据
    const existingCustomKeys =
      input.customApiKeys && typeof input.customApiKeys === 'object'
        ? (input.customApiKeys as Record<string, string>)
        : {};

    if (Object.keys(existingCustomKeys).length === 0) {
      try {
        const authUrl = getAuthServiceUrl();
        const secret =
          process.env.INTERNAL_API_SHARED_SECRET ||
          process.env.INTERNAL_API_SECRET ||
          'ops_internal_shared_secret_change_me';
        const res = await axios.get<Record<string, string>>(
          `${authUrl}/internal/credentials/user-env/${encodeURIComponent(req.user.id)}`,
          {
            timeout: 2500,
            headers: { 'x-internal-auth': secret },
          }
        );
        if (res.data && typeof res.data === 'object' && Object.keys(res.data).length > 0) {
          input.customApiKeys = res.data;
        }
      } catch (err: any) {
        this.logger.debug?.(`Failed to pre-fetch user credentials for user [${req.user.id}]: ${err?.message}`);
      }
    }

    return executeWebSearch({ input } as any);
  }
}
