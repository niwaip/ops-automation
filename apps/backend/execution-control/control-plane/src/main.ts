import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';
import { TraceInterceptor } from './common/interceptors/trace.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Enable CORS
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin && corsOrigin !== '*' ? corsOrigin.split(',') : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.useGlobalInterceptors(new TraceInterceptor());

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Control Plane API Gateway')
    .setDescription('Unified API Gateway for Browser Control Plane services')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // API prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT || process.env.CONTROL_PLANE_PORT || 3003;
  await app.listen(port, '0.0.0.0');

  const publicHost = getPublicHost();
  const publicBaseUrl = `http://${publicHost}:${port}`;

  const logger = new Logger('Bootstrap');
  logger.log(`API Gateway running on port ${port}`);
  logger.log(`Swagger docs available at ${publicBaseUrl}/api/docs`);
}

bootstrap();
