import {
  Controller,
  All,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedRequest } from '../auth/auth.middleware';

@ApiTags('Proxy')
@ApiBearerAuth()
@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly auditService: AuditService,
  ) {}

  // Platform Service Routes
  @All('platform/*path')
  @ApiOperation({ summary: 'Proxy to Platform service' })
  @ApiResponse({ status: 200, description: 'Successful response from Platform service' })
  async proxyPlatform(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'platform', path, body, query);
  }

  // Auth Service Routes (Legacy)
  @All('auth/*path')
  @ApiOperation({ summary: 'Proxy to Auth service (Legacy)' })
  @ApiResponse({ status: 200, description: 'Successful response from Auth service' })
  async proxyAuth(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'platform', path, body, query);
  }

  // Template Service Routes
  @All('templates/*path')
  @ApiOperation({ summary: 'Proxy to Template service' })
  @ApiResponse({ status: 200, description: 'Successful response from Template service' })
  async proxyTemplate(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'template', path, body, query);
  }

  // Session Service Routes
  @All('sessions/*path')
  @ApiOperation({ summary: 'Proxy to Session Broker service' })
  @ApiResponse({ status: 200, description: 'Successful response from Session service' })
  async proxySession(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'session', path, body, query);
  }

  // AI Orchestrator Service Routes
  @All('ai/*path')
  @ApiOperation({ summary: 'Proxy to AI Orchestrator service' })
  @ApiResponse({ status: 200, description: 'Successful response from AI service' })
  async proxyAI(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'ai', path, body, query);
  }

  // Browser Worker Service Routes
  @All('workers/*path')
  @ApiOperation({ summary: 'Proxy to Browser Worker service' })
  @ApiResponse({ status: 200, description: 'Successful response from Worker service' })
  async proxyWorker(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'worker', path, body, query);
  }

  // Replay Engine Service Routes
  @All('replay/*path')
  @ApiOperation({ summary: 'Proxy to Replay Engine service' })
  @ApiResponse({ status: 200, description: 'Successful response from Replay service' })
  async proxyReplay(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('path') path: string,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'replay', path, body, query);
  }

  // Root route handlers for services
  @All('auth')
  async proxyAuthRoot(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'auth', '', body, query);
  }

  @All('templates')
  async proxyTemplateRoot(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'template', '', body, query);
  }

  @All('sessions')
  async proxySessionRoot(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'session', '', body, query);
  }

  @All('ai')
  async proxyAIRoot(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'ai', '', body, query);
  }

  @All('workers')
  async proxyWorkerRoot(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'worker', '', body, query);
  }

  @All('replay')
  async proxyReplayRoot(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Body() body: unknown,
    @Query() query: Record<string, string>,
  ) {
    return this.proxyToService(req, res, 'replay', '', body, query);
  }

  // Health check endpoint
  @All('health')
  @ApiOperation({ summary: 'Health check for all services' })
  async healthCheck(@Res() res: Response) {
    const healthStatus: Record<string, { status: string; url: string }> = {};

    for (const serviceName of this.proxyService.getServiceNames()) {
      try {
        const reachable = await this.proxyService.checkServiceHealth(serviceName);
        healthStatus[serviceName] = {
          status: reachable ? 'healthy' : 'unhealthy',
          url: this.proxyService.getServiceUrl(serviceName),
        };
      } catch (error) {
        healthStatus[serviceName] = {
          status: 'unhealthy',
          url: this.proxyService.getServiceUrl(serviceName),
        };
      }
    }

    res.status(HttpStatus.OK).json({
      gateway: 'healthy',
      services: healthStatus,
    });
  }

  // Private helper method for proxying
  private async proxyToService(
    req: AuthenticatedRequest,
    res: Response,
    serviceName: string,
    path: string,
    body: unknown,
    query: Record<string, string>,
  ) {
    const startTime = Date.now();
    const method = req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    const fullPath = path ? `/${path}` : '';

    // Build query string
    const queryString = Object.keys(query).length > 0
      ? '?' + Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')
      : '';

    const targetPath = fullPath + queryString;

    // Forward authorization header if present
    const headers: Record<string, string> = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    if (req.user) {
      headers['X-User-Id'] = req.user.id;
      headers['X-User-Role'] = req.user.role;
    }

    try {
      const result = await this.proxyService.proxyRequest(
        serviceName,
        method,
        targetPath,
        body,
        headers,
      );

      // Log successful API call
      const durationMs = Date.now() - startTime;
      await this.auditService.logApiCall(
        req.user?.id,
        method,
        `/${serviceName}${targetPath}`,
        result.status,
        req.ip || 'unknown',
        durationMs,
        method !== 'GET' ? body as Record<string, unknown> : undefined,
      );

      res.status(result.status).json(result.data);
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Log failed API call
      await this.auditService.logApiCall(
        req.user?.id,
        method,
        `/${serviceName}${targetPath}`,
        (error as HttpException).getStatus() || HttpStatus.INTERNAL_SERVER_ERROR,
        req.ip || 'unknown',
        durationMs,
        method !== 'GET' ? body as Record<string, unknown> : undefined,
        { error: (error as HttpException).message },
      );

      this.logger.error(
        `Proxy error: ${serviceName} ${method} ${targetPath} - ${(error as Error).message}`,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException('Internal gateway error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
