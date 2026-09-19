import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { AppModule } from './app.module';
import { BuiltinSkillProvisioningService } from '@ops/skill-registry/builtin';

if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this) <= Number.MAX_SAFE_INTEGER ? Number(this) : this.toString();
  };
}

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, { bodyParser: false });
    const defaultLimit = process.env.DEFAULT_PAYLOAD_LIMIT || '2mb';
    const backupLimit = process.env.BACKUP_PAYLOAD_LIMIT || '200mb';

    const defaultJsonParser = express.json({ limit: defaultLimit });
    const backupJsonParser = express.json({ limit: backupLimit });
    const defaultUrlencodedParser = express.urlencoded({ extended: true, limit: defaultLimit });
    const backupUrlencodedParser = express.urlencoded({ extended: true, limit: backupLimit });

    app.use((req: any, res: any, next: any) => {
      const url = req.originalUrl || req.url || '';
      if (url.includes('/system/backup')) {
        backupJsonParser(req, res, (err) => {
          if (err) return next(err);
          backupUrlencodedParser(req, res, next);
        });
      } else {
        defaultJsonParser(req, res, (err) => {
          if (err) return next(err);
          defaultUrlencodedParser(req, res, next);
        });
      }
    });

    // Enable validation globally
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );

    // Enable CORS
    const corsOrigin = process.env.CORS_ORIGIN;
    app.enableCors({
      origin: corsOrigin && corsOrigin !== '*' ? corsOrigin.split(',') : true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });

    const port = process.env.PLATFORM_PORT || process.env.AUTH_PORT || 3001;
    await app.listen(port, '0.0.0.0');
    const logger = new Logger('Bootstrap');
    logger.log(`Platform Service running on port ${port} (IPv4)`);

    // Background self-activation of untested builtin skills once service is listening
    if (process.env.AUTO_ACTIVATE_BUILTIN_SKILLS !== 'false') {
      setTimeout(async () => {
        try {
          const provisioningService = app.get(BuiltinSkillProvisioningService, { strict: false });
          if (provisioningService) {
            logger.log('Starting background verification and activation of built-in skills...');
            const result = await provisioningService.verifyAndActivateAll();
            logger.log(
              `Built-in skills auto-activation completed: ${result.succeeded.length} activated, ${result.failed.length} failed`
            );
          }
        } catch (err: any) {
          logger.warn(`Background built-in skills auto-activation encountered error: ${err.message}`);
        }
      }, 3000);
    }
  } catch (error) {
    const logger = new Logger('Bootstrap');
    logger.error('Platform Service failed to start', error);
    throw error;
  }
}

bootstrap();
