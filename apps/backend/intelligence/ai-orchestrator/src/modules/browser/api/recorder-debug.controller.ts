import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecorderDebugService } from '../execute/recorder';
import type {
  RecorderDebugChatRequest,
  RecorderDebugChatResponse,
  RecorderLoopDraftRequest,
} from '../execute';
import type {
  ReconcileAfterTakeoverRequest,
  ReconcileAfterTakeoverResponse,
} from '../execute';

@ApiTags('AI-Recorder-Debug')
@Controller('ai/recorder-debug')
export class RecorderDebugController {
  constructor(private readonly service: RecorderDebugService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Recorder debug chat' })
  async chat(@Body() body: RecorderDebugChatRequest): Promise<RecorderDebugChatResponse> {
    return this.service.chat(body);
  }

  @Post('export')
  @ApiOperation({ summary: 'Export CLI script and internal skill draft' })
  async export(@Body() body: Omit<RecorderDebugChatRequest, 'message'> & { userGoal?: string }) {
    return this.service.exportArtifacts(body);
  }

  @Post('loop-draft')
  @ApiOperation({ summary: 'Create or update recorder loop draft' })
  async upsertLoopDraft(@Body() body: RecorderLoopDraftRequest) {
    return this.service.upsertLoopDraft(body);
  }

  @Post('loop-draft/reset')
  @ApiOperation({ summary: 'Clear recorder loop draft' })
  async clearLoopDraft(@Body() body: { sessionId: string }) {
    await this.service.clearLoopDraft(body.sessionId);
    return { success: true };
  }

  @Post('reconcile')
  @ApiOperation({ summary: 'Reconcile browser execution after manual takeover' })
  async reconcile(
    @Body() body: ReconcileAfterTakeoverRequest
  ): Promise<ReconcileAfterTakeoverResponse> {
    return this.service.reconcileAfterTakeover(body);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset recorder debug session' })
  async reset(@Body() body: { sessionId: string }) {
    await this.service.resetSession(body.sessionId);
    return { success: true };
  }

  // v4.1 P0 (doc §5.1.6-7): recorder rollback endpoints.
  // First period only exposes `rollbackLastStep` — no `targetExecutionIndex` param
  // on /rollback to prevent callers from skipping intermediate persist-level steps.
  // /rollback/confirm accepts the binding fields returned by a prior requires_confirmation
  // response and re-validates them server-side before forcing the rollback through.

  @Post('rollback')
  @ApiOperation({ summary: 'Rollback the last recorder execution step' })
  async rollback(@Body() body: { sessionId: string }) {
    if (!body?.sessionId || typeof body.sessionId !== 'string') {
      return {
        status: 'failed',
        reason: 'sessionId-required',
        targetExecutionIndex: 0,
      };
    }
    return this.service.rollbackLastStep(body.sessionId);
  }

  @Post('rollback/confirm')
  @ApiOperation({ summary: 'Confirm rollback after acknowledging side-effects' })
  async rollbackConfirm(
    @Body()
    body: {
      sessionId: string;
      targetExecutionIndex: number;
      sessionRevision: number;
      sideEffectDigest: string;
      confirmedSideEffects?: string[];
    }
  ) {
    if (!body?.sessionId || typeof body.sessionId !== 'string') {
      return {
        status: 'failed',
        reason: 'sessionId-required',
        targetExecutionIndex: body?.targetExecutionIndex ?? 0,
      };
    }
    if (
      typeof body.targetExecutionIndex !== 'number' ||
      typeof body.sessionRevision !== 'number' ||
      typeof body.sideEffectDigest !== 'string'
    ) {
      return {
        status: 'failed',
        reason: 'invalid-confirmation-binding',
        targetExecutionIndex: body?.targetExecutionIndex ?? 0,
      };
    }
    return this.service.rollbackLastStep(body.sessionId, {
      targetExecutionIndex: body.targetExecutionIndex,
      sessionRevision: body.sessionRevision,
      sideEffectDigest: body.sideEffectDigest,
      ...(body.confirmedSideEffects ? { confirmedSideEffects: body.confirmedSideEffects } : {}),
    });
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get recorder debug session detail' })
  async getSession(@Param('sessionId') sessionId: string) {
    return this.service.getSession(sessionId);
  }
}
