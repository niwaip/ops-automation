import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

const INSECURE_DEFAULTS = new Set([
  'jwt_secret_key_change_in_production',
  'super_secure_jwt_secret_key_for_docker_env_2026',
  'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
  'ops-automation-jwt-secret-key-change-in-production',
  'secret',
  'change_me',
  'default_secret',
]);

@Injectable()
export class JwtSecretValidatorService implements OnModuleInit {
  private readonly logger = new Logger(JwtSecretValidatorService.name);

  onModuleInit(): void {
    const secret = String(process.env.JWT_SECRET || '').trim();
    const isProduction = process.env.NODE_ENV === 'production';

    if (!secret || INSECURE_DEFAULTS.has(secret) || secret.length < 32) {
      const message =
        '⚠️  JWT_SECRET is not configured, is shorter than 32 characters, or is using an insecure default value. ' +
        'Set a strong, unique JWT_SECRET environment variable before deploying to production.';

      if (isProduction) {
        this.logger.error(message);
        throw new Error(
          'FATAL: JWT_SECRET must be set to a secure value (min 32 chars) in production. ' +
            'Refusing to start with the default insecure secret.'
        );
      }

      this.logger.warn(message);
    }
  }
}
