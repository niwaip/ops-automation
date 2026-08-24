import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import * as fs from 'fs';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { getPublicHost } from './config/service-endpoints';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Office add-in 会携带大体积 base64 文档与完整参数 JSON，需放宽 body 限制
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useStaticAssets(join(process.cwd(), 'public'));

  // Mount the renders directory so artifact download URLs work.
  const storageRenderDir =
    process.env.STORAGE_RENDER_DIR ||
    join(process.cwd(), '..', '..', '..', 'var', 'outputs', 'document-engine', 'renders');
  const publicRenderDir = join(process.cwd(), 'public', 'renders');

  [publicRenderDir, storageRenderDir].forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      app.use('/renders', express.static(dir));
      app.use('/api/renders', express.static(dir));
    } catch (e) {
      console.warn(`Failed to mount render dir ${dir}:`, e);
    }
  });

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
