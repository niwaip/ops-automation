import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
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
    const logger = new Logger('Bootstrap');
    logger.log(`Platform Service running on port ${port} (IPv4)`);
  } catch (error) {
    const logger = new Logger('Bootstrap');
    logger.error('Platform Service failed to start', error);
    throw error;
  }
}

bootstrap();
