import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import { AppModule } from '../app.module';
import { BuiltinSkillProvisioningService, BuiltinSkillRegistryService } from '@ops/skill-registry/builtin';

async function bootstrap() {
  const args = process.argv.slice(2);
  const targetArg = args[0] || 'all';
  const envArg = args[1] || 'production';
  const activate = args[2] === '--activate';
  if (args.length > 3 || (args[2] && !activate)) {
    throw new Error('Usage: builtin-skill-provision.command.ts <capabilityKey|all> [environment] [--activate]');
  }

  console.log(`Starting Built-in Skill Provisioning command...`);
  console.log(`Target: ${targetArg}, Environment: ${envArg}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const provisioningService = app.get(BuiltinSkillProvisioningService);
  const registryService = app.get(BuiltinSkillRegistryService);
  const bundles = provisioningService.resolveTargetBundles(targetArg);
  console.log(`Found ${bundles.length} bundle(s) to provision.`);

  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ bundle: string; error: string }> = [];

  for (let i = 0; i < bundles.length; i++) {
    const bundleDir = bundles[i];
    const bundleName = path.basename(bundleDir);
    console.log(`[${i + 1}/${bundles.length}] Provisioning ${bundleName}...`);

    try {
      const result = await provisioningService.provisionBundle(bundleDir, envArg);
      if (!activate) {
        console.log(
          `  -> Staged ${result.skill.capabilityKey} v${result.version.definitionVersion}`
        );
      } else {
        await registryService.activateVersion(
          result.skill.capabilityKey,
          result.version.definitionVersion,
          envArg
        );
        console.log(
          `  -> Activated ${result.skill.capabilityKey} v${result.version.definitionVersion}`
        );
      }
      successCount++;
    } catch (err: any) {
      console.error(`  -> Failed ${bundleName}: ${err.message}`);
      errors.push({ bundle: bundleName, error: err.message });
      failCount++;
    }
  }

  console.log(
    `\nBuilt-in skill provisioning finished: ${successCount} succeeded, ${failCount} failed.`
  );

  await app.close();

  if (failCount > 0) {
    console.error(`Provisioning completed with ${failCount} failure(s). Exiting with error.`);
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  bootstrap();
}
