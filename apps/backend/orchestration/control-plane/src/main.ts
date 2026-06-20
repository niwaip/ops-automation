import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

// #region debug-point A-E:bootstrap-runtime
const debugReport = (hypothesisId: string, msg: string, data: Record<string, unknown> = {}) => {
  const fs = require('fs');
  let url = 'http://host.docker.internal:7777/event';
  let sessionId = 'control-plane-reset';
  try {
    const env = fs.readFileSync('.dbg/control-plane-reset.env', 'utf8');
    url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || url;
    sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || sessionId;
  } catch {}
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId: 'pre-fix',
      hypothesisId,
      location: 'src/main.ts',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

// #region debug-point D-E:process-signals
process.on('exit', (code) => {
  debugReport('D', 'process-exit', { code, pid: process.pid });
});
process.on('SIGTERM', () => {
  debugReport('D', 'process-sigterm', { pid: process.pid });
});
process.on('SIGINT', () => {
  debugReport('D', 'process-sigint', { pid: process.pid });
});
process.on('uncaughtException', (error) => {
  debugReport('E', 'uncaught-exception', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    pid: process.pid,
  });
});
process.on('unhandledRejection', (reason) => {
  debugReport('E', 'unhandled-rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : null,
    pid: process.pid,
  });
});
// #endregion

async function bootstrap() {
  debugReport('A', 'bootstrap-enter', {
    port: process.env.PORT || process.env.CONTROL_PLANE_PORT || 3003,
    pid: process.pid,
  });
  try {
    const app = await NestFactory.create(AppModule);
    debugReport('A', 'nest-create-ok');
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Enable CORS
    const corsOrigin = process.env.CORS_ORIGIN;
    app.enableCors({
      origin: corsOrigin && corsOrigin !== '*' ? corsOrigin.split(',') : true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
    debugReport('B', 'cors-configured', { corsOrigin: corsOrigin || null });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    debugReport('B', 'validation-pipe-configured');

    // Swagger documentation
    const config = new DocumentBuilder()
      .setTitle('Control Plane API Gateway')
      .setDescription('Unified API Gateway for Browser Control Plane services')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    debugReport('B', 'swagger-create-start');
    const document = SwaggerModule.createDocument(app, config);
    debugReport('B', 'swagger-create-ok');
    debugReport('B', 'swagger-setup-start');
    SwaggerModule.setup('api/docs', app, document);
    debugReport('B', 'swagger-setup-ok');

    // API prefix
    app.setGlobalPrefix('api');
    debugReport('B', 'prefix-set', { prefix: 'api' });

    const port = process.env.PORT || process.env.CONTROL_PLANE_PORT || 3003;
    debugReport('C', 'listen-start', { port, host: '0.0.0.0' });
    await app.listen(port, '0.0.0.0');
    debugReport('C', 'listen-ok', { port });

    const publicHost = getPublicHost();
    const publicBaseUrl = `http://${publicHost}:${port}`;
    debugReport('C', 'bootstrap-complete', { publicBaseUrl });

    console.log(`[control-plane] API Gateway running on port ${port}`);
    console.log(`[control-plane] Swagger docs available at ${publicBaseUrl}/api/docs`);
  } catch (error) {
    debugReport('E', 'bootstrap-error', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  }
}

bootstrap();
