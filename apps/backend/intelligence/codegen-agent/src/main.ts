import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const port = process.env.PORT || process.env.CODEGEN_AGENT_PORT || 3012;
  await app.listen(port);

  const logger = new Logger('CodegenAgent');
  logger.log(`Codegen Agent running on port ${port}`);
}

bootstrap();
