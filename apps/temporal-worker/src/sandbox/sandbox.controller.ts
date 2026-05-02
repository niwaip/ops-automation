import { Controller, Post, Get, Body, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SandboxService } from './sandbox.service';

@ApiTags('Sandbox')
@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('execute-code')
  @ApiOperation({ summary: 'Execute Python code in sandbox' })
  async executeCode(@Body() data: {
    code: string;
    fn: string;
    taskQueue: string;
    input?: Record<string, any>;
  }) {
    return this.sandboxService.executeCode(data);
  }

  @Post('execute-code/stream')
  @ApiOperation({ summary: 'Execute Python code with SSE streaming' })
  async executeCodeStream(@Body() data: {
    code: string;
    fn: string;
    taskQueue: string;
    input?: Record<string, any>;
  }, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      await this.sandboxService.executeCodeStreaming(data, (log) => {
        res.write(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
      });

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }

  @Get('cache/:fn')
  @ApiOperation({ summary: 'Get cached code for a function' })
  async getCachedCode(@Param('fn') fn: string) {
    const code = this.sandboxService.getCachedCode(fn);
    return { fn, code, cached: !!code };
  }

  @Get('cache')
  @ApiOperation({ summary: 'List all cached functions' })
  async listCachedFunctions() {
    const functions = this.sandboxService.listCachedFunctions();
    return { functions, count: functions.length };
  }
}