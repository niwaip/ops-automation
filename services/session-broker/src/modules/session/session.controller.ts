import { Controller, Post, Delete, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SessionService } from './session.service';
import {
  CreateSessionRequestDto,
  CreateSessionResponseDto,
  StartSessionRequestDto,
  TakeoverSessionRequestDto,
  ContinueSessionRequestDto,
  DeleteSessionResponseDto,
  SessionDto,
} from '../../dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new browser session' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Session created successfully', type: CreateSessionResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'User already has an active session (lock conflict)' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'No available workers' })
  async createSession(@Body() request: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
    return this.sessionService.createSession(request);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start session execution' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session started', type: SessionDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Session not in IDLE state' })
  async startSession(
    @Param('id') sessionId: string,
    @Body() request: StartSessionRequestDto,
  ): Promise<SessionDto> {
    return this.sessionService.startSession(sessionId, request);
  }

  @Post(':id/takeover')
  @ApiOperation({ summary: 'Takeover session (human control)' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session takeover successful', type: SessionDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Session not in RUNNING state' })
  async takeoverSession(
    @Param('id') sessionId: string,
    @Body() request: TakeoverSessionRequestDto,
  ): Promise<SessionDto> {
    return this.sessionService.takeoverSession(sessionId, request);
  }

  @Post(':id/continue')
  @ApiOperation({ summary: 'Continue session (agent control)' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session continue successful', type: SessionDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Session not in HUMAN_CONTROL state' })
  async continueSession(
    @Param('id') sessionId: string,
    @Body() request: ContinueSessionRequestDto,
  ): Promise<SessionDto> {
    return this.sessionService.continueSession(sessionId, request);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete/close session' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session deleted', type: DeleteSessionResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  async deleteSession(@Param('id') sessionId: string): Promise<DeleteSessionResponseDto> {
    return this.sessionService.deleteSession(sessionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session details' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session details', type: SessionDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  async getSession(@Param('id') sessionId: string): Promise<SessionDto> {
    return this.sessionService.getSession(sessionId);
  }

  @Get(':id/steps')
  @ApiOperation({ summary: 'Get session step results' })
  @ApiParam({ name: 'id', description: 'Session ID', type: 'string' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Step results' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  async getStepResults(@Param('id') sessionId: string): Promise<any[]> {
    return this.sessionService.getStepResults(sessionId);
  }
}