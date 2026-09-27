import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import axios from 'axios';
import { parseAndVerifySandboxToken } from '../../common/guards/ai-auth.guard';
import { getControlPlaneApiUrl } from '../../config/service-endpoints';

@Controller('ai/proxy/v1')
export class SandboxSearchProxyController {
  @Post('search/web')
  async search(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: Record<string, unknown>
  ) {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    const userId = token ? parseAndVerifySandboxToken(token) : null;
    if (!userId) {
      throw new HttpException('Invalid or missing sandbox user token', HttpStatus.UNAUTHORIZED);
    }

    const internalSecret =
      process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
    if (!internalSecret) {
      throw new HttpException('Internal search proxy is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    try {
      const response = await axios.post(
        `${getControlPlaneApiUrl()}/internal/search/web`,
        body,
        {
          timeout: 25_000,
          headers: {
            'x-internal-auth': internalSecret,
            'x-user-id': userId,
            'x-user-role': 'employee',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      const status = Number(error?.response?.status) || HttpStatus.BAD_GATEWAY;
      const message = error?.response?.data?.message || error?.message || 'Platform search failed';
      throw new HttpException(message, status);
    }
  }
}
