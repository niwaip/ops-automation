import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create<any>(AppModule);
  const express = require('express') as {
    json: (options: { limit: string }) => any;
    urlencoded: (options: { extended: boolean; limit: string }) => any;
  };

  // Office add-in 会携带大体积 base64 文档与完整参数 JSON，需放宽 body 限制
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.useStaticAssets(join(process.cwd(), 'public'));

  const config = new DocumentBuilder()
    .setTitle('Document Domain API')
    .setDescription('Document template, render, and runtime facade service')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port =
    process.env.PORT || process.env.CARBONE_ENGINE_PORT || process.env.CARBONE_PORT || 3009;
  await app.listen(port);
  const publicHost = getPublicHost();
  const publicBaseUrl = `http://${publicHost}:${port}`;
  console.log(`Document Domain is running on: ${publicBaseUrl}`);
  console.log(`API Documentation: ${publicBaseUrl}/api`);
  console.log(`Studio UI: ${publicBaseUrl}/`);
}

bootstrap();
