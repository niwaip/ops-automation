import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.middleware';
import { executeWebSearch } from './search-web.handler';

/** Internal structured-search entry point. Credentials remain inside the control plane. */
@Controller('internal/search')
export class SearchWebController {
  @Post('web')
  async search(@Body() input: Record<string, unknown>, @Req() req: AuthenticatedRequest) {
    if (!req.user?.id) throw new UnauthorizedException('Authentication required');
    return executeWebSearch({ input } as any);
  }
}
