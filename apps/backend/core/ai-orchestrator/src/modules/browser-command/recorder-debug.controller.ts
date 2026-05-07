import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RecorderDebugService } from './recorder-debug.service';
import type { RecorderDebugChatRequest, RecorderDebugChatResponse } from './recorder-debug.service';

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

  @Post('reset')
  @ApiOperation({ summary: 'Reset recorder debug session' })
  async reset(@Body() body: { sessionId: string }) {
    await this.service.resetSession(body.sessionId);
    return { success: true };
  }
}
