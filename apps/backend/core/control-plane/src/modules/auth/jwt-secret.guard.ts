import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const INSECURE_DEFAULTS = new Set([
  'jwt_secret_key_change_in_production',
  'super_secure_jwt_secret_key_for_docker_env_2026',
]);

@Injectable()
export class JwtSecretGuard implements OnModuleInit {
  private readonly logger = new Logger(JwtSecretGuard.name);

  onModuleInit(): void {
    const secret = String(process.env.JWT_SECRET || '').trim();
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV === 'true';

    if (!secret || INSECURE_DEFAULTS.has(secret)) {
      const message =
        '⚠️  JWT_SECRET is not configured or is using the insecure default value. ' +
        'Set a strong, unique JWT_SECRET environment variable before deploying to production.';

      if (isProduction) {
        this.logger.error(message);
        throw new Error(
          'FATAL: JWT_SECRET must be set to a secure value in production. ' +
          'Refusing to start with the default insecure secret.',
        );
      }

      this.logger.warn(message);
    }
  }
}
