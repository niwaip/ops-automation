import { NestFactory } from '@nestjs/core';
import * as path from 'path';
import { AppModule } from '../app.module';
import { BuiltinSkillProvisioningService, BuiltinSkillRegistryService } from '@ops/skill-registry/builtin';

async function bootstrap() {
  const args = process.argv.slice(2);
  const rawBundle = args[0] || 'builtin-skills/platform.document.markdown-artifact-writer';
  const bundleArg = path.isAbsolute(rawBundle) ? rawBundle : path.resolve(process.cwd(), rawBundle);
  const envArg = args[1] || 'full';

  console.log(`Starting Built-in Skill Provisioning command...`);
  console.log(`Bundle Path: ${bundleArg}, Environment: ${envArg}`);

  const app = await NestFactory.createApplicationContext(AppModule);
  const provisioningService = app.get(BuiltinSkillProvisioningService);
  const registryService = app.get(BuiltinSkillRegistryService);

  try {
    const result = await provisioningService.provisionBundle(bundleArg, envArg);
    console.log(`Successfully provisioned built-in skill:`);
    console.log(JSON.stringify(result, null, 2));

    await registryService.activateVersion(result.skill.capabilityKey, result.version.definitionVersion);
    console.log(`Successfully activated built-in skill version ${result.version.definitionVersion}`);

    await app.close();
    process.exit(0);
  } catch (err: any) {
    console.error(`Provisioning failed: ${err.message}`, err.stack);
    await app.close();
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}
