import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BrowserService, MCPCommand } from './browser.service';
import { ExecuteStepDto, ExecuteStepResultDto } from '../../dto/worker.dto';

@ApiTags('browser')
@Controller('browser')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Post('init')
  @ApiOperation({ summary: 'Initialize browser session for AI control' })
  @ApiResponse({ status: 200, description: 'Browser initialized successfully' })
  @ApiResponse({ status: 500, description: 'Failed to initialize browser' })
  async initBrowser(): Promise<{ success: boolean; message: string }> {
    return this.browserService.initBrowser();
  }

  @Post('execute')
  @ApiOperation({ summary: 'Execute MCP commands on the browser' })
  @ApiResponse({ status: 200, description: 'Commands executed successfully' })
  @ApiResponse({ status: 400, description: 'Browser not initialized' })
  async executeCommands(@Body() body: { commands: MCPCommand[] }): Promise<{ success: boolean; results: any[]; message?: string }> {
    return this.browserService.executeCommands(body.commands);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset browser session' })
  @ApiResponse({ status: 200, description: 'Browser reset successfully' })
  async resetBrowser(): Promise<{ success: boolean }> {
    await this.browserService.resetBrowser();
    return { success: true };
  }

  @Post('execute-step')
  @ApiOperation({ summary: 'Execute a standardized step' })
  @ApiResponse({ status: 200, type: ExecuteStepResultDto, description: 'Step execution result' })
  @ApiResponse({ status: 400, description: 'Browser not initialized' })
  async executeStep(@Body() dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    return this.browserService.executeStep(dto);
  }
}