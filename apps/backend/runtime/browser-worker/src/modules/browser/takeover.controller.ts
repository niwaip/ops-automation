import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TakeoverOrchestratorService } from './application/takeover-orchestrator.service';
import {
  ResumeAfterTakeoverRequest,
  StartTakeoverRequest,
  StopTakeoverRequest,
} from './domain/takeover.types';

@ApiTags('browser-takeover')
@Controller('browser/takeover')
export class TakeoverController {
  constructor(private readonly takeoverOrchestrator: TakeoverOrchestratorService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start manual takeover recording for a runtime browser session' })
  async start(@Body() body: StartTakeoverRequest) {
    return this.takeoverOrchestrator.startTakeover(body);
  }

  @Post('stop')
  @ApiOperation({ summary: 'Stop manual takeover recording and generate patch steps' })
  async stop(@Body() body: StopTakeoverRequest) {
    return this.takeoverOrchestrator.stopTakeover(body);
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume runtime browser execution after manual takeover' })
  async resume(@Body() body: ResumeAfterTakeoverRequest) {
    return this.takeoverOrchestrator.resumeTakeover(body);
  }

  @Get(':runtimeSessionId')
  @ApiOperation({ summary: 'Get takeover state for a runtime browser session' })
  async getState(@Param('runtimeSessionId') runtimeSessionId: string) {
    return this.takeoverOrchestrator.getTakeoverState(runtimeSessionId);
  }
}
