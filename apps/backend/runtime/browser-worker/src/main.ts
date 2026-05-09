import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation pipe globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Browser Worker API')
    .setDescription('Browser Worker Service - Manages browser worker containers with noVNC and CDP support')
    .setVersion('1.0.0')
    .addTag('workers', 'Worker lifecycle management')
    .addTag('health', 'Health check endpoints')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || process.env.BROWSER_WORKER_PORT || 3004;
  await app.listen(port);

  const publicHost = getPublicHost();
  const publicBaseUrl = `http://${publicHost}:${port}`;
  console.log(`Browser Worker Service running on port ${port}`);
  console.log(`Swagger documentation available at ${publicBaseUrl}/api/docs`);
}

bootstrap();
