import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Raise body size limit to handle large observation/snapshot payloads in error logs
    bodyParser: true,
  });
  // Increase JSON body limit beyond the default 100kb
  app.use(require('express').json({ limit: '10mb' }));
  app.use(require('express').urlencoded({ limit: '10mb', extended: true }));

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

  const port = process.env.PORT || process.env.BROWSER_SEMANTICS_PORT || 3006;
  await app.listen(port);
  const publicHost = getPublicHost();
  console.log(`Browser Semantics Service running on: http://${publicHost}:${port}`);
}

void bootstrap();
