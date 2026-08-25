import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../auth/auth.middleware';
import { ResultRefService } from './result-ref.service';

@ApiTags('Execution Result References')
@ApiBearerAuth()
@Controller('executions/:executionId/result-refs')
export class ResultRefController {
  constructor(private readonly resultRefs: ResultRefService) {}

  @Get(':refId')
  @ApiOperation({ summary: 'Read an authorized projection from a durable execution result' })
  async project(
    @Param('executionId') executionId: string,
    @Param('refId') refId: string,
    @Query('paths') paths: string | string[],
    @Req() request: AuthenticatedRequest
  ) {
    const requestedPaths = (Array.isArray(paths) ? paths : String(paths || '').split(','))
      .map((path) => path.trim())
      .filter(Boolean);
    return this.resultRefs.project(executionId, refId, requestedPaths, request.user);
  }
}
