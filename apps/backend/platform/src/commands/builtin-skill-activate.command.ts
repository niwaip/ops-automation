import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BuiltinSkillRegistryService } from '@ops/skill-registry/builtin';

async function bootstrap() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ts-node builtin-skill-activate.command.ts <capabilityKey> <version> [environment]');
    process.exit(1);
  }

  const capabilityKey = args[0];
  const targetVersion = args[1];
  const environment = args[2] || 'production';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const registryService = app.get(BuiltinSkillRegistryService);

  const skill = await registryService.findSkillByKey(capabilityKey);
  if (!skill) {
    console.error(`Skill '${capabilityKey}' not found`);
    await app.close();
    process.exit(1);
  }

  const version = skill.versions.find((v: any) => v.definitionVersion === targetVersion);
  if (!version) {
    console.error(`Version '${targetVersion}' not found for skill '${capabilityKey}'`);
    await app.close();
    process.exit(1);
  }

  await registryService.activateVersion(capabilityKey, targetVersion, environment);
  console.log(`Successfully activated Built-in Skill '${capabilityKey}' version '${targetVersion}'`);

  await app.close();
}

bootstrap().catch(err => {
  console.error('Activation failed:', err);
  process.exit(1);
});
