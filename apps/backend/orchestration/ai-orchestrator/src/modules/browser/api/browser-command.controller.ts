import { Controller, Post, Body, Get, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BrowserCommandService } from '../intent';
import type {
  ParseBrowserCommandRequest,
  ParseBrowserCommandResponse,
  WebsiteConfig,
} from '../intent';

@ApiTags('AI')
@Controller('ai/browser')
export class BrowserCommandController {
  constructor(private readonly browserCommandService: BrowserCommandService) {}

  @Post('parse-command')
  @ApiOperation({ summary: 'Parse natural language to browser commands' })
  @ApiResponse({ status: 200, description: 'Returns parsed browser commands' })
  async parseCommand(
    @Body() body: ParseBrowserCommandRequest
  ): Promise<ParseBrowserCommandResponse> {
    return this.browserCommandService.parseCommand(body);
  }

  @Get('websites')
  @ApiOperation({ summary: 'List custom website configurations' })
  @ApiResponse({ status: 200, description: 'Returns list of custom websites' })
  listWebsites(): WebsiteConfig[] {
    return this.browserCommandService.listWebsites();
  }

  @Post('websites')
  @ApiOperation({ summary: 'Add a custom website configuration' })
  @ApiResponse({ status: 201, description: 'Website configuration added' })
  addWebsite(@Body() config: WebsiteConfig): { success: boolean; message: string } {
    this.browserCommandService.addWebsite(config);
    return { success: true, message: `Website "${config.name}" added` };
  }

  @Delete('websites/:name')
  @ApiOperation({ summary: 'Remove a custom website configuration' })
  @ApiResponse({ status: 200, description: 'Website configuration removed' })
  removeWebsite(@Param('name') name: string): { success: boolean; message: string } {
    const removed = this.browserCommandService.removeWebsite(name);
    return {
      success: removed,
      message: removed ? `Website "${name}" removed` : `Website "${name}" not found`,
    };
  }

  @Get('url-patterns')
  @ApiOperation({ summary: 'Get all URL patterns (default + custom)' })
  @ApiResponse({ status: 200, description: 'Returns URL patterns' })
  getUrlPatterns(): Record<string, string> {
    return this.browserCommandService.getUrlPatterns();
  }
}
