import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BrowserService } from './browser.service';
import {
  BrowserExecutionBackendDto,
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../dto/worker.dto';
import { MCPCommand } from './adapters/browser-execution.adapter';

@ApiTags('browser')
@Controller('browser')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Post('init')
  @ApiOperation({ summary: 'Initialize browser session for AI control' })
  @ApiResponse({ status: 200, description: 'Browser initialized successfully' })
  @ApiResponse({ status: 500, description: 'Failed to initialize browser' })
  async initBrowser(
    @Body()
    body: {
      backend?: BrowserExecutionBackendDto;
      runtimeSessionId?: string;
      initialUrl?: string;
    } = {},
  ): Promise<{ success: boolean; message: string; endpoints?: any }> {
    return this.browserService.initBrowser(body);
  }

  @Post('execute')
  @ApiOperation({ summary: 'Execute MCP commands on the browser' })
  @ApiResponse({ status: 200, description: 'Commands executed successfully' })
  @ApiResponse({ status: 400, description: 'Browser not initialized' })
  async executeCommands(
    @Body()
    body: {
      commands: MCPCommand[];
      backend?: BrowserExecutionBackendDto;
      runtimeSessionId?: string;
    },
  ): Promise<{ success: boolean; results: any[]; message?: string }> {
    return this.browserService.executeCommands(body.commands, body);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset browser session' })
  @ApiResponse({ status: 200, description: 'Browser reset successfully' })
  async resetBrowser(
    @Body()
    body: {
      backend?: BrowserExecutionBackendDto;
      runtimeSessionId?: string;
    } = {},
  ): Promise<{ success: boolean }> {
    await this.browserService.resetBrowser(body);
    return { success: true };
  }

  @Post('execute-step')
  @ApiOperation({ summary: 'Execute a standardized step' })
  @ApiResponse({ status: 200, type: ExecuteStepResultDto, description: 'Step execution result' })
  @ApiResponse({ status: 400, description: 'Browser not initialized' })
  async executeStep(@Body() dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    return this.browserService.executeStep(dto);
  }

  @Post('freeze')
  @ApiOperation({ summary: 'Freeze browser execution for human takeover' })
  @ApiResponse({ status: 200, type: BrowserControlStateDto, description: 'Browser session frozen' })
  async freeze(@Body() dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.browserService.freeze(dto);
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume browser execution after human takeover' })
  @ApiResponse({ status: 200, type: BrowserControlStateDto, description: 'Browser session resumed' })
  async resume(@Body() dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    return this.browserService.resume(dto);
  }
}
