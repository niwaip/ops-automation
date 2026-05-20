import { Controller, Post, Body, Get, Param, BadRequestException, NotFoundException, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Response } from 'express';
import { BrowserService } from './browser.service';
import {
  AssertBrowserStateDto,
  BrowserPageAssertionResultDto,
  BrowserExecutionBackendDto,
  BrowserControlStateDto,
  BrowserPageStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  InspectBrowserStateDto,
  ResumeBrowserSessionDto,
} from '../../dto/worker.dto';
import { MCPCommand } from './adapters/browser-execution.adapter';
import { BrowserActionStep } from './domain/browser-step.types';
import { ExportOptions } from './application/browser-script-export.service';

@ApiTags('browser')
@Controller('browser')
export class BrowserController {
  private readonly artifactDir = path.join(process.cwd(), 'temp', 'playwright-cli-artifacts');

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
      sessionPreferences?: {
        mode?: 'interactive' | 'agent';
        enableCodegen?: boolean;
        headless?: boolean;
      };
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
      includeArtifacts?: boolean;
      includeSteps?: boolean;
    },
  ): Promise<{ success: boolean; results: any[]; message?: string; steps?: BrowserActionStep[] }> {
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

  @Post('inspect-state')
  @ApiOperation({ summary: 'Inspect current browser page state' })
  @ApiResponse({ status: 200, type: BrowserPageStateDto, description: 'Current browser page state' })
  async inspectState(@Body() dto: InspectBrowserStateDto): Promise<BrowserPageStateDto> {
    return this.browserService.inspectState(dto);
  }

  @Post('assert-state')
  @ApiOperation({ summary: 'Assert browser page state and content conditions' })
  @ApiResponse({ status: 200, type: BrowserPageAssertionResultDto, description: 'Browser assertion result' })
  async assertState(@Body() dto: AssertBrowserStateDto): Promise<BrowserPageAssertionResultDto> {
    return this.browserService.assertState(dto);
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

  @Post('export-script')
  @ApiOperation({ summary: 'Export steps to Playwright script' })
  @ApiResponse({ status: 200, description: 'Script exported successfully' })
  async exportScript(
    @Body()
    body: {
      steps: BrowserActionStep[];
      options?: ExportOptions;
    },
  ): Promise<{ script: string }> {
    const script = this.browserService.exportScript(body.steps, body.options);
    return { script };
  }

  @Post('generate-schema')
  @ApiOperation({ summary: 'Generate params schema from steps' })
  @ApiResponse({ status: 200, description: 'Schema generated successfully' })
  async generateSchema(
    @Body()
    body: {
      steps: BrowserActionStep[];
    },
  ): Promise<{ schema: Record<string, any> }> {
    const schema = this.browserService.generateParamsSchema(body.steps);
    return { schema };
  }

  @Get('artifacts/:filename')
  @ApiOperation({ summary: 'Serve browser execution artifacts' })
  @ApiResponse({ status: 200, description: 'Artifact file content' })
  @ApiResponse({ status: 404, description: 'Artifact not found' })
  async getArtifact(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    const normalizedFilename = path.basename(filename || '').trim();
    if (!normalizedFilename || normalizedFilename !== filename) {
      throw new BadRequestException('Invalid artifact filename');
    }

    const artifactPath = path.join(this.artifactDir, normalizedFilename);
    try {
      await fs.access(artifactPath);
    } catch {
      throw new NotFoundException('Artifact not found');
    }

    res.sendFile(artifactPath);
  }
}
