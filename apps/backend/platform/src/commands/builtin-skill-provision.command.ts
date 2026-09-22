import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from '../app.module';
import { BuiltinSkillProvisioningService, BuiltinSkillRegistryService } from '@ops/skill-registry/builtin';

function findBundlesInDir(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .filter((bundleDir) => fs.existsSync(path.join(bundleDir, 'manifest.yaml')))
    .sort();
}

function resolveTargetBundles(targetArg?: string): string[] {
  // 1. If a specific bundle path with manifest.yaml was supplied, use it
  if (targetArg && targetArg !== 'all') {
    const resolved = path.isAbsolute(targetArg) ? targetArg : path.resolve(process.cwd(), targetArg);
    if (fs.existsSync(path.join(resolved, 'manifest.yaml'))) {
      return [resolved];
    }
    const subBundles = findBundlesInDir(resolved);
    if (subBundles.length > 0) {
      return subBundles;
    }
  }

  // 2. Search common locations for builtin-skills repository root
  const searchRoots = [
    path.resolve(process.cwd(), 'builtin-skills'),
    path.resolve(process.cwd(), '../../builtin-skills'),
    path.resolve(process.cwd(), '../../../builtin-skills'),
    path.resolve(__dirname, '../../../../../builtin-skills'),
    path.resolve(__dirname, '../../../../builtin-skills'),
    '/workspace/builtin-skills',
  ];

  for (const root of searchRoots) {
    const bundles = findBundlesInDir(root);
    if (bundles.length > 0) {
      return bundles;
    }
  }

  return [];
}

async function bootstrap() {
  const args = process.argv.slice(2);
  const targetArg = args[0] || 'all';
  const envArg = args[1] || 'full';

  console.log(`Starting Built-in Skill Provisioning command...`);
  console.log(`Target: ${targetArg}, Environment: ${envArg}`);

  const bundles = resolveTargetBundles(targetArg);
  if (bundles.length === 0) {
    console.error(`Error: No built-in skill bundles found matching '${targetArg}'.`);
    process.exit(1);
  }

  console.log(`Found ${bundles.length} bundle(s) to provision.`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const provisioningService = app.get(BuiltinSkillProvisioningService);
  const registryService = app.get(BuiltinSkillRegistryService);

  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ bundle: string; error: string }> = [];

  for (let i = 0; i < bundles.length; i++) {
    const bundleDir = bundles[i];
    const bundleName = path.basename(bundleDir);
    console.log(`[${i + 1}/${bundles.length}] Provisioning ${bundleName}...`);

    try {
      const result = await provisioningService.provisionBundle(bundleDir, envArg);
      const isUntested =
        envArg === 'bootstrap' || process.env.BUILTIN_SKILL_PROVISION_SKIP_SMOKE === 'true';
      if (isUntested && process.env.BUILTIN_SKILL_AUTO_ACTIVATE !== 'true') {
        console.log(
          `  -> Registered ${result.skill.capabilityKey} v${result.version.definitionVersion} (untested; activation deferred)`
        );
      } else {
        await registryService.activateVersion(
          result.skill.capabilityKey,
          result.version.definitionVersion
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
