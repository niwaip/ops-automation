import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { getReplayEnginePort, getReplayEnginePublicBaseUrl } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Replay Engine API')
    .setDescription('CDP-driven browser automation replay service')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = getReplayEnginePort();
  await app.listen(port);

  const publicBaseUrl = getReplayEnginePublicBaseUrl();
  console.log(`🚀 Replay Engine service running on port ${port}`);
  console.log(`📚 API documentation available at ${publicBaseUrl}/api`);
}

bootstrap();
