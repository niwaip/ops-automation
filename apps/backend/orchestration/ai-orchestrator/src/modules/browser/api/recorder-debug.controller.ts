import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecorderDebugService } from '../execute/recorder-debug.service';
import type {
  RecorderDebugChatRequest,
  RecorderDebugChatResponse,
  RecorderLoopDraftRequest,
} from '../execute/recorder-debug.service';
import type {
  ReconcileAfterTakeoverRequest,
  ReconcileAfterTakeoverResponse,
} from '../execute/execution-reconcile.service';

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

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get recorder debug session detail' })
  async getSession(@Param('sessionId') sessionId: string) {
    return this.service.getSession(sessionId);
  }
}
