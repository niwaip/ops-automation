import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, { bodyParser: false });
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Enable validation globally
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );

    // Enable CORS
    const corsOrigin = process.env.CORS_ORIGIN;
    app.enableCors({
      origin: corsOrigin && corsOrigin !== '*' ? corsOrigin.split(',') : true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });

    const port = process.env.PLATFORM_PORT || process.env.AUTH_PORT || 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`[Platform Service] Running on port ${port} (IPv4)`);
  } catch (error) {
    // #region debug-point B:platform-bootstrap-failure
    await (() => {
      const fs = require('fs');
      let debugServerUrl = 'http://127.0.0.1:7777/event';
      let debugSessionId = 'login-500-auth';
      try {
        const envText = fs.readFileSync('.dbg/login-500-auth.env', 'utf8');
        debugServerUrl =
          envText.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugServerUrl;
        debugSessionId =
          envText.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || debugSessionId;
      } catch {}
      return fetch(debugServerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: debugSessionId,
          runId: 'pre-fix',
          hypothesisId: 'B',
          location: 'apps/backend/core/platform/src/main.ts',
          msg: '[DEBUG] platform bootstrap failed before auth login became available',
          data: {
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error),
            stackTop:
              error instanceof Error ? error.stack?.split('\n').slice(0, 6) : [],
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
    })();
    // #endregion
    throw error;
  }
}

bootstrap();
