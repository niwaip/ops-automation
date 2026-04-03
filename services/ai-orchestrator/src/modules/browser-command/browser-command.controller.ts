import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BrowserCommandService, ParseBrowserCommandRequest, ParseBrowserCommandResponse } from './browser-command.service';

@ApiTags('AI')
@Controller('ai/browser')
export class BrowserCommandController {
  constructor(private readonly browserCommandService: BrowserCommandService) {}

  @Post('parse-command')
  @ApiOperation({ summary: 'Parse natural language to browser commands' })
  @ApiResponse({ status: 200, description: 'Returns parsed browser commands' })
  async parseCommand(@Body() body: ParseBrowserCommandRequest): Promise<ParseBrowserCommandResponse> {
    return this.browserCommandService.parseCommand(body);
  }
}