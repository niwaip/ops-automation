/**
 * Carbone Engine - Main Entry
 */

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create<any>(AppModule);
  const express = require('express') as {
    json: (options: { limit: string }) => any;
    urlencoded: (options: { extended: boolean; limit: string }) => any;
  };

  // Office add-in 暂存副本会携带 base64 文档内容与完整参数 JSON，需放宽 body 限制
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve static files from public directory
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Swagger API文档
  const config = new DocumentBuilder()
    .setTitle('Carbone Engine API')
    .setDescription('Visual Template Editor & Report Generation Service')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // CORS配置
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT || process.env.CARBONE_ENGINE_PORT || process.env.CARBONE_PORT || 3009;
  await app.listen(port);
  const publicHost = getPublicHost();
  const publicBaseUrl = `http://${publicHost}:${port}`;
  console.log(`Carbone Engine is running on: ${publicBaseUrl}`);
  console.log(`API Documentation: ${publicBaseUrl}/api`);
  console.log(`Studio UI: ${publicBaseUrl}/`);
}

bootstrap();
