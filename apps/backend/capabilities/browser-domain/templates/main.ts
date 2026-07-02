import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  app.enableCors();

  const port = process.env.PORT || process.env.BROWSER_TEMPLATE_PORT || 3005;
  await app.listen(port);
  const publicHost = getPublicHost();
  console.log(`Browser Template Service running on: http://${publicHost}:${port}`);
}

void bootstrap();
