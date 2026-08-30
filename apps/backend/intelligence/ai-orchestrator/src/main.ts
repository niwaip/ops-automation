import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { AppModule } from './app.module';
import { TraceInterceptor } from './common/trace.interceptor';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.useGlobalInterceptors(new TraceInterceptor());

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('AI Orchestrator API')
    .setDescription(
      'AI Orchestrator Service - OpenAI compatible API client, model registration, agent instance creation, parameter recognition, and failure decision'
    )
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || process.env.AI_ORCHESTRATOR_PORT || 3007;
  await app.listen(port);
  const publicHost = getPublicHost();
  console.log(`AI Orchestrator Service running on: http://${publicHost}:${port}`);
}

bootstrap();
