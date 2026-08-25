import { Body, Controller, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.middleware';
import { AttachModelInvocationsDto, RecordModelInvocationDto } from './experience-learning.dto';
import { ModelInvocationLedgerService } from './model-invocation-ledger.service';

@ApiTags('Model Invocation Ledger')
@ApiBearerAuth()
@Controller()
export class ModelInvocationLedgerController {
  constructor(private readonly ledger: ModelInvocationLedgerService) {}

  @Post('internal/model-invocations')
  @ApiOperation({ summary: 'Atomically persist a prompt snapshot and model usage entry' })
  record(@Body() body: RecordModelInvocationDto, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.ledger.record(userId, body);
  }

  @Post('internal/model-invocations/attach')
  @ApiOperation({ summary: 'Attach trace-correlated pre-execution model calls to an execution' })
  attach(@Body() body: AttachModelInvocationsDto, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.ledger.attachTrace(userId, body.traceId, body.executionId);
  }

  @Get('executions/:executionId/llm-usage')
  @ApiOperation({ summary: 'List attributable model usage for an execution' })
  list(@Param('executionId') executionId: string, @Req() request: AuthenticatedRequest) {
    return this.ledger.listForExecution(executionId, request.user);
  }
}
