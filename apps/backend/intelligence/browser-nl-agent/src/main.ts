import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const port = process.env.PORT || process.env.BROWSER_NL_AGENT_PORT || 3013;
  await app.listen(port);

  const logger = new Logger('BrowserNlAgent');
  logger.log(`Browser NL Agent running on port ${port}`);
}

bootstrap();
