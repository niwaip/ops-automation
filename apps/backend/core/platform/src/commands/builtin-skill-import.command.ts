import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BuiltinSkillProvisioningService } from '../modules/builtin-skill/provisioning/builtin-skill-provisioning.service';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: ts-node builtin-skill-import.command.ts <bundleDir> [environment]');
    process.exit(1);
  }

  const bundleDir = args[0];
  const env = args[1] || 'full';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const provisioningService = app.get(BuiltinSkillProvisioningService);

  const result = await provisioningService.provisionBundle(bundleDir, env);
  console.log('Successfully imported built-in skill bundle:', JSON.stringify(result, null, 2));

  await app.close();
}

bootstrap().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
